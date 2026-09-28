import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ChevronDown,
  ChevronUp,
  Gauge,
  Inbox,
  LoaderCircle,
  Lock,
  Printer,
  Tag,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { CanalCalienteIcon } from '@/components/icons/CanalCalienteIcon';
import { useBascula } from '@/components/bascula/Bascula';
import { PrinterConexion } from '@/components/printer/PrinterConexion';
import { cn, plantToday as today, soloDecimal } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import {
  useCanalLotes,
  useCanalLoteDetail,
  useCanalPiezas,
  useSetCanalTipo,
  useRegistrarCanal,
  useDeshacerCanal,
  useClasificarAnimal,
  useClasificarPieza,
  CANAL_TIPO_LABEL,
  CANAL_ANIMAL_TIPO_LABEL,
  PIEZA_LABEL,
  BODEGAS,
  useClientesBodega,
  CAVAS,
  type CanalAnimal,
  type CanalAnimalTipo,
  type CanalLote,
  type CanalLoteDetail,
  type CanalPiezaTipo,
  type CanalTipo,
} from './api';
import canalTodoImg from './canal-todo.png';
import canalCizqImg from './canal-cizq.png';
import canalCderImg from './canal-cder.png';
import { imprimirPresintoDirecto } from './canal-presinto-zpl';
import { codigoBarras, type PresintoTicketData } from './canal-presinto-print';

const CANAL_IMG: Record<CanalPiezaTipo, string> = {
  canal: canalTodoImg,
  cizq: canalCizqImg,
  cder: canalCderImg,
};

type Tab = 'ordenes' | 'canales' | 'animales' | 'reporte';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'ORDENES' },
  { key: 'canales', label: 'CANALES / CUARTOS' },
  { key: 'animales', label: 'ANIMALES' },
  { key: 'reporte', label: 'REPORTE' },
];

function codigoAnimal(sequence: number) {
  return `A${String(sequence).padStart(2, '0')}`;
}

const TIPOS: { key: CanalTipo; label: string; hint: string }[] = [
  { key: 'canal_completa', label: 'Canal completa', hint: '1 pieza por animal' },
  {
    key: 'media_canal_con_cola',
    label: 'Media canal con cola',
    hint: '2 piezas: CIZQ y CDER',
  },
  {
    key: 'media_canal_sin_cola',
    label: 'Media canal sin cola',
    hint: '2 piezas: CIZQ y CDER',
  },
];

function hora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Pieza recién registrada en la báscula, para clasificarla e imprimirla sin esperar a recargar la orden. */
type PiezaNueva = {
  piezaId: string;
  pesoKg: number;
  pieza: CanalPiezaTipo;
  eventoId: string;
};

/** Animal con una media canal ya pesada y la otra mitad pendiente. */
function mediaIncompleta(detail: CanalLoteDetail | undefined) {
  return detail?.animales.find(
    (a) =>
      !!a.canalTipo &&
      a.canalTipo !== 'canal_completa' &&
      a.piezas.some((p) => p.pesado) &&
      a.piezas.some((p) => !p.pesado),
  );
}

/** Siguiente animal con trabajo pendiente: sin tipo asignado (pieza null) o con una pieza sin pesar. */
function siguienteObjetivo(detail: CanalLoteDetail | undefined) {
  if (!detail) return null;
  // Primero se termina la mitad que le falta a un animal ya empezado.
  const incompleto = mediaIncompleta(detail);
  if (incompleto) {
    const pieza = incompleto.piezas.find((p) => !p.pesado)!;
    return { animal: incompleto, pieza: pieza.pieza as CanalPiezaTipo | null };
  }
  for (const animal of detail.animales) {
    if (!animal.canalTipo) return { animal, pieza: null as CanalPiezaTipo | null };
    const pieza = animal.piezas.find((p) => !p.pesado);
    if (pieza) return { animal, pieza: pieza.pieza as CanalPiezaTipo | null };
  }
  return null;
}

/** Último animal registrado de la orden (para clasificarlo aunque ya esté pesado). */
function siguienteObjetivoAnimal(detail: CanalLoteDetail | undefined) {
  if (!detail || !detail.animales.length) return null;
  return detail.animales[detail.animales.length - 1];
}

export function CanalCalientePage() {
  const [date, setDate] = useState(today());
  const [tab, setTab] = useState<Tab>('ordenes');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const lotes = useCanalLotes(date);
  const detail = useCanalLoteDetail(selectedId);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Puente para que el botón de etiqueta del pie (compartido entre pestañas)
  // dispare "guardar clasificación + imprimir presinto" cuando se está en
  // la pestaña ANIMALES.
  const animalesImprimirRef = useRef<
    ((nueva?: PiezaNueva) => void) | null
  >(null);
  // Animal que se acaba de pesar: al redirigir a ANIMALES tras pesarlo, debe
  // mostrarse ESE animal (para clasificarlo), no el siguiente pendiente de
  // pesar (que todavía no tiene ninguna pieza y por eso no deja elegir
  // bodega/cava). Se limpia si el operario cambia de pestaña manualmente.
  const [ultimoPesadoId, setUltimoPesadoId] = useState<string | null>(null);
  // Permite elegir libremente CIZQ o CDER como la pieza a pesar primero (por
  // defecto siguienteObjetivo asume CIZQ primero, pero cada lado es una
  // opción independiente y el operario puede pesar cualquiera primero).
  const [piezaOverride, setPiezaOverride] = useState<{
    eventoId: string;
    pieza: CanalPiezaTipo;
  } | null>(null);
  // Refleja si el presinto se está enviando a imprimir, para que el botón de
  // etiqueta del pie muestre "cargando" y no se pueda disparar dos veces.
  const [imprimiendo, setImprimiendo] = useState(false);
  // Último presinto impreso: vive en el padre (no en AnimalesTab) porque esa
  // pestaña se desmonta al cambiar de tab, y el pesaje+impresión puede
  // dispararse desde CANALES, perdiendo el estado si viviera ahí.
  const [ultimoPresinto, setUltimoPresinto] =
    useState<PresintoTicketData | null>(null);
  const [alerta, setAlerta] = useState<{ texto: string; id: number } | null>(null);
  useEffect(() => {
    if (!alerta) return;
    const t = setTimeout(() => setAlerta(null), 4000);
    return () => clearTimeout(t);
  }, [alerta]);
  const mostrarAlerta = (texto: string) => setAlerta({ texto, id: Date.now() });

  const lista = lotes.data ?? [];
  const selectedLote = lista.find((l) => l.ordenBeneficioId === selectedId);
  const cliente = detail.data?.cliente ?? selectedLote?.cliente ?? '';

  const objetivoBase = useMemo(
    () => siguienteObjetivo(detail.data),
    [detail.data],
  );
  const objetivo = useMemo(() => {
    // Si el operario tocó explícitamente un recuadro (Completo/CIZQ/CDER),
    // esa elección manda siempre, sea o no el animal/pieza "por defecto"
    // (el operario puede corregir cualquier animal, no solo el siguiente
    // pendiente), mientras esa pieza siga sin pesar.
    if (piezaOverride) {
      const animal = detail.data?.animales.find(
        (a) => a.eventoId === piezaOverride.eventoId,
      );
      const elegida = animal?.piezas.find((p) => p.pieza === piezaOverride.pieza);
      // Si la pieza aún no aparece (el cambio de tipo va en camino), se respeta igual para evitar parpadeos.
      if (animal && !elegida?.pesado) {
        return { animal, pieza: piezaOverride.pieza };
      }
    }
    if (!objetivoBase) return objetivoBase;
    const { animal } = objetivoBase;
    const pendientes = animal.piezas.filter((p) => !p.pesado);
    // Con CIZQ y CDER pendientes a la vez no hay un lado "por defecto": se
    // espera que el operario elija cuál pesar primero con un click explícito.
    if (pendientes.length > 1) return { animal, pieza: null };
    return objetivoBase;
  }, [objetivoBase, piezaOverride, detail.data]);
  useEffect(() => {
    setPiezaOverride(null);
  }, [objetivoBase?.animal.eventoId]);
  // Prioriza el animal recién pesado (para clasificarlo); si no hay uno
  // reciente, cae al comportamiento normal (siguiente pendiente / último).
  const animalParaClasificar =
    detail.data?.animales.find((a) => a.eventoId === ultimoPesadoId) ??
    objetivo?.animal ??
    siguienteObjetivoAnimal(detail.data);

  function seleccionarOrden(ordenBeneficioId: string, _tipo: CanalTipo | null) {
    setSelectedId(ordenBeneficioId);
    setTab('canales');
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-5xl flex-col gap-2 p-2">
      {/* Encabezado: icono, fecha y cliente */}
      <div className="flex items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <CanalCalienteIcon className="size-10 text-foreground" />
        </div>
        <FieldBox label="Fecha:">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value || today());
              setSelectedId(null);
            }}
            className="h-9 w-40 bg-transparent text-lg font-semibold outline-none"
          />
        </FieldBox>
        <FieldBox label="Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {cliente || '—'}
          </div>
        </FieldBox>
      </div>

      {/* Pestañas */}
      <div className="flex overflow-hidden rounded-sm border-2 border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setUltimoPesadoId(null);
              setTab(t.key);
            }}
            className={cn(
              'flex-1 border-r-2 border-border px-3 py-3 text-center text-sm font-semibold uppercase tracking-wide transition-colors last:border-r-0',
              tab === t.key
                ? 'bg-background text-foreground shadow-[inset_0_-3px_0_0] shadow-emerald-600'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto rounded-sm border-2 border-border bg-card"
      >
        {tab === 'ordenes' && (
          <OrdenesTab
            loading={lotes.isLoading}
            lotes={lista}
            selectedId={selectedId}
            onSelect={seleccionarOrden}
          />
        )}
        {tab === 'canales' && (
          <CanalesTab
            date={date}
            detail={detail.data}
            objetivo={objetivo}
            onSelectPieza={(eventoId, pieza) =>
              setPiezaOverride({ eventoId, pieza })
            }
            onPiezaSeleccionada={() => setTab('animales')}
            onAlerta={mostrarAlerta}
          />
        )}
        {tab === 'animales' && (
          <AnimalesTab
            date={date}
            detail={detail.data}
            objetivoAnimal={animalParaClasificar}
            imprimiendo={imprimiendo}
            setImprimiendo={setImprimiendo}
            ultimoPresinto={ultimoPresinto}
            setUltimoPresinto={setUltimoPresinto}
            onAlerta={mostrarAlerta}
            onAnimalTerminado={(ordenTerminada) => {
              setUltimoPesadoId(null);
              setTab(ordenTerminada ? 'reporte' : 'canales');
            }}
            registerGuardarEImprimir={(fn) => {
              animalesImprimirRef.current = fn;
            }}
          />
        )}
        {tab === 'reporte' && <ReporteTab date={date} />}
      </div>

      {/* Botones de desplazamiento */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => scrollList(-1)}
          className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
          aria-label="Subir"
        >
          <ChevronUp className="size-7" />
        </button>
        <button
          onClick={() => scrollList(1)}
          className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
          aria-label="Bajar"
        >
          <ChevronDown className="size-7" />
        </button>
      </div>

      {/* Pie: báscula */}
      <FooterBascula
        tab={tab}
        setTab={setTab}
        detail={detail.data}
        objetivo={objetivo}
        imprimiendo={imprimiendo}
        onEtiquetaAnimales={(nueva) => animalesImprimirRef.current?.(nueva)}
        onPesado={setUltimoPesadoId}
        onAlerta={mostrarAlerta}
      />

      {alerta && (
        <div
          key={alerta.id}
          className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
        >
          <div
            role="alert"
            className="flex max-w-md items-start gap-3 rounded-md border-2 border-amber-400 bg-card px-5 py-4 shadow-2xl"
          >
            <TriangleAlert className="mt-0.5 size-7 shrink-0 text-amber-500" />
            <p className="text-base font-semibold text-foreground">{alerta.texto}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldBox({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative rounded-sm border-2 border-border bg-card px-3 pb-1 pt-1',
        className,
      )}
    >
      <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Campo "Bodegas": la pieza se asigna al cliente que la compró, aunque ese
 * cliente luego la revenda a otro (la canal sigue figurando a nombre del
 * comprador principal; el revendido se anota aparte en "Destino"). Es texto
 * libre con sugerencias (clientes reales + las 3 bodegas fijas históricas)
 * para no depender de una lista cerrada: si hay un cliente nuevo, se escribe
 * y listo, no hace falta "crear" la bodega en ningún lado.
 */
function BodegaField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const clientes = useClientesBodega('');
  const opciones = useMemo(() => {
    const nombres = (clientes.data ?? []).map((c) => c.concepto);
    return Array.from(new Set([...BODEGAS, ...nombres]));
  }, [clientes.data]);

  return (
    <>
      <input
        list="bodegas-opciones"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cliente / bodega…"
        className="h-9 w-full bg-transparent text-base font-medium outline-none"
      />
      <datalist id="bodegas-opciones">
        {opciones.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

function OrdenesTab({
  loading,
  lotes,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  lotes: CanalLote[];
  selectedId: string | null;
  onSelect: (id: string, tipo: CanalTipo | null) => void;
}) {
  if (loading) return <Loading />;
  if (!lotes.length)
    return (
      <Empty text="No hay órdenes sacrificadas en esta fecha. Cuando una orden termine en Sacrificio aparecerá aquí." />
    );
  return (
    <ul className="flex flex-col gap-2 p-2">
      {lotes.map((l) => {
        const activo = l.ordenBeneficioId === selectedId;
        const completo =
          l.piezasEsperadas > 0 && l.piezasPesadas >= l.piezasEsperadas;
        return (
          <li key={l.ordenBeneficioId}>
            <button
              onClick={() => onSelect(l.ordenBeneficioId, null)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm border-2 px-4 py-4 text-left text-lg font-medium transition-colors',
                activo
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <span>
                <span className="font-bold tabular-nums">{formatOB(l.reference)}</span>{' '}
                <span className="text-muted-foreground">|</span>{' '}
                {l.clienteNit ? `${l.clienteNit} - ` : ''}
                {l.cliente}
              </span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="tabular-nums">
                  {l.piezasPesadas}/{l.piezasEsperadas || '—'}
                </span>
                {completo && (
                  <span className="font-semibold text-emerald-600">✓</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const CANAL_PANELS: {
  pieza: CanalPiezaTipo;
  title: string;
  double?: boolean;
  mirror?: boolean;
}[] = [
  { pieza: 'canal', title: 'Completo (TODO)', double: true },
  { pieza: 'cizq', title: 'Canal Izquierda (CIZQ)' },
  { pieza: 'cder', title: 'Canal Derecha (CDER)', mirror: true },
];

/**
 * El tipo de canal se elige tocando el recuadro: TODO = completa, CIZQ/CDER
 * = media canal (ambos son la MISMA clasificación: cada uno es una pieza
 * independiente que se puede pesar en cualquier orden; con/sin cola es una
 * clasificación aparte, ver `conCola`).
 */
const PANEL_TIPO: Record<CanalPiezaTipo, CanalTipo> = {
  canal: 'canal_completa',
  cizq: 'media_canal',
  cder: 'media_canal',
};

function CanalesTab({
  date,
  detail,
  objetivo,
  onSelectPieza,
  onPiezaSeleccionada,
  onAlerta,
}: {
  date: string;
  detail: CanalLoteDetail | undefined;
  objetivo: { animal: CanalAnimal; pieza: CanalPiezaTipo | null } | null;
  onSelectPieza: (eventoId: string, pieza: CanalPiezaTipo) => void;
  onPiezaSeleccionada: () => void;
  onAlerta: (texto: string) => void;
}) {
  const setTipo = useSetCanalTipo();
  // Animal cuyo TIPO de canal se está editando: por defecto el siguiente
  // pendiente de pesar (objetivo), pero el operario puede elegir cualquier
  // otro animal que aún no tenga NINGUNA pieza pesada (el backend permite
  // cambiar el tipo libremente en ese caso) para corregirlo sin depender de
  // que "objetivo" avance hasta ahí.
  const [overrideId, setOverrideId] = useState<string | null>(null);

  if (!detail)
    return (
      <Empty text="Selecciona una orden en la pestaña ORDENES para ver los canales." />
    );

  const editables = detail.animales.filter((a) =>
    a.piezas.every((p) => !p.pesado),
  );
  const incompleto = mediaIncompleta(detail);
  const animal =
    incompleto ??
    editables.find((a) => a.eventoId === overrideId) ??
    objetivo?.animal;
  const completos = detail.animales.filter(
    (a) => a.piezas.length > 0 && a.piezas.every((p) => p.pesado),
  ).length;
  const faltaPieza = incompleto?.piezas.find((p) => !p.pesado)?.pieza;
  const permitida = (pieza: CanalPiezaTipo) =>
    incompleto ? pieza === faltaPieza : editables.length > 0;

  function elegir(pieza: CanalPiezaTipo) {
    if (incompleto) {
      const cod = codigoAnimal(incompleto.sequence);
      const pesada = incompleto.piezas.find((p) => p.pesado)!;
      const falta = incompleto.piezas.find((p) => !p.pesado)!;
      if (pieza !== falta.pieza) {
        onAlerta(
          pieza === 'canal'
            ? `El animal ${cod} ya tiene la ${PIEZA_LABEL[pesada.pieza]} pesada: no puede ser canal completa. Falta la ${PIEZA_LABEL[falta.pieza]}.`
            : `La ${PIEZA_LABEL[pieza]} del animal ${cod} ya fue pesada. Falta la ${PIEZA_LABEL[falta.pieza]}.`,
        );
        return;
      }
      onSelectPieza(incompleto.eventoId, pieza);
      onPiezaSeleccionada();
      return;
    }
    const destino =
      animal && animal.piezas.every((p) => !p.pesado)
        ? animal
        : editables[0];
    if (!destino) {
      onAlerta(`La orden ya tiene sus ${detail!.animales.length} canales pesados.`);
      return;
    }
    onSelectPieza(destino.eventoId, pieza);
    if (PANEL_TIPO[pieza] !== destino.canalTipo) {
      setTipo.mutate(
        { eventoId: destino.eventoId, tipo: PANEL_TIPO[pieza] },
        {
          onError: (err) => {
            onAlerta(
              isAxiosError(err) &&
                typeof err.response?.data?.message === 'string'
                ? err.response.data.message
                : 'No se pudo cambiar el tipo de canal.',
            );
          },
        },
      );
    }
    onPiezaSeleccionada();
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {!incompleto && editables.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            Corregir tipo de:
          </span>
          {editables.map((a) => (
            <button
              key={a.eventoId}
              type="button"
              onClick={() => setOverrideId(a.eventoId)}
              className={cn(
                'rounded-sm border-2 px-2 py-0.5 text-xs font-semibold transition-colors',
                a.eventoId === animal?.eventoId
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              {codigoAnimal(a.sequence)}
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {!animal ? (
          <>Todas las piezas de la orden fueron pesadas.</>
        ) : incompleto ? (
          <>
            Animal{' '}
            <span className="font-bold text-foreground">
              {codigoAnimal(incompleto.sequence)}
            </span>{' '}
            — Falta la{' '}
            <span className="font-bold text-foreground">
              {PIEZA_LABEL[incompleto.piezas.find((p) => !p.pesado)!.pieza]}
            </span>
          </>
        ) : !animal.canalTipo ? (
          <>
            Animal{' '}
            <span className="font-bold text-foreground">
              {codigoAnimal(animal.sequence)}
            </span>{' '}
            — Toca un recuadro para elegir el tipo de canal.
          </>
        ) : (
          <>
            Animal{' '}
            <span className="font-bold text-foreground">
              {codigoAnimal(animal.sequence)}
            </span>{' '}
            — Orden{' '}
            <span className="font-bold text-foreground">{detail.reference}</span>
          </>
        )}
        <span className="ml-2">
          · Canales completos:{' '}
          <span className="font-bold text-foreground">
            {completos} de {detail.animales.length}
          </span>
        </span>
      </p>

      <div className="grid grid-cols-3 gap-3">
        {CANAL_PANELS.map(({ pieza, title }) => {
          return (
            <button
              key={pieza}
              type="button"
              onClick={() => elegir(pieza)}
              disabled={setTipo.isPending}
              className="flex flex-col items-center gap-2 rounded-sm border-2 border-border bg-card p-3 text-center transition-colors hover:border-emerald-400 disabled:hover:border-border"
            >
              <span className="text-sm font-semibold">{title}:</span>
              <div className="flex h-80 items-end justify-center">
                <img
                  src={CANAL_IMG[pieza]}
                  alt={title}
                  draggable={false}
                  className={cn(
                    'h-full w-auto object-contain transition',
                    !permitida(pieza) && 'grayscale',
                  )}
                />
              </div>
              <div className="h-6 text-center">
                <span className="text-xs text-muted-foreground">
                  {PIEZA_LABEL[pieza]}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AnimalesTab({
  date,
  detail,
  objetivoAnimal,
  imprimiendo,
  setImprimiendo,
  ultimoPresinto,
  setUltimoPresinto,
  onAlerta,
  onAnimalTerminado,
  registerGuardarEImprimir,
}: {
  date: string;
  detail: CanalLoteDetail | undefined;
  objetivoAnimal: CanalAnimal | null;
  imprimiendo: boolean;
  setImprimiendo: (v: boolean) => void;
  ultimoPresinto: PresintoTicketData | null;
  setUltimoPresinto: (d: PresintoTicketData | null) => void;
  onAlerta: (texto: string) => void;
  onAnimalTerminado: (ordenTerminada: boolean) => void;
  registerGuardarEImprimir: (
    fn: (nueva?: PiezaNueva) => void,
  ) => void;
}) {
  const clasificar = useClasificarAnimal();
  const clasificarPieza = useClasificarPieza();
  const [tipo, setTipoLocal] = useState<CanalAnimalTipo | ''>('');
  const [expendio, setExpendio] = useState('');
  const [bodega, setBodega] = useState('');
  const [cava, setCava] = useState('');
  const [destino, setDestino] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [cavaError, setCavaError] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printOk, setPrintOk] = useState<string | null>(null);

  const eventoId = objetivoAnimal?.eventoId ?? null;

  // Los campos se editan localmente y solo se guardan al presionar "Guardar
  // clasificación": se recargan desde el animal cada vez que se cambia de
  // animal, para no arrastrar lo que se estaba editando de otro.
  useEffect(() => {
    setTipoLocal(objetivoAnimal?.canalAnimalTipo ?? '');
    setExpendio(objetivoAnimal?.expendio ?? '');
    setBodega('');
    setCava('');
    setDestino('');
    setObservaciones('');
    setCavaError(null);
    setGuardadoOk(false);
  }, [eventoId]);

  // La segunda mitad de una media canal queda obligada al tipo que ya se le dio a la primera.
  const tipoBloqueado =
    objetivoAnimal?.canalAnimalTipo &&
    objetivoAnimal.canalTipo !== 'canal_completa' &&
    objetivoAnimal.piezas.some((p) => p.pesado) &&
    objetivoAnimal.piezas.some((p) => !p.pesado)
      ? objetivoAnimal.canalAnimalTipo
      : null;
  useEffect(() => {
    if (tipoBloqueado) setTipoLocal(tipoBloqueado);
  }, [tipoBloqueado]);

  function elegirTipo(t: CanalAnimalTipo) {
    if (tipoBloqueado && t !== tipoBloqueado) {
      onAlerta(
        `La otra mitad del animal ${codigoAnimal(objetivoAnimal!.sequence)} ya se marcó como ${CANAL_ANIMAL_TIPO_LABEL[tipoBloqueado]}: esta mitad debe ser igual.`,
      );
      return;
    }
    setTipoLocal(t);
  }

  /** Guarda tipo/expendio/bodega/cava; onDone se llama solo si todo salió bien.
   * `piezaIdParaClasificar` permite clasificar una pieza que se acaba de
   * registrar (recién pesada), sin necesitar seleccionarla de la lista. */
  function guardarClasificacion(
    piezaIdParaClasificar: string | null,
    onDone?: () => void,
  ) {
    if (!eventoId) return;
    setCavaError(null);
    setGuardadoOk(false);
    clasificar.mutate({ eventoId, tipo: tipo || undefined, expendio });
    if (!piezaIdParaClasificar) {
      setGuardadoOk(true);
      onDone?.();
      return;
    }
    clasificarPieza.mutate(
      { piezaId: piezaIdParaClasificar, bodega, cava, destino, observaciones },
      {
        onSuccess: () => {
          setGuardadoOk(true);
          onDone?.();
        },
        onError: (err) => {
          const detail = (
            err as { response?: { data?: { message?: string | string[] } } }
          ).response?.data?.message;
          setCavaError(
            Array.isArray(detail)
              ? detail.join(' ')
              : detail || 'No se pudo guardar la clasificación.',
          );
        },
      },
    );
  }

  /** Envía un ticket a imprimir y actualiza los estados de resultado/último precinto. */
  function imprimirTicket(d: PresintoTicketData, alTerminarAnimal?: () => void) {
    setPrintError(null);
    setPrintOk(null);
    setImprimiendo(true);
    imprimirPresintoDirecto(d).then((r) => {
      setImprimiendo(false);
      if (r.ok && r.directo) {
        setUltimoPresinto(d);
        setPrintOk('Presinto enviado a la impresora.');
      } else {
        const msg = `Se descargó el .zpl (no se imprimió directo): ${r.error ?? ''}`;
        setPrintError(msg);
        // Al salir de esta pestaña el mensaje en pantalla se perdería.
        if (alTerminarAnimal) onAlerta(msg);
      }
      alTerminarAnimal?.();
    });
  }

  /** Reimprime el último presinto (por si la impresora falló y no sacó el ticket). */
  function reimprimirUltimo() {
    if (ultimoPresinto) imprimirTicket(ultimoPresinto);
  }

  // El botón de etiqueta del pie de página (compartido entre pestañas)
  // dispara esta acción: clasifica la pieza recién pesada con lo que ya se
  // haya digitado (bodega/cava/destino) y la imprime de una vez.
  useEffect(() => {
    registerGuardarEImprimir((nueva) => {
      const piezaIdParaClasificar = nueva?.piezaId ?? null;
      guardarClasificacion(piezaIdParaClasificar, () => {
        if (!detail || !nueva) return;
        // La lista local aún no trae la pieza recién pesada: se usan los datos que manda el pie.
        const animal =
          detail.animales.find((a) => a.eventoId === nueva.eventoId) ?? objetivoAnimal;
        if (!animal?.canalTipo) return;
        const animalTerminado = animal.piezas.every(
          (p) => p.pieza === nueva.pieza || p.pesado,
        );
        const ordenTerminada =
          animalTerminado &&
          detail.animales.every(
            (a) =>
              a.eventoId === animal.eventoId ||
              (a.piezas.length > 0 && a.piezas.every((p) => p.pesado)),
          );
        const [y, m, d] = date.split('-');
        imprimirTicket({
          fechaSacrificio: `${d}/${m}/${y}`,
          lote: detail.reference,
          guia: detail.guias.join(', ') || '—',
          expendio,
          cliente: detail.cliente,
          tipoAnimal: tipo ? CANAL_ANIMAL_TIPO_LABEL[tipo] : '—',
          ref: animal.consecutivo,
          // El turno ya es el mismo consecutivo del animal (ver backend).
          turno: animal.consecutivo,
          pesoKg: nueva.pesoKg,
          canalTipo: animal.canalTipo,
          conCola: animal.conCola,
          pieza: nueva.pieza,
        }, animalTerminado ? () => onAnimalTerminado(ordenTerminada) : undefined);
      });
    });
  });

  if (!detail || !objetivoAnimal) {
    return (
      <Empty text="Selecciona una orden en la pestaña ORDENES para clasificar sus animales." />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PrinterConexion />
      <div className="flex flex-1 flex-col gap-4 p-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">
          Tipos:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {(['vaca', 'novilla'] as CanalAnimalTipo[]).map((t) => (
            <TipoButton
              key={t}
              tipo={t}
              activo={tipo === t}
              bloqueado={!!tipoBloqueado && t !== tipoBloqueado}
              onClick={() => elegirTipo(t)}
            />
          ))}
          <div className="w-4" />
          {(['toro', 'novillo'] as CanalAnimalTipo[]).map((t) => (
            <TipoButton
              key={t}
              tipo={t}
              activo={tipo === t}
              bloqueado={!!tipoBloqueado && t !== tipoBloqueado}
              onClick={() => elegirTipo(t)}
            />
          ))}
          <div className="w-4" />
          {(['bufala', 'bufalo'] as CanalAnimalTipo[]).map((t) => (
            <TipoButton
              key={t}
              tipo={t}
              activo={tipo === t}
              bloqueado={!!tipoBloqueado && t !== tipoBloqueado}
              onClick={() => elegirTipo(t)}
            />
          ))}
        </div>
      </div>

      <FieldBox label="Expendio:" className="max-w-xs">
        <input
          value={expendio}
          onChange={(e) => setExpendio(e.target.value)}
          placeholder="Ej: PIPO F"
          className="h-9 w-full bg-transparent text-base font-medium outline-none"
        />
      </FieldBox>

      <fieldset
        disabled={!eventoId}
        className="contents disabled:opacity-40"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBox label="Bodegas:">
            <BodegaField value={bodega} onChange={setBodega} />
          </FieldBox>
          <FieldBox label="Destino:">
            <textarea
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              rows={1}
              className="w-full resize-none bg-transparent text-base outline-none"
            />
          </FieldBox>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              Cavas de Canales:
            </p>
            <div className="flex flex-wrap gap-2">
              {CAVAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCava(c)}
                  className={cn(
                    'rounded-sm border-2 px-3 py-2 text-sm font-semibold uppercase',
                    cava === c
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <FieldBox label="Observaciones:" className="relative">
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={1}
              className="w-full resize-none bg-transparent pr-10 text-base outline-none"
            />
            <Lock className="absolute right-2 top-1 size-5 text-muted-foreground" />
          </FieldBox>
        </div>
      </fieldset>

      <FieldBox label="Último precinto:" className="max-w-xs">
        <button
          type="button"
          disabled={!ultimoPresinto || imprimiendo}
          onClick={reimprimirUltimo}
          title="Volver a imprimir este presinto"
          className="flex h-9 w-full items-center justify-between gap-2 bg-transparent text-left text-base font-semibold tabular-nums outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
        >
          {ultimoPresinto ? codigoBarras(ultimoPresinto) : '—'}
          <Printer className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </FieldBox>

      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {clasificar.isPending || clasificarPieza.isPending
            ? 'Guardando…'
            : 'Usa el botón de etiqueta del pie para guardar la clasificación.'}
        </p>
        {cavaError && (
          <p className="text-sm font-medium text-red-600">{cavaError}</p>
        )}
        {printError && (
          <p className="text-sm font-medium text-amber-600">{printError}</p>
        )}
        {printOk && (
          <p className="text-sm font-medium text-emerald-600">{printOk}</p>
        )}
        {imprimiendo && (
          <p className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Imprimiendo…
          </p>
        )}
        {guardadoOk && !cavaError && (
          <p className="text-sm font-medium text-emerald-600">
            Clasificación guardada.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}

function TipoButton({
  tipo,
  activo,
  bloqueado = false,
  onClick,
}: {
  tipo: CanalAnimalTipo;
  activo: boolean;
  bloqueado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-sm border-2 px-4 py-2 text-sm font-semibold uppercase',
        activo
          ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
          : 'border-border bg-card hover:bg-muted',
        bloqueado && 'bg-muted text-muted-foreground opacity-50',
      )}
    >
      {CANAL_ANIMAL_TIPO_LABEL[tipo]}
    </button>
  );
}

function ReporteTab({ date }: { date: string }) {
  const piezas = useCanalPiezas(date);
  const rows = piezas.data ?? [];
  if (piezas.isLoading) return <Loading />;
  const hayDatos = rows.length > 0;
  return (
    <div className="flex h-full flex-col p-2">
      <div className="flex-1 overflow-auto">
        {!hayDatos ? (
          <Empty text="Sin datos para el reporte de esta fecha." />
        ) : (
          <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                  <th>Animal</th>
                  <th>Turno</th>
                  <th>Barcode</th>
                  <th className="text-right">Cant.(kg)</th>
                  <th>Tipo</th>
                  <th>Destino</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.piezaId} className="[&>td]:px-3 [&>td]:py-2">
                    <td className="font-semibold tabular-nums">
                      {codigoAnimal(p.sequence)}
                    </td>
                    <td className="tabular-nums">{p.turno ?? '—'}</td>
                    <td className="tabular-nums">
                      {p.canalTipo
                        ? codigoBarras({
                            lote: p.reference,
                            turno: p.turno ?? p.consecutivo,
                            canalTipo: p.canalTipo,
                            pieza: p.pieza,
                          })
                        : '—'}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {p.pesoKg.toFixed(2)}
                    </td>
                    <td>
                      {p.canalAnimalTipo
                        ? CANAL_ANIMAL_TIPO_LABEL[p.canalAnimalTipo]
                        : '—'}
                    </td>
                    <td>{p.destino || '—'}</td>
                    <td>{p.observaciones || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>

      <div className="mt-2 flex items-center justify-end gap-2 self-end">
        <span className="text-sm font-medium text-muted-foreground">
          Reimpresión de Brazalete:
        </span>
        <button
          type="button"
          disabled={!hayDatos}
          onClick={() => window.print()}
          title="Reimprimir brazalete de canales del último animal"
          className="rounded-sm border-2 border-border bg-card px-4 py-2 text-sm font-semibold uppercase hover:bg-muted disabled:opacity-50"
        >
          Canales
        </button>
        <button
          type="button"
          disabled={!hayDatos}
          onClick={() => window.print()}
          title="Reimprimir brazalete de vísceras del último animal"
          className="rounded-sm border-2 border-border bg-card px-4 py-2 text-sm font-semibold uppercase hover:bg-muted disabled:opacity-50"
        >
          Vísceras
        </button>
      </div>
    </div>
  );
}

function FooterBascula({
  tab,
  setTab,
  detail,
  objetivo,
  imprimiendo,
  onEtiquetaAnimales,
  onPesado,
  onAlerta,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  detail: CanalLoteDetail | undefined;
  objetivo: { animal: CanalAnimal; pieza: CanalPiezaTipo | null } | null;
  imprimiendo: boolean;
  onEtiquetaAnimales: (nueva?: PiezaNueva) => void;
  onPesado: (eventoId: string) => void;
  onAlerta: (texto: string) => void;
}) {
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const registrar = useRegistrarCanal();

  const valor = Number(peso.replace(',', '.'));
  const puedePesar =
    !!objetivo?.pieza && peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  // Registra el peso de la pieza. `imprimir` solo se pasa true cuando lo
  // dispara el botón de etiqueta: ahí, además de registrar, encadena
  // clasificación + impresión con lo ya digitado en ANIMALES. Al registrar
  // con Enter/lectura de báscula (imprimir=false) solo se guarda el peso.
  function guardar(imprimir = false) {
    if (!objetivo?.pieza || !puedePesar || registrar.isPending) return;
    const eventoId = objetivo.animal.eventoId;
    const pieza = objetivo.pieza;
    registrar.mutate(
      {
        eventoId,
        pieza,
        pesoKg: valor,
      },
      {
        onSuccess: (data) => {
          const pesoRegistrado = valor;
          setPeso('0.0');
          onPesado(eventoId);
          setTab('animales');
          if (imprimir) {
            onEtiquetaAnimales({ piezaId: data.piezaId, pesoKg: pesoRegistrado, pieza, eventoId });
          }
        },
        onError: (err) => {
          onAlerta(
            isAxiosError(err) && typeof err.response?.data?.message === 'string'
              ? err.response.data.message
              : 'No se pudo registrar el peso.',
          );
        },
      },
    );
  }

  // El botón de etiqueta hace doble función: si hay un peso pendiente por
  // registrar lo registra primero (y encadena clasificación + impresión);
  // si no, guarda la clasificación actual e imprime.
  function etiqueta() {
    if (puedePesar) {
      guardar(true);
    } else {
      onEtiquetaAnimales();
    }
  }

  const piezaLabel = objetivo?.pieza ? PIEZA_LABEL[objetivo.pieza] : '—';
  const animalNo = objetivo ? codigoAnimal(objetivo.animal.sequence) : '—';
  const osNo = detail ? formatOB(detail.reference) : '—';
  const sinTipo = !!objetivo && !objetivo.pieza;
  const completo = !!detail && !objetivo;

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <FieldBox label="O.S No.:">
        <div className="flex h-10 min-w-24 items-center text-2xl font-bold tabular-nums">
          {osNo}
        </div>
      </FieldBox>
      <FieldBox label="Pieza:">
        <div className="flex h-10 min-w-20 items-center justify-center text-2xl font-bold text-red-600">
          {piezaLabel}
        </div>
      </FieldBox>
      <FieldBox label="Animal No.:">
        <div className="flex h-10 min-w-24 items-center justify-center text-2xl font-bold tabular-nums">
          {animalNo}
        </div>
      </FieldBox>
      <FieldBox label="Peso(kg):" className="flex-1">
        <input
          value={peso}
          onChange={(e) => setPeso(soloDecimal(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar();
          }}
          inputMode="decimal"
          placeholder="0.0"
          disabled={!objetivo}
          className="h-10 w-full bg-transparent text-center text-3xl font-bold text-emerald-700 outline-none disabled:opacity-50"
        />
      </FieldBox>

      <button
        onClick={leerBascula}
        disabled={leyendo || !objetivo}
        title="Leer báscula"
        className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        {leyendo ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : (
          <Gauge className="size-6" />
        )}
      </button>
      <button
        onClick={etiqueta}
        disabled={
          imprimiendo ||
          registrar.isPending ||
          (tab !== 'animales' && !puedePesar)
        }
        title={
          tab === 'animales'
            ? 'Guardar clasificación e imprimir presinto'
            : 'Registrar peso e ir a Animales'
        }
        className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        {imprimiendo || registrar.isPending ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : (
          <Tag className="size-6" />
        )}
      </button>

      {(error || sinTipo || completo) && (
        <div className="w-full">
          {error && (
            <p className="text-xs font-medium text-red-600">{error}</p>
          )}
          {sinTipo && (
            <p className="text-xs font-medium text-amber-600">
              Selecciona el tipo de canal de este animal para empezar a pesar.
            </p>
          )}
          {completo && (
            <p className="text-xs font-medium text-emerald-600">
              Todas las piezas de esta orden ya fueron pesadas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TipoDialog({
  ordenBeneficioId,
  current,
  onClose,
}: {
  ordenBeneficioId: string | null;
  current?: CanalTipo | null;
  onClose: () => void;
}) {
  const setTipo = useSetCanalTipo();
  return (
    <Dialog
      open={!!ordenBeneficioId}
      onClose={onClose}
      title="Tipo de canal"
      description="¿Cómo vas a pesar el canal de esta orden?"
      className="max-w-md"
    >
      <div className="grid gap-3">
        {TIPOS.map((t) => {
          const activo = current === t.key;
          return (
            <button
              key={t.key}
              disabled={setTipo.isPending}
              onClick={() =>
                ordenBeneficioId &&
                setTipo.mutate(
                  { ordenBeneficioId, tipo: t.key },
                  { onSuccess: onClose },
                )
              }
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-lg border-2 px-4 py-4 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50',
                activo
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-border bg-card',
                setTipo.isPending && 'opacity-60',
              )}
            >
              <span className="flex w-full items-center justify-between text-base font-semibold">
                {t.label}
                {activo && <span className="text-emerald-600">✓</span>}
              </span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" /> Cargando…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
      <Inbox className="size-6" />
      {text}
    </div>
  );
}

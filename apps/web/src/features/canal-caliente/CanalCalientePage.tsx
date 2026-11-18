import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Gauge,
  Inbox,
  LayoutGrid,
  List,
  LoaderCircle,
  Lock,
  Printer,
  RefreshCw,
  Search,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBascula } from '@/components/bascula/Bascula';
import { FechaFiltro } from '@/components/ui/fecha-filtro';
import { cn, formatFechaDia, plantToday as today, soloDecimal } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import { useBodegas } from '../clientes/api';
import {
  useCerrarCanalLote,
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
import { imprimirPresintoDirecto, type TipoPresinto } from './canal-presinto-zpl';
import { codigoBarras, type PresintoTicketData } from './canal-presinto-print';

const CANAL_IMG: Record<CanalPiezaTipo, string> = {
  canal: canalTodoImg,
  cizq: canalCizqImg,
  cder: canalCderImg,
};

type Tab = 'ordenes' | 'pesaje' | 'reporte';

type EstadoKey = 'proceso' | 'pendiente' | 'cerrar';

const ESTADOS: { key: EstadoKey; texto: string }[] = [
  { key: 'proceso', texto: 'En proceso' },
  { key: 'pendiente', texto: 'Sin iniciar' },
  { key: 'cerrar', texto: 'Para cerrar' },
];

const VISTA_KEY = 'canalCaliente.vistaOrdenes';

// Mismos umbrales del informe interno de canal caliente.
const RENDIMIENTO_MIN = 52;
const RENDIMIENTO_MAX = 60;

function estadoLote(l: CanalLote) {
  if (l.animalCount > 0 && l.animalesPesados >= l.animalCount) {
    return { key: 'cerrar' as EstadoKey, texto: 'Lista para cerrar', clase: 'bg-primary/10 text-primary ring-primary/30', punto: 'bg-primary', barra: 'bg-primary' };
  }
  if (l.piezasPesadas > 0) {
    return { key: 'proceso' as EstadoKey, texto: 'En proceso', clase: 'bg-amber-50 text-amber-800 ring-amber-300', punto: 'bg-amber-500', barra: 'bg-amber-500' };
  }
  return { key: 'pendiente' as EstadoKey, texto: 'Sin iniciar', clase: 'bg-muted text-muted-foreground ring-border', punto: 'bg-muted-foreground/60', barra: 'bg-transparent' };
}

function kg(n: number) {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

/** Última clasificación escogida; se aplica a los siguientes animales. */
type ClasificacionPredeterminada = {
  tipo?: CanalAnimalTipo;
  expendio?: string;
  cava?: string;
  destino?: string;
  /** La bodega es del cliente: solo se repite en órdenes del mismo cliente. */
  bodega?: { cliente: string; valor: string };
};

/** Animal con tipo de canal y todas sus piezas pesadas. */
function animalTerminado(a: CanalAnimal) {
  return !!a.canalTipo && a.piezas.length > 0 && a.piezas.every((p) => p.pesado);
}

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
  const cerrar = useCerrarCanalLote();
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Puente para que el botón de etiqueta del pie (compartido entre pestañas)
  // dispare "guardar clasificación + imprimir presinto" cuando se está en
  // la pestaña ANIMALES.
  const animalesImprimirRef = useRef<
    ((nueva?: PiezaNueva) => void) | null
  >(null);
  // Puente para que elegir una cava en ANIMALES lea la báscula del pie
  // (misma acción que su botón de báscula).
  const leerBasculaRef = useRef<(() => void) | null>(null);
  // Campos de clasificación que faltan (los conoce ANIMALES).
  const validarRef = useRef<(() => string[]) | null>(null);
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
  // Animal tocado en la cuadrícula de ANIMALES: manda para clasificar y para
  // pesar (Animal No. del pie), hasta terminarlo o cambiar de orden.
  const [animalElegidoId, setAnimalElegidoId] = useState<string | null>(null);
  // Última clasificación que escogió el operario: queda predeterminada para
  // los siguientes animales (vive aquí porque ANIMALES se desmonta al pesar).
  const [predeterminado, setPredeterminado] = useState<ClasificacionPredeterminada>({});
  // Última pieza escogida en CANALES / CUARTOS (Completo/CIZQ/CDER): se le
  // aplica sola al siguiente animal sin tipo, para no tener que escogerla
  // otra vez después de cada presinto.
  const [piezaPredeterminada, setPiezaPredeterminada] = useState<CanalPiezaTipo | null>(null);
  const setTipoAuto = useSetCanalTipo();
  const piezaAutoAplicadaRef = useRef<string | null>(null);
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
    // Animal tocado en la cuadrícula: se pesa la pieza que le falte (si solo
    // le falta una); sin tipo de canal o con ambas mitades pendientes, el
    // operario debe completar esa elección.
    if (animalElegidoId) {
      const animal = detail.data?.animales.find((a) => a.eventoId === animalElegidoId);
      // Un animal ya terminado deja de mandar (su tarjeta ya no se muestra).
      if (animal && !animalTerminado(animal)) {
        const pendientes = animal.piezas.filter((p) => !p.pesado);
        if (!animal.canalTipo || pendientes.length !== 1) return { animal, pieza: null };
        return { animal, pieza: pendientes[0].pieza as CanalPiezaTipo };
      }
    }
    if (!objetivoBase) return objetivoBase;
    const { animal } = objetivoBase;
    const pendientes = animal.piezas.filter((p) => !p.pesado);
    // Con CIZQ y CDER pendientes a la vez no hay un lado "por defecto": se
    // espera que el operario elija cuál pesar primero con un click explícito.
    if (pendientes.length > 1) return { animal, pieza: null };
    return objetivoBase;
  }, [objetivoBase, piezaOverride, animalElegidoId, detail.data]);
  useEffect(() => {
    setPiezaOverride(null);
  }, [objetivoBase?.animal.eventoId]);
  // Aplica la pieza predeterminada al animal que toca, si aún no tiene pieza
  // escogida ni nada pesado (va después del efecto anterior para no ser
  // borrada por él). Una sola vez por animal.
  const animalObjetivo = objetivo?.animal;
  useEffect(() => {
    if (!animalObjetivo || !piezaPredeterminada || objetivo?.pieza) return;
    if (animalObjetivo.piezas.some((p) => p.pesado)) return;
    const tipo = PANEL_TIPO[piezaPredeterminada];
    if (animalObjetivo.canalTipo && animalObjetivo.canalTipo !== tipo) return;
    if (piezaAutoAplicadaRef.current === animalObjetivo.eventoId) return;
    piezaAutoAplicadaRef.current = animalObjetivo.eventoId;
    const eventoId = animalObjetivo.eventoId;
    setPiezaOverride({ eventoId, pieza: piezaPredeterminada });
    if (animalObjetivo.canalTipo !== tipo) {
      setTipoAuto.mutate(
        { eventoId, tipo },
        {
          onError: (err) => {
            piezaAutoAplicadaRef.current = null;
            mostrarAlerta(
              isAxiosError(err) && typeof err.response?.data?.message === 'string'
                ? err.response.data.message
                : 'No se pudo asignar el tipo de canal predeterminado.',
            );
          },
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animalObjetivo?.eventoId, animalObjetivo?.canalTipo, objetivo?.pieza, piezaPredeterminada]);
  // Prioriza el animal tocado en la cuadrícula; luego el recién pesado (para
  // clasificarlo); si no, el comportamiento normal (siguiente pendiente / último).
  const animalParaClasificar =
    detail.data?.animales.find(
      (a) => a.eventoId === animalElegidoId && !animalTerminado(a),
    ) ??
    detail.data?.animales.find((a) => a.eventoId === ultimoPesadoId) ??
    objetivo?.animal ??
    siguienteObjetivoAnimal(detail.data);

  function elegirAnimal(eventoId: string) {
    setAnimalElegidoId(eventoId);
    setPiezaOverride((po) => (po && po.eventoId !== eventoId ? null : po));
  }

  function seleccionarOrden(ordenBeneficioId: string) {
    setSelectedId(ordenBeneficioId);
    setAnimalElegidoId(null);
    setTab('pesaje');
  }

  function cerrarOrden() {
    if (!selectedId || !detail.data) return;
    const ref = formatOB(detail.data.reference);
    cerrar.mutate(selectedId, {
      onSuccess: () => {
        setConfirmarCierre(false);
        setSelectedId(null);
        setAnimalElegidoId(null);
        setUltimoPesadoId(null);
        setTab('ordenes');
        mostrarAlerta(`Orden ${ref} cerrada en Canal Caliente.`);
      },
      onError: (err) => {
        setConfirmarCierre(false);
        mostrarAlerta(
          isAxiosError(err) && typeof err.response?.data?.message === 'string'
            ? err.response.data.message
            : 'No se pudo cerrar la orden.',
        );
      },
    });
  }

  const puedeCerrar =
    !!selectedLote && selectedLote.animalCount > 0 && selectedLote.animalesPesados >= selectedLote.animalCount;
  const faltanPesar = selectedLote ? Math.max(0, selectedLote.animalCount - selectedLote.animalesPesados) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {tab === 'ordenes' ? (
        <OrdenesTab
          loading={lotes.isLoading}
          lotes={lista}
          selectedId={selectedId}
          onSelect={seleccionarOrden}
          fechaFiltro={date === today() ? null : date}
          onFecha={(v) => {
            setDate(v ?? today());
            setSelectedId(null);
            setAnimalElegidoId(null);
          }}
          refrescando={lotes.isFetching}
          onRefresh={() => lotes.refetch()}
        />
      ) : (
        <>
          {/* Encabezado de la orden abierta */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Button
              variant="outline"
              className="h-12 px-4 text-base"
              onClick={() => {
                setUltimoPesadoId(null);
                setTab('ordenes');
              }}
            >
              <ArrowLeft className="size-5" />
              Órdenes
            </Button>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">
              {detail.data ? formatOB(detail.data.reference) : selectedLote ? formatOB(selectedLote.reference) : '—'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold uppercase">{cliente || '—'}</div>
              {selectedLote && (
                <div className="text-sm text-muted-foreground">
                  <b className="tabular-nums text-foreground">{selectedLote.animalesPesados}</b>/{selectedLote.animalCount} animales ·{' '}
                  <b className="tabular-nums text-foreground">{kg(selectedLote.pesoCanalKg ?? 0)}</b> kg
                  {selectedLote.rendimiento != null && (
                    <>
                      {' · Rend. '}
                      <b
                        className={cn(
                          'tabular-nums',
                          selectedLote.rendimiento < RENDIMIENTO_MIN || selectedLote.rendimiento > RENDIMIENTO_MAX
                            ? 'text-amber-700'
                            : 'text-foreground',
                        )}
                      >
                        {selectedLote.rendimiento.toLocaleString('es-CO')} %
                      </b>
                    </>
                  )}
                  {selectedLote.guias.length ? ` · Guía ${selectedLote.guias.join(', ')}` : ''}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {(['pesaje', 'reporte'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setUltimoPesadoId(null);
                    setTab(t);
                  }}
                  className={cn(
                    'flex h-10 items-center rounded-md px-4 text-sm font-semibold transition-colors',
                    tab === t ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'pesaje' ? 'Pesaje' : 'Reporte'}
                </button>
              ))}
            </div>
            <Button
              variant={puedeCerrar ? 'default' : 'outline'}
              className="h-12 px-5 text-base"
              onClick={() => setConfirmarCierre(true)}
              disabled={!puedeCerrar || cerrar.isPending}
              title={
                !selectedLote
                  ? 'Seleccione una orden para poder cerrarla'
                  : faltanPesar > 0
                    ? `Faltan ${faltanPesar} ${faltanPesar === 1 ? 'animal' : 'animales'} por pesar para poder cerrar`
                    : 'Cerrar la orden: desaparece de Canal Caliente'
              }
            >
              {cerrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Lock className="size-5" />}
              Cerrar orden
            </Button>
          </div>

          {tab === 'pesaje' ? (
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div ref={scrollRef} className="scrollbar-app flex min-h-0 flex-col overflow-auto rounded-xl border border-border bg-card">
                <CanalesTab
                  date={date}
                  detail={detail.data}
                  objetivo={objetivo}
                  onSelectPieza={(eventoId, pieza) => {
                    setPiezaOverride({ eventoId, pieza });
                    setAnimalElegidoId(eventoId);
                  }}
                  onPiezaPredeterminada={(pieza) => {
                    setPiezaPredeterminada(pieza);
                  }}
                  onPiezaSeleccionada={() => {}}
                  onAlerta={mostrarAlerta}
                />
                <AnimalesTab
                  date={date}
                  detail={detail.data}
                  objetivoAnimal={animalParaClasificar}
                  onElegirAnimal={elegirAnimal}
                  predeterminado={predeterminado}
                  onPredeterminado={(cambio) => setPredeterminado((p) => ({ ...p, ...cambio }))}
                  onCavaElegida={() => leerBasculaRef.current?.()}
                  imprimiendo={imprimiendo}
                  setImprimiendo={setImprimiendo}
                  ultimoPresinto={ultimoPresinto}
                  setUltimoPresinto={setUltimoPresinto}
                  onAlerta={mostrarAlerta}
                  onAnimalTerminado={(ordenTerminada) => {
                    setUltimoPesadoId(null);
                    setAnimalElegidoId(null);
                    if (ordenTerminada) setTab('reporte');
                  }}
                  registerGuardarEImprimir={(fn) => {
                    animalesImprimirRef.current = fn;
                  }}
                  registerValidar={(fn) => {
                    validarRef.current = fn;
                  }}
                />
              </div>

              {/* Báscula */}
              <FooterBascula
                tab={tab}
                setTab={setTab}
                detail={detail.data}
                objetivo={objetivo}
                imprimiendo={imprimiendo}
                onEtiquetaAnimales={(nueva) => animalesImprimirRef.current?.(nueva)}
                validarClasificacion={() => validarRef.current?.() ?? []}
                onPesado={setUltimoPesadoId}
                onAlerta={mostrarAlerta}
                registrarLeer={(fn) => {
                  leerBasculaRef.current = fn;
                }}
              />
            </div>
          ) : (
            <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
              <ReporteTab
                date={date}
                orden={selectedLote ? { reference: selectedLote.reference, date: selectedLote.date } : null}
              />
            </div>
          )}
        </>
      )}

      {confirmarCierre && detail.data && (
        <Dialog open onClose={() => !cerrar.isPending && setConfirmarCierre(false)} title="Cerrar orden" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              ¿Está seguro de cerrar en Canal Caliente la orden con consecutivo{' '}
              <b>{formatOB(detail.data.reference)}</b>?
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Los {detail.data.animalCount} animales ya tienen sus canales pesadas. La orden deja de
              aparecer en Órdenes y Animales de Canal Caliente y ya no se podrán pesar ni deshacer
              piezas. El reporte y los demás módulos siguen disponibles.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmarCierre(false)}
                disabled={cerrar.isPending}
                className="rounded-sm border-2 border-border bg-card px-4 py-2 text-sm font-semibold uppercase hover:bg-muted disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={cerrarOrden}
                disabled={cerrar.isPending}
                className="flex items-center gap-2 rounded-sm border-2 border-foreground/70 bg-foreground px-4 py-2 text-sm font-semibold uppercase text-background hover:opacity-90 disabled:opacity-50"
              >
                <Lock className="size-4" />
                {cerrar.isPending ? 'Cerrando…' : 'Sí, cerrar'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {alerta && (
        <div
          key={alerta.id}
          className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-4"
        >
          <div
            role="alert"
            className="flex w-[30rem] max-w-full items-start gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg animate-in fade-in-0 slide-in-from-top-2"
          >
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <p className="text-sm font-medium text-foreground">{alerta.texto}</p>
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
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label.replace(/:$/, '')}
      </span>
      <div className="relative rounded-lg border border-input bg-background px-3 py-1 transition-colors focus-within:border-primary">
        {children}
      </div>
    </div>
  );
}

/**
 * Campo "Bodegas": solo las bodegas (internas del software) del cliente de la
 * orden, como botones grandes para pantalla táctil. Se guarda el nombre.
 */
function BodegaField({
  clienteNombre,
  value,
  onChange,
}: {
  clienteNombre: string | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  const clientes = useClientesBodega('');
  const cliente = (clientes.data ?? []).find((c) => c.concepto === clienteNombre);
  if (clientes.isLoading) {
    return <LoaderCircle className="my-2 size-5 animate-spin text-muted-foreground" />;
  }
  if (!cliente) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        {clienteNombre ? `El cliente ${clienteNombre} no está en el catálogo de Clientes.` : 'Selecciona un animal.'}
      </p>
    );
  }
  return <BodegasCliente clienteId={cliente.id} value={value} onChange={onChange} />;
}

function BodegasCliente({
  clienteId,
  value,
  onChange,
}: {
  clienteId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const bodegas = useBodegas(clienteId);
  const activas = (bodegas.data ?? []).filter((b) => b.active);

  // Por defecto queda la primera bodega del cliente (se puede cambiar).
  const primera = activas[0]?.nombre ?? '';
  const valida = activas.some((b) => b.nombre === value);
  useEffect(() => {
    if (primera && !valida) onChange(primera);
  }, [primera, valida]);

  if (bodegas.isLoading) {
    return <LoaderCircle className="my-2 size-5 animate-spin text-muted-foreground" />;
  }
  if (!activas.length) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        El cliente no tiene bodegas activas (Administrativo → Clientes → Bodegas).
      </p>
    );
  }
  return (
    <ul className="my-1 flex max-h-32 flex-col gap-1 overflow-auto">
      {activas.map((b) => {
        const sel = value === b.nombre;
        return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onChange(b.nombre)}
              aria-pressed={sel}
              className={cn(
                'flex h-10 w-full select-none items-center gap-2 rounded-lg border px-3 text-left text-sm font-semibold uppercase transition-colors',
                sel
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                  sel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50',
                )}
              >
                {sel && <Check className="size-3.5" />}
              </span>
              <span className="tabular-nums">{b.code}</span> - {b.nombre}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OrdenesTab({
  loading,
  lotes,
  selectedId,
  onSelect,
  fechaFiltro,
  onFecha,
  refrescando,
  onRefresh,
}: {
  loading: boolean;
  lotes: CanalLote[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fechaFiltro: string | null;
  onFecha: (fecha: string | null) => void;
  refrescando: boolean;
  onRefresh: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'lista' | 'tarjetas'>(() =>
    localStorage.getItem(VISTA_KEY) === 'tarjetas' ? 'tarjetas' : 'lista',
  );
  const [filtroEstado, setFiltroEstado] = useState<EstadoKey | null>(null);
  function cambiarVista(v: 'lista' | 'tarjetas') {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }
  const q = busqueda.trim().toUpperCase();
  const buscadas = q
    ? lotes.filter((l) =>
        [formatOB(l.reference), l.cliente, l.clienteNit ?? '', ...l.guias].join(' ').toUpperCase().includes(q),
      )
    : lotes;
  const conteo = (k: EstadoKey) => buscadas.filter((l) => estadoLote(l).key === k).length;
  const prioridad: Record<EstadoKey, number> = { proceso: 0, pendiente: 1, cerrar: 2 };
  const visibles = buscadas
    .filter((l) => !filtroEstado || estadoLote(l).key === filtroEstado)
    .sort((a, b) => prioridad[estadoLote(a).key] - prioridad[estadoLote(b).key] || a.reference - b.reference);
  const rendClase = (r: number | null | undefined) =>
    r != null && (r < RENDIMIENTO_MIN || r > RENDIMIENTO_MAX) ? 'text-amber-700' : '';

  return (
    <>
      {/* Barra: fecha, búsqueda, filtros y vista */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 rounded-lg border border-input px-3">
          <CalendarDays className="size-5 text-muted-foreground" />
          {/* Sin filtro = bandeja de pendientes; otro día (últimos 30) = solo ese día. */}
          <FechaFiltro value={fechaFiltro} onChange={onFecha} />
        </div>
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar orden, cliente o guía"
            className="h-11 pl-10 text-base"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {[{ key: null, texto: 'Todas' }, ...ESTADOS].map((e) => {
            const activo = filtroEstado === e.key;
            const n = e.key ? conteo(e.key) : buscadas.length;
            return (
              <button
                key={e.key ?? 'todas'}
                type="button"
                onClick={() => setFiltroEstado(e.key)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                  activo ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {e.texto}
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', activo ? 'bg-primary text-primary-foreground' : 'bg-background')}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => cambiarVista('lista')}
            title="Ver en lista"
            aria-pressed={vista === 'lista'}
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'lista' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <List className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => cambiarVista('tarjetas')}
            title="Ver en tarjetas"
            aria-pressed={vista === 'tarjetas'}
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'tarjetas' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <LayoutGrid className="size-5" />
          </button>
        </div>
        <Button variant="outline" className="size-11 p-0" onClick={onRefresh} disabled={refrescando} title="Actualizar">
          <RefreshCw className={cn('size-5', refrescando && 'animate-spin')} />
        </Button>
      </div>

      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        {loading ? (
          <Loading />
        ) : !visibles.length ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Inbox className="size-8" />
            {q || filtroEstado
              ? 'Ninguna orden coincide con la búsqueda o el filtro.'
              : 'No hay órdenes abiertas en esta fecha. Cuando una orden empiece en Sacrificio aparecerá aquí.'}
          </div>
        ) : vista === 'lista' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-4">
                  <th className="w-28">Orden</th>
                  <th>Cliente</th>
                  <th>Guía</th>
                  <th className="text-right">Kg canal</th>
                  <th className="text-right">Rend.</th>
                  <th className="w-64">Animales pesados</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((l) => {
                  const estado = estadoLote(l);
                  const pct = l.animalCount ? Math.round((l.animalesPesados / l.animalCount) * 100) : 0;
                  return (
                    <tr
                      key={l.ordenBeneficioId}
                      onClick={() => onSelect(l.ordenBeneficioId)}
                      className={cn(
                        'h-16 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:px-4',
                        l.ordenBeneficioId === selectedId && 'bg-primary/5',
                      )}
                    >
                      <td className="relative">
                        <span className={cn('absolute inset-y-0 left-0 w-1', estado.barra)} />
                        <span className="text-lg font-bold tabular-nums text-primary">{formatOB(l.reference)}</span>
                      </td>
                      <td className="max-w-80">
                        <div className="truncate text-base font-semibold uppercase">{l.cliente}</div>
                        <div className="text-xs text-muted-foreground">Sacrificio {formatFechaDia(l.date)}</div>
                      </td>
                      <td className="text-base tabular-nums">
                        {l.guias.length > 1 ? `${l.guias.length} guías` : l.guias[0] ?? '—'}
                      </td>
                      <td className="text-right text-base font-semibold tabular-nums">{kg(l.pesoCanalKg ?? 0)}</td>
                      <td className={cn('text-right text-base tabular-nums', rendClase(l.rendimiento))}>
                        {l.rendimiento != null ? `${l.rendimiento.toLocaleString('es-CO')} %` : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-14 text-right text-sm font-semibold tabular-nums">
                            {l.animalesPesados}/{l.animalCount}
                          </span>
                          <span className={cn('size-2.5 rounded-full', estado.punto)} title={estado.texto} />
                        </div>
                      </td>
                      <td className="text-muted-foreground">
                        <ChevronRight className="size-5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {visibles.map((l) => {
              const estado = estadoLote(l);
              const pct = l.animalCount ? Math.round((l.animalesPesados / l.animalCount) * 100) : 0;
              const activo = l.ordenBeneficioId === selectedId;
              return (
                <li key={l.ordenBeneficioId}>
                  <button
                    onClick={() => onSelect(l.ordenBeneficioId)}
                    className={cn(
                      'group flex w-full flex-col gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.995]',
                      activo ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">
                        {formatOB(l.reference)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-bold uppercase">{l.cliente}</div>
                        <div className="text-sm text-muted-foreground">
                          {l.guias.length ? `Guía ${l.guias.join(', ')} · ` : ''}Sacrificio {formatFechaDia(l.date)}
                        </div>
                      </div>
                      <span className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1', estado.clase)}>
                        <span className={cn('size-2 rounded-full', estado.punto)} />
                        {estado.texto}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/40 px-4 py-3">
                      <Dato label="Animales">{l.animalesPesados}/{l.animalCount}</Dato>
                      <Dato label="Kg canal">{kg(l.pesoCanalKg ?? 0)}</Dato>
                      <Dato label="Rendimiento">
                        <span className={rendClase(l.rendimiento)}>
                          {l.rendimiento != null ? `${l.rendimiento.toLocaleString('es-CO')} %` : '—'}
                        </span>
                      </Dato>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-primary-foreground group-hover:bg-primary/90">
                        Abrir
                        <ChevronRight className="size-5" />
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums">{children}</div>
    </div>
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
  onPiezaPredeterminada,
  onPiezaSeleccionada,
  onAlerta,
}: {
  date: string;
  detail: CanalLoteDetail | undefined;
  objetivo: { animal: CanalAnimal; pieza: CanalPiezaTipo | null } | null;
  onSelectPieza: (eventoId: string, pieza: CanalPiezaTipo) => void;
  onPiezaPredeterminada: (pieza: CanalPiezaTipo) => void;
  onPiezaSeleccionada: () => void;
  onAlerta: (texto: string) => void;
}) {
  const setTipo = useSetCanalTipo();

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
    objetivo?.animal;
  const completos = detail.animales.filter(
    (a) => a.piezas.length > 0 && a.piezas.every((p) => p.pesado),
  ).length;
  const faltaPieza = incompleto?.piezas.find((p) => !p.pesado)?.pieza;
  const permitida = (pieza: CanalPiezaTipo) =>
    incompleto ? pieza === faltaPieza : editables.length > 0;

  function elegir(pieza: CanalPiezaTipo) {
    if (incompleto) {
      const cod = String(incompleto.consecutivo);
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
    // Queda como pieza predeterminada para los siguientes animales.
    onPiezaPredeterminada(pieza);
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
    <section className="flex shrink-0 flex-col gap-1.5 border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pieza a pesar</h3>
        <p className="text-sm text-muted-foreground">
          {!animal ? (
            <>Todas las piezas de la orden fueron pesadas.</>
          ) : incompleto ? (
            <>
              Animal <b className="text-foreground">{incompleto.consecutivo}</b> — falta la{' '}
              <b className="text-foreground">{PIEZA_LABEL[incompleto.piezas.find((p) => !p.pesado)!.pieza]}</b>
            </>
          ) : !animal.canalTipo ? (
            <>
              Animal <b className="text-foreground">{animal.consecutivo}</b> — elegí el tipo de canal
            </>
          ) : (
            <>
              Animal <b className="text-foreground">{animal.consecutivo}</b>
            </>
          )}
          <span className="ml-2">
            · Completos: <b className="tabular-nums text-foreground">{completos} de {detail.animales.length}</b>
          </span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {CANAL_PANELS.map(({ pieza, title }) => {
          const activa = objetivo?.pieza === pieza && objetivo.animal.eventoId === animal?.eventoId;
          const pesada = animal?.piezas.find((p) => p.pieza === pieza && p.pesado);
          return (
            <button
              key={pieza}
              type="button"
              onClick={() => elegir(pieza)}
              disabled={setTipo.isPending}
              aria-pressed={activa}
              className={cn(
                'flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-all active:scale-[0.98]',
                activa
                  ? 'border-primary bg-primary/10 ring-4 ring-primary/15'
                  : 'border-border bg-card hover:border-primary/40',
                !permitida(pieza) && 'opacity-50',
              )}
            >
              <img
                src={CANAL_IMG[pieza]}
                alt=""
                draggable={false}
                className={cn('h-14 w-12 shrink-0 object-contain', !permitida(pieza) && 'grayscale')}
              />
              <span className="min-w-0">
                <span className={cn('block text-base font-bold', activa && 'text-primary')}>{PIEZA_LABEL[pieza]}</span>
                <span className="block text-xs text-muted-foreground">{title}</span>
                {pesada?.pesoKg != null && (
                  <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary">
                    <Check className="size-3.5" /> {kg(pesada.pesoKg)} kg
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AnimalesTab({
  date,
  detail,
  objetivoAnimal,
  onElegirAnimal,
  predeterminado,
  onPredeterminado,
  onCavaElegida,
  imprimiendo,
  setImprimiendo,
  ultimoPresinto,
  setUltimoPresinto,
  onAlerta,
  onAnimalTerminado,
  registerGuardarEImprimir,
  registerValidar,
}: {
  date: string;
  detail: CanalLoteDetail | undefined;
  objetivoAnimal: CanalAnimal | null;
  onElegirAnimal: (eventoId: string) => void;
  predeterminado: ClasificacionPredeterminada;
  onPredeterminado: (cambio: Partial<ClasificacionPredeterminada>) => void;
  /** Al tocar una cava se lee la báscula (como el botón de báscula del pie). */
  onCavaElegida: () => void;
  imprimiendo: boolean;
  setImprimiendo: (v: boolean) => void;
  ultimoPresinto: PresintoTicketData | null;
  setUltimoPresinto: (d: PresintoTicketData | null) => void;
  onAlerta: (texto: string) => void;
  onAnimalTerminado: (ordenTerminada: boolean) => void;
  registerGuardarEImprimir: (
    fn: (nueva?: PiezaNueva) => void,
  ) => void;
  registerValidar: (fn: () => string[]) => void;
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
  const [printError, setPrintError] = useState<string | null>(null);

  const eventoId = objetivoAnimal?.eventoId ?? null;

  // Al cambiar de animal (o volver a esta pestaña) los campos se cargan con
  // lo guardado del animal; lo que no tenga se toma de la última
  // clasificación escogida (predeterminada). Las observaciones son de cada
  // animal y no se repiten.
  useEffect(() => {
    setTipoLocal(objetivoAnimal?.canalAnimalTipo ?? predeterminado.tipo ?? '');
    setExpendio(objetivoAnimal?.expendio ?? predeterminado.expendio ?? '');
    setBodega(
      predeterminado.bodega && predeterminado.bodega.cliente === detail?.cliente
        ? predeterminado.bodega.valor
        : '',
    );
    setCava(predeterminado.cava ?? '');
    setDestino(predeterminado.destino ?? '');
    setObservaciones('');
    setCavaError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId]);

  // Cada elección del operario queda como predeterminada para los siguientes.
  const cambiarExpendio = (v: string) => {
    setExpendio(v);
    onPredeterminado({ expendio: v });
  };
  const cambiarBodega = (v: string) => {
    setBodega(v);
    if (detail) onPredeterminado({ bodega: { cliente: detail.cliente, valor: v } });
  };
  const cambiarCava = (v: string) => {
    setCava(v);
    onPredeterminado({ cava: v });
    onCavaElegida();
  };
  const cambiarDestino = (v: string) => {
    setDestino(v);
    onPredeterminado({ destino: v });
  };

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
        `La otra mitad del animal ${objetivoAnimal!.consecutivo} ya se marcó como ${CANAL_ANIMAL_TIPO_LABEL[tipoBloqueado]}: esta mitad debe ser igual.`,
      );
      return;
    }
    setTipoLocal(t);
    onPredeterminado({ tipo: t });
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
    clasificar.mutate({ eventoId, tipo: tipo || undefined, expendio });
    if (!piezaIdParaClasificar) {
      onDone?.();
      return;
    }
    clasificarPieza.mutate(
      { piezaId: piezaIdParaClasificar, bodega, cava, destino, observaciones },
      {
        onSuccess: () => {
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
    setImprimiendo(true);
    imprimirPresintoDirecto(d).then((r) => {
      setImprimiendo(false);
      if (r.ok && r.directo) {
        setUltimoPresinto(d);
      } else {
        const msg = r.error ?? 'No se pudo imprimir el presinto.';
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

  useEffect(() => {
    registerValidar(() => {
      const faltan: string[] = [];
      if (!tipo) faltan.push('el tipo');
      if (!cava) faltan.push('la cava');
      if (!bodega.trim()) faltan.push('la bodega');
      if (!destino.trim()) faltan.push('el destino');
      return faltan;
    });
  });

  const tiposGrupos: CanalAnimalTipo[][] = [
    ['vaca', 'novilla'],
    ['toro', 'novillo'],
    ['bufala', 'bufalo'],
  ];

  // Solo los animales con algo pendiente: los ya pesados (presinto impreso)
  // salen de la cuadrícula para que no se vuelvan a escoger.
  const pendientesGrid = detail?.animales.filter((a) => !animalTerminado(a)) ?? [];

  return (
    <>
      {/* Animales por pesar */}
      <section className="shrink-0 border-b border-border px-4 py-2.5">
        <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Por pesar <span className="tabular-nums text-foreground">({pendientesGrid.length})</span>
        </h3>
        {!detail || !pendientesGrid.length ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            <Inbox className="size-4" />
            {!detail
              ? 'Cargando la orden…'
              : detail.animales.length
                ? 'Todos los animales de esta orden ya están pesados.'
                : 'Esta orden aún no tiene animales sacrificados.'}
          </div>
        ) : (
          <div className="scrollbar-app flex gap-2 overflow-x-auto overflow-y-hidden pb-1">
            {pendientesGrid.map((a) => {
              const activo = a.eventoId === eventoId;
              const pesadas = a.piezas.filter((p) => p.pesado).length;
              return (
                <button
                  key={a.eventoId}
                  type="button"
                  onClick={() => onElegirAnimal(a.eventoId)}
                  aria-pressed={activo}
                  title={`Animal ${a.consecutivo}`}
                  ref={activo ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
                  className={cn(
                    'flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 leading-tight transition-all active:scale-95',
                    activo
                      ? 'border-primary bg-primary text-primary-foreground shadow-md ring-4 ring-primary/20'
                      : 'border-border bg-card text-foreground hover:border-primary/40',
                  )}
                >
                  <span className="text-3xl font-bold tabular-nums">{a.consecutivo}</span>
                  <span className={cn('text-[11px] font-semibold uppercase', activo ? 'text-primary-foreground/90' : 'text-muted-foreground')}>
                    {a.tipoPie ?? '\u00a0'}
                  </span>
                  <span className={cn('text-[11px] tabular-nums', activo ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {a.piezas.length > 1 && pesadas > 0
                      ? `${pesadas}/${a.piezas.length} piezas`
                      : a.pesoPieKg != null
                        ? `pie ${Math.round(a.pesoPieKg)} kg`
                        : '\u00a0'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Clasificación del animal */}
      {detail && objetivoAnimal && (
        <fieldset disabled={!eventoId} className="shrink-0 space-y-2.5 px-4 py-2.5 disabled:opacity-40">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</span>
            <div className="flex flex-wrap gap-2">
              {tiposGrupos.map((grupo) => (
                <div key={grupo.join('-')} className="flex gap-1 rounded-lg bg-muted p-1">
                  {grupo.map((t) => (
                    <TipoButton
                      key={t}
                      tipo={t}
                      activo={tipo === t}
                      bloqueado={!!tipoBloqueado && t !== tipoBloqueado}
                      onClick={() => elegirTipo(t)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cava</span>
            <div className="flex flex-wrap gap-2">
              {CAVAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => cambiarCava(c)}
                  className={cn(
                    'h-10 rounded-lg border px-4 text-sm font-semibold uppercase transition-colors',
                    cava === c
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bodega</span>
                <BodegaField clienteNombre={detail.cliente} value={bodega} onChange={cambiarBodega} />
              </div>
              <FieldBox label="Observaciones">
                <input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="h-9 w-full bg-transparent pr-8 text-base outline-none"
                />
                <Lock className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </FieldBox>
            </div>
            <div className="flex flex-col gap-3">
              <FieldBox label="Destino">
                <input
                  value={destino}
                  onChange={(e) => cambiarDestino(e.target.value)}
                  className="h-9 w-full bg-transparent text-base font-semibold uppercase outline-none"
                />
              </FieldBox>
              <div className="grid grid-cols-2 gap-3">
                <FieldBox label="Expendio">
                  <input
                    value={expendio}
                    onChange={(e) => cambiarExpendio(e.target.value)}
                    placeholder="Ej: PIPO F"
                    className="h-9 w-full bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60"
                  />
                </FieldBox>
                <FieldBox label="Último precinto">
                  <button
                    type="button"
                    disabled={!ultimoPresinto || imprimiendo}
                    onClick={reimprimirUltimo}
                    title="Volver a imprimir este presinto"
                    className="flex h-9 w-full items-center justify-between gap-2 bg-transparent text-left text-sm font-semibold tabular-nums outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    <span className="truncate">{ultimoPresinto ? codigoBarras(ultimoPresinto) : '—'}</span>
                    <Printer className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </FieldBox>
              </div>
            </div>
          </div>

          {/* Solo errores: el progreso ya se ve en el botón de imprimir. */}
          {(cavaError || printError) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {cavaError && <span className="font-medium text-red-600">{cavaError}</span>}
              {printError && <span className="font-medium text-amber-600">{printError}</span>}
            </div>
          )}
        </fieldset>
      )}
    </>
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
        'h-10 rounded-md px-4 text-sm font-semibold uppercase transition-colors',
        activo
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-foreground hover:bg-card',
        bloqueado && 'text-muted-foreground opacity-40',
      )}
    >
      {CANAL_ANIMAL_TIPO_LABEL[tipo]}
    </button>
  );
}

function ReporteTab({
  date,
  orden,
}: {
  date: string;
  /** Orden seleccionada: el reporte y la reimpresión se limitan a ella. */
  orden: { reference: number; date: string } | null;
}) {
  // El reporte es SIEMPRE por orden: sin orden seleccionada no se consulta ni se lista nada.
  const piezas = useCanalPiezas(date, !!orden);
  // Precinto seleccionado (azul) para reimprimir solo ese; sin selección se reimprimen todos los de la orden.
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [reimprimiendo, setReimprimiendo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  // El reporte va en orden consecutivo (A01, A02…); en media canal, CIZQ antes que CDER.
  const ordenPieza: Record<string, number> = { canal: 0, cizq: 1, cder: 2 };
  const rows = (
    orden
      ? (piezas.data ?? []).filter((p) => p.reference === orden.reference && p.date === orden.date)
      : []
  ).sort(
    (a, b) =>
      a.consecutivo - b.consecutivo ||
      (ordenPieza[a.pieza] ?? 9) - (ordenPieza[b.pieza] ?? 9),
  );

  // Al cambiar de orden se limpia la selección y el último resultado.
  useEffect(() => {
    setSeleccion(null);
    setResultado(null);
  }, [orden?.reference, orden?.date]);

  /**
   * Reimprime en RAW (sin diálogo) el precinto seleccionado o, si no hay, todos,
   * uno por uno. Vísceras va por animal: en media canal (CIZQ/CDER) sale uno solo.
   */
  async function reimprimir(tipo: TipoPresinto) {
    const lista = seleccion ? rows.filter((r) => r.piezaId === seleccion) : rows;
    const vistos = new Set<string>();
    const imprimibles = lista.filter((r) => {
      if (!r.canalTipo) return false;
      if (tipo === 'canal') return true;
      const animal = `${r.date}|${r.reference}|${r.sequence}`;
      if (vistos.has(animal)) return false;
      vistos.add(animal);
      return true;
    });
    if (!imprimibles.length) return;
    setResultado(null);
    let enviados = 0;
    for (const [i, p] of imprimibles.entries()) {
      setReimprimiendo(`Imprimiendo ${i + 1} de ${imprimibles.length}…`);
      const [y, m, d] = (p.date ?? date).split('-');
      const r = await imprimirPresintoDirecto({
        fechaSacrificio: `${d}/${m}/${y}`,
        lote: p.reference,
        guia: p.guias?.join(', ') || '—',
        expendio: p.expendio ?? '',
        cliente: p.cliente,
        tipoAnimal: p.canalAnimalTipo ? CANAL_ANIMAL_TIPO_LABEL[p.canalAnimalTipo] : '—',
        ref: p.consecutivo,
        turno: p.turno ?? p.consecutivo,
        pesoKg: p.pesoKg,
        canalTipo: p.canalTipo!,
        conCola: p.conCola,
        pieza: p.pieza,
      }, tipo);
      if (!r.ok) {
        setReimprimiendo(null);
        setResultado({
          ok: false,
          texto: `${enviados ? `Se enviaron ${enviados} de ${imprimibles.length}. ` : ''}${r.error ?? 'No se pudo imprimir.'}`,
        });
        return;
      }
      enviados++;
    }
    setReimprimiendo(null);
    setResultado({
      ok: true,
      texto:
        enviados === 1
          ? 'Precinto enviado a la impresora.'
          : `${enviados} precintos enviados a la impresora.`,
    });
  }

  if (orden && piezas.isLoading) return <Loading />;
  const hayDatos = rows.length > 0;
  const totalKg = rows.reduce((s, p) => s + p.pesoKg, 0);
  const porTipo = new Map<string, Set<string>>();
  for (const p of rows) {
    const t = p.canalAnimalTipo ? CANAL_ANIMAL_TIPO_LABEL[p.canalAnimalTipo] : 'Sin tipo';
    if (!porTipo.has(t)) porTipo.set(t, new Set());
    porTipo.get(t)!.add(`${p.sequence}`);
  }
  const animales = new Set(rows.map((p) => p.sequence)).size;
  return (
    <div className="flex h-full flex-col">
      {/* Resumen + reimpresión */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Dato label="Animales">{animales}</Dato>
          <Dato label="Piezas">{rows.length}</Dato>
          <Dato label="Kg canal">{kg(totalKg)}</Dato>
          <div className="flex flex-wrap gap-1.5">
            {[...porTipo].map(([t, s]) => (
              <span key={t} className="rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium">
                <b className="tabular-nums">{s.size}</b> {t.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(reimprimiendo || resultado) && (
            <span
              className={cn(
                'mr-1 text-sm font-medium',
                reimprimiendo ? 'text-muted-foreground' : resultado?.ok ? 'text-primary' : 'text-red-600',
              )}
            >
              {reimprimiendo ?? resultado?.texto}
            </span>
          )}
          <Button
            variant="outline"
            className="h-11"
            disabled={!hayDatos || !!reimprimiendo}
            onClick={() => void reimprimir('canal')}
            title={seleccion ? 'Reimprimir el precinto seleccionado' : 'Reimprimir todos los precintos de esta orden'}
          >
            <Printer className="size-4" />
            {seleccion ? 'Reimprimir canal' : 'Reimprimir canales'}
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={!hayDatos || !!reimprimiendo}
            onClick={() => void reimprimir('visceras')}
            title={
              seleccion
                ? 'Reimprimir el precinto de vísceras del animal seleccionado'
                : 'Reimprimir los precintos de vísceras de todos los animales de esta orden'
            }
          >
            <Printer className="size-4" />
            Reimprimir vísceras
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {!hayDatos ? (
          <Empty
            text={
              orden
                ? 'Esta orden aún no tiene canales pesadas.'
                : 'Seleccione una orden en ÓRDENES para ver su reporte.'
            }
          />
        ) : (
          <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-4">
                  <th>Turno</th>
                  <th>Pieza</th>
                  <th>Código de barras</th>
                  <th className="text-right">Kg</th>
                  <th>Tipo</th>
                  <th>Destino</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr
                    key={p.piezaId}
                    onClick={() => setSeleccion((s) => (s === p.piezaId ? null : p.piezaId))}
                    title="Tocá para reimprimir solo este precinto"
                    className={cn(
                      'h-12 cursor-pointer transition-colors [&>td]:px-4',
                      seleccion === p.piezaId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50',
                    )}
                  >
                    <td className="text-base font-bold tabular-nums">{p.turno ?? p.consecutivo}</td>
                    <td className="font-semibold">{PIEZA_LABEL[p.pieza as CanalPiezaTipo] ?? p.pieza}</td>
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
                    <td className="text-right text-base font-semibold tabular-nums">
                      {kg(p.pesoKg)}
                    </td>
                    <td className="uppercase">
                      {p.canalAnimalTipo
                        ? CANAL_ANIMAL_TIPO_LABEL[p.canalAnimalTipo]
                        : '—'}
                    </td>
                    <td className="uppercase">{p.destino || '—'}</td>
                    <td>{p.observaciones || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
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
  validarClasificacion,
  onPesado,
  onAlerta,
  registrarLeer,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  detail: CanalLoteDetail | undefined;
  objetivo: { animal: CanalAnimal; pieza: CanalPiezaTipo | null } | null;
  imprimiendo: boolean;
  onEtiquetaAnimales: (nueva?: PiezaNueva) => void;
  validarClasificacion: () => string[];
  onPesado: (eventoId: string) => void;
  onAlerta: (texto: string) => void;
  registrarLeer: (fn: () => void) => void;
}) {
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  // Expone la lectura de báscula (mismas condiciones que su botón) para que
  // elegir una cava en ANIMALES la dispare.
  useEffect(() => {
    registrarLeer(() => {
      if (!leyendo && objetivo) void leerBascula();
    });
  });
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
          setTab('pesaje');
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
    if (!objetivo) {
      onAlerta(
        detail
          ? 'Todas las piezas de esta orden ya fueron pesadas.'
          : 'Seleccioná una orden para pesar.',
      );
      return;
    }
    // Pieza ya pesada (sin peso pendiente): solo guarda clasificación.
    const yaPesada = !puedePesar && !!objetivo.pieza && objetivo.animal.piezas.some((p) => p.pieza === objetivo.pieza && p.pesado);
    const faltan: string[] = [];
    if (!objetivo.pieza) faltan.push('la pieza a pesar');
    faltan.push(...validarClasificacion());
    if (!yaPesada && !(Number.isFinite(valor) && valor > 0)) faltan.push('el peso');
    if (faltan.length) {
      const lista = faltan.length > 1 ? `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}` : faltan[0];
      onAlerta(`Animal ${objetivo.animal.consecutivo}: falta ${lista}.`);
      return;
    }
    if (puedePesar) guardar(true);
    else onEtiquetaAnimales();
  }

  const piezaLabel = objetivo?.pieza ? PIEZA_LABEL[objetivo.pieza] : '—';
  const animalNo = objetivo ? String(objetivo.animal.consecutivo) : '—';
  const osNo = detail ? formatOB(detail.reference) : '—';
  const sinPieza = !!objetivo && !objetivo.pieza;
  const animalPesado =
    sinPieza &&
    objetivo.animal.piezas.length > 0 &&
    objetivo.animal.piezas.every((p) => p.pesado);
  const sinTipo = sinPieza && !objetivo.animal.canalTipo;
  const elegirMitad = sinPieza && !animalPesado && !sinTipo;
  const completo = !!detail && !objetivo;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Animal</div>
          <div className="text-5xl font-bold tabular-nums leading-tight">{animalNo}</div>
          <div className="text-sm text-muted-foreground">{osNo}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pieza</div>
          <div
            className={cn(
              'mt-1 rounded-lg px-3 py-1.5 text-2xl font-bold',
              objetivo?.pieza ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            {piezaLabel}
          </div>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peso</span>
        <div
          className={cn(
            'mt-1 flex items-baseline justify-center gap-2 rounded-xl border-2 bg-muted/30 px-4 py-4 transition-colors',
            objetivo ? 'border-primary/40 focus-within:border-primary' : 'border-border opacity-60',
          )}
        >
          <input
            value={peso}
            onChange={(e) => setPeso(soloDecimal(e.target.value))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') etiqueta();
            }}
            inputMode="decimal"
            placeholder="0.0"
            disabled={!objetivo}
            aria-label="Peso en kg"
            className="w-full min-w-0 bg-transparent text-right text-6xl font-bold tabular-nums text-foreground outline-none"
          />
          <span className="text-2xl font-semibold text-muted-foreground">kg</span>
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-16 text-base" onClick={leerBascula} disabled={leyendo || !objetivo}>
          {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
          Leer báscula
        </Button>
        <Button
          className="h-16 text-base"
          onClick={etiqueta}
          disabled={imprimiendo || registrar.isPending || (tab !== 'pesaje' && !puedePesar)}
          title="Registrar el peso, guardar la clasificación e imprimir el presinto"
        >
          {imprimiendo || registrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Tag className="size-5" />}
          {puedePesar ? 'Pesar e imprimir' : 'Guardar e imprimir'}
        </Button>
      </div>

      {(error || sinPieza || completo) && (
        <div className="space-y-1 text-sm">
          {error && <p className="font-medium text-red-600">{error}</p>}
          {sinTipo && (
            <p className="font-medium text-amber-700">Elegí la pieza (canal o media) de este animal para empezar a pesar.</p>
          )}
          {elegirMitad && (
            <p className="font-medium text-amber-700">Elegí qué mitad (CIZQ o CDER) vas a pesar.</p>
          )}
          {animalPesado && (
            <p className="font-medium text-primary">El animal {animalNo} ya tiene todas sus piezas pesadas.</p>
          )}
          {completo && <p className="font-medium text-primary">Todas las piezas de esta orden ya fueron pesadas.</p>}
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

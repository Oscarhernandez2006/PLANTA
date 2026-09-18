import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Gauge,
  Inbox,
  LoaderCircle,
  Lock,
  Pencil,
  Tag,
  Undo2,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { CanalCalienteIcon } from '@/components/icons/CanalCalienteIcon';
import { useBascula } from '@/components/bascula/Bascula';
import { cn } from '@/lib/utils';
import {
  useCanalLotes,
  useCanalLoteDetail,
  useCanalPiezas,
  useCanalReporte,
  useSetCanalTipo,
  useRegistrarCanal,
  useDeshacerCanal,
  useClasificarAnimal,
  CANAL_TIPO_LABEL,
  CANAL_ANIMAL_TIPO_LABEL,
  PIEZA_LABEL,
  BODEGAS,
  CAVAS,
  type CanalAnimal,
  type CanalAnimalTipo,
  type CanalLote,
  type CanalLoteDetail,
  type CanalPiezaTipo,
  type CanalTipo,
  type CanalTurno,
} from './api';
import canalTodoImg from './canal-todo.png';
import canalCizqImg from './canal-cizq.png';
import canalCderImg from './canal-cder.png';

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Siguiente animal con trabajo pendiente: sin tipo asignado (pieza null) o con una pieza sin pesar. */
function siguienteObjetivo(detail: CanalLoteDetail | undefined) {
  if (!detail) return null;
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
  const [turno, setTurno] = useState<CanalTurno>('manana');

  const lotes = useCanalLotes(date);
  const detail = useCanalLoteDetail(selectedId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lista = lotes.data ?? [];
  const selectedLote = lista.find((l) => l.ordenBeneficioId === selectedId);
  const cliente = detail.data?.cliente ?? selectedLote?.cliente ?? '';

  const objetivo = useMemo(
    () => siguienteObjetivo(detail.data),
    [detail.data],
  );

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
            onClick={() => setTab(t.key)}
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
          <CanalesTab date={date} detail={detail.data} objetivo={objetivo} />
        )}
        {tab === 'animales' && (
          <AnimalesTab date={date} detail={detail.data} objetivoAnimal={objetivo?.animal ?? siguienteObjetivoAnimal(detail.data)} />
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
        detail={detail.data}
        objetivo={objetivo}
        turno={turno}
        setTurno={setTurno}
      />
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
      <Empty text="No hay órdenes insensibilizadas en esta fecha. Cuando una orden termine en Insensibilización aparecerá aquí." />
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
                <span className="font-bold tabular-nums">{l.reference}</span>{' '}
                <span className="text-muted-foreground">|</span> {l.cliente}
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

/** El tipo de canal se elige tocando el recuadro: TODO = completa, media canal = CIZQ/CDER. */
const PANEL_TIPO: Record<CanalPiezaTipo, CanalTipo> = {
  canal: 'canal_completa',
  cizq: 'media_canal_con_cola',
  cder: 'media_canal_sin_cola',
};

function CanalesTab({
  date,
  detail,
  objetivo,
}: {
  date: string;
  detail: CanalLoteDetail | undefined;
  objetivo: { animal: CanalAnimal; pieza: CanalPiezaTipo | null } | null;
}) {
  const piezas = useCanalPiezas(date);
  const deshacer = useDeshacerCanal();
  const setTipo = useSetCanalTipo();

  if (!detail)
    return (
      <Empty text="Selecciona una orden en la pestaña ORDENES para ver los canales." />
    );

  const animal = objetivo?.animal;
  const esCompleta = animal?.canalTipo === 'canal_completa';
  const esMediaCanal =
    animal?.canalTipo === 'media_canal_con_cola' ||
    animal?.canalTipo === 'media_canal_sin_cola';
  const estadoDe = (p: CanalPiezaTipo) =>
    animal?.piezas.find((x) => x.pieza === p);
  const rows = piezas.data ?? [];

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-center text-sm text-muted-foreground">
        {!animal ? (
          <>Todas las piezas de la orden fueron pesadas.</>
        ) : !animal.canalTipo ? (
          <>
            Animal{' '}
            <span className="font-bold text-foreground">
              #{animal.consecutivo}
            </span>{' '}
            — Toca un recuadro para elegir el tipo de canal.
          </>
        ) : (
          <>
            Animal{' '}
            <span className="font-bold text-foreground">
              #{animal.consecutivo}
            </span>{' '}
            — Orden{' '}
            <span className="font-bold text-foreground">{detail.reference}</span>
          </>
        )}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {CANAL_PANELS.map(({ pieza, title }) => {
          const aplica = !animal?.canalTipo
            ? true
            : esCompleta
              ? pieza === 'canal'
              : pieza !== 'canal';
          const estado = estadoDe(pieza);
          const pesado = !!estado?.pesado;
          // CIZQ y CDER comparten la misma clasificación (media canal), así
          // que ambas quedan "activas" en cuanto se elige cualquiera de las dos.
          const tipoActivo =
            pieza === 'canal'
              ? animal?.canalTipo === 'canal_completa'
              : esMediaCanal;
          return (
            <button
              key={pieza}
              type="button"
              onClick={() => {
                if (!animal || tipoActivo) return;
                // CIZQ y CDER son piezas complementarias de la misma media
                // canal, no clasificaciones distintas: si ya se pesó una de
                // las dos, no reintentar cambiar el tipo (el backend lo
                // rechaza) y dejar que se pese la otra pieza directamente.
                const yaTienePiezaPesada = animal.piezas.some((p) => p.pesado);
                if (pieza !== 'canal' && yaTienePiezaPesada) return;
                setTipo.mutate({
                  eventoId: animal.eventoId,
                  tipo: PANEL_TIPO[pieza],
                });
              }}
              disabled={setTipo.isPending || !animal}
              className={cn(
                'flex flex-col items-center gap-2 rounded-sm border-2 bg-card p-3 text-center transition-colors hover:border-emerald-400',
                tipoActivo
                  ? 'border-emerald-500 ring-2 ring-emerald-200'
                  : 'border-border',
              )}
            >
              <span className="text-sm font-semibold">{title}:</span>
              <div
                className={cn(
                  'flex h-80 items-end justify-center',
                  !aplica && 'opacity-30 grayscale',
                )}
              >
                <img
                  src={CANAL_IMG[pieza]}
                  alt={title}
                  draggable={false}
                  className="h-full w-auto object-contain"
                />
              </div>
              <div className="h-6 text-center">
                {!aplica ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : pesado ? (
                  <span className="text-sm font-bold text-emerald-600">
                    {estado?.pesoKg?.toFixed(2)} kg ✓
                  </span>
                ) : tipoActivo ? (
                  <span className="text-xs font-semibold text-emerald-600">
                    Seleccionado
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {PIEZA_LABEL[pieza]}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-left">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>Animal</th>
              <th>Orden</th>
              <th>Pieza</th>
              <th className="text-right">Peso (kg)</th>
              <th>Hora</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.piezaId} className="[&>td]:px-3 [&>td]:py-2">
                <td className="font-semibold tabular-nums">#{p.consecutivo}</td>
                <td className="tabular-nums">{p.reference}</td>
                <td className="font-semibold text-red-600">
                  {PIEZA_LABEL[p.pieza]}
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {p.pesoKg.toFixed(2)}
                </td>
                <td className="tabular-nums">{hora(p.weighedAt)}</td>
                <td className="text-right">
                  <button
                    onClick={() => deshacer.mutate(p.piezaId)}
                    disabled={deshacer.isPending}
                    title="Deshacer"
                    className="text-muted-foreground hover:text-red-600"
                  >
                    <Undo2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AnimalesTab({
  date,
  detail,
  objetivoAnimal,
}: {
  date: string;
  detail: CanalLoteDetail | undefined;
  objetivoAnimal: CanalAnimal | null;
}) {
  const clasificar = useClasificarAnimal();
  const piezas = useCanalPiezas(date);
  const deshacer = useDeshacerCanal();
  const [destino, setDestino] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [cavaError, setCavaError] = useState<string | null>(null);

  const eventoId = objetivoAnimal?.eventoId ?? null;
  const rows = piezas.data ?? [];

  useEffect(() => {
    setDestino(objetivoAnimal?.destino ?? '');
    setObservaciones(objetivoAnimal?.observaciones ?? '');
    setCavaError(null);
  }, [eventoId, objetivoAnimal?.destino, objetivoAnimal?.observaciones]);

  if (!detail || !objetivoAnimal) {
    return (
      <Empty text="Selecciona una orden en la pestaña ORDENES para clasificar sus animales." />
    );
  }

  function guardar(
    campo: 'tipo' | 'bodega' | 'cava' | 'destino' | 'observaciones',
    valor: string,
  ) {
    if (!eventoId) return;
    if (campo === 'cava') {
      clasificar.mutate(
        { eventoId, cava: valor },
        {
          onSuccess: () => setCavaError(null),
          onError: (err) => {
            const detail = (
              err as { response?: { data?: { message?: string | string[] } } }
            ).response?.data?.message;
            setCavaError(
              Array.isArray(detail)
                ? detail.join(' ')
                : detail || 'No se pudo asignar la cava.',
            );
          },
        },
      );
      return;
    }
    clasificar.mutate({ eventoId, [campo]: valor });
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">
          Tipos:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {(['vaca', 'novilla'] as CanalAnimalTipo[]).map((t) => (
            <TipoButton
              key={t}
              tipo={t}
              activo={objetivoAnimal.canalAnimalTipo === t}
              onClick={() => guardar('tipo', t)}
            />
          ))}
          <div className="w-4" />
          {(['toro', 'novillo'] as CanalAnimalTipo[]).map((t) => (
            <TipoButton
              key={t}
              tipo={t}
              activo={objetivoAnimal.canalAnimalTipo === t}
              onClick={() => guardar('tipo', t)}
            />
          ))}
          <div className="w-4" />
          {(['bufala', 'bufalo'] as CanalAnimalTipo[]).map((t) => (
            <TipoButton
              key={t}
              tipo={t}
              activo={objetivoAnimal.canalAnimalTipo === t}
              onClick={() => guardar('tipo', t)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldBox label="Bodegas:">
          <select
            value={objetivoAnimal.bodega ?? ''}
            onChange={(e) => guardar('bodega', e.target.value)}
            className="h-9 w-full bg-transparent text-base font-medium outline-none"
          >
            <option value="">Seleccione...</option>
            {BODEGAS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </FieldBox>
        <FieldBox label="Destino:">
          <textarea
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            onBlur={() => guardar('destino', destino)}
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
                onClick={() => guardar('cava', c)}
                className={cn(
                  'rounded-sm border-2 px-3 py-2 text-sm font-semibold uppercase',
                  objetivoAnimal.cava === c
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-border bg-card hover:bg-muted',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {cavaError && (
            <p className="mt-2 text-sm font-medium text-red-600">
              {cavaError}
            </p>
          )}
        </div>
        <FieldBox label="Observaciones:" className="relative">
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            onBlur={() => guardar('observaciones', observaciones)}
            rows={1}
            className="w-full resize-none bg-transparent pr-10 text-base outline-none"
          />
          <Lock className="absolute right-2 top-1 size-5 text-muted-foreground" />
        </FieldBox>
      </div>

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-left">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>Animal</th>
              <th>Orden</th>
              <th>Pieza</th>
              <th className="text-right">Peso (kg)</th>
              <th>Hora</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.piezaId} className="[&>td]:px-3 [&>td]:py-2">
                <td className="font-semibold tabular-nums">#{p.consecutivo}</td>
                <td className="tabular-nums">{p.reference}</td>
                <td className="font-semibold text-red-600">
                  {PIEZA_LABEL[p.pieza]}
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {p.pesoKg.toFixed(2)}
                </td>
                <td className="tabular-nums">{hora(p.weighedAt)}</td>
                <td className="text-right">
                  <button
                    onClick={() => deshacer.mutate(p.piezaId)}
                    disabled={deshacer.isPending}
                    title="Deshacer"
                    className="text-muted-foreground hover:text-red-600"
                  >
                    <Undo2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TipoButton({
  tipo,
  activo,
  onClick,
}: {
  tipo: CanalAnimalTipo;
  activo: boolean;
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
      )}
    >
      {CANAL_ANIMAL_TIPO_LABEL[tipo]}
    </button>
  );
}

function ReporteTab({ date }: { date: string }) {
  const reporte = useCanalReporte(date);
  if (reporte.isLoading) return <Loading />;
  const data = reporte.data;
  const hayDatos = !!data && data.clientes.length > 0;
  return (
    <div className="flex h-full flex-col p-2">
      <div className="flex-1 overflow-auto">
        {!hayDatos ? (
          <Empty text="Sin datos para el reporte de esta fecha." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                <th>Cliente</th>
                <th className="text-center">Animales</th>
                <th className="text-center">Piezas</th>
                <th className="text-right">Peso (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.clientes.map((c) => (
                <tr key={c.cliente} className="[&>td]:px-3 [&>td]:py-2">
                  <td>{c.cliente}</td>
                  <td className="text-center tabular-nums">{c.animales}</td>
                  <td className="text-center tabular-nums">{c.piezas}</td>
                  <td className="text-right font-semibold tabular-nums">
                    {c.pesoKg.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 [&>td]:px-3 [&>td]:py-2 [&>td]:font-bold">
                <td>Total</td>
                <td></td>
                <td className="text-center tabular-nums">
                  {data.totalPiezas}
                </td>
                <td className="text-right tabular-nums">
                  {data.totalPesoKg.toFixed(2)}
                </td>
              </tr>
            </tfoot>
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
  detail,
  objetivo,
  turno,
  setTurno,
}: {
  detail: CanalLoteDetail | undefined;
  objetivo: { animal: CanalAnimal; pieza: CanalPiezaTipo | null } | null;
  turno: CanalTurno;
  setTurno: (t: CanalTurno) => void;
}) {
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const registrar = useRegistrarCanal();

  const valor = Number(peso.replace(',', '.'));
  const puedePesar =
    !!objetivo?.pieza && peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  function guardar(imprimir = false) {
    if (!objetivo?.pieza || !puedePesar || registrar.isPending) return;
    registrar.mutate(
      {
        eventoId: objetivo.animal.eventoId,
        pieza: objetivo.pieza,
        pesoKg: valor,
        turno,
      },
      {
        onSuccess: () => {
          setPeso('0.0');
          if (imprimir) window.print();
        },
      },
    );
  }

  const piezaLabel = objetivo?.pieza ? PIEZA_LABEL[objetivo.pieza] : '—';
  const animalNo = objetivo ? `#${objetivo.animal.consecutivo}` : '—';
  const osNo = detail?.reference != null ? String(detail.reference) : '—';
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
      <FieldBox label="Turno:">
        <select
          value={turno}
          onChange={(e) => setTurno(e.target.value as CanalTurno)}
          className="h-10 bg-transparent text-lg font-semibold outline-none"
        >
          <option value="manana">Mañana</option>
          <option value="tarde">Tarde</option>
        </select>
      </FieldBox>
      <FieldBox label="Peso(kg):" className="flex-1">
        <input
          value={peso}
          onChange={(e) => setPeso(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar(false);
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
        onClick={() => guardar(false)}
        disabled={!puedePesar || registrar.isPending}
        title="Registrar peso"
        className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        {registrar.isPending ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : (
          <Pencil className="size-6" />
        )}
      </button>
      <button
        onClick={() => guardar(true)}
        disabled={!puedePesar || registrar.isPending}
        title="Registrar e imprimir rótulo"
        className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        <Tag className="size-6" />
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

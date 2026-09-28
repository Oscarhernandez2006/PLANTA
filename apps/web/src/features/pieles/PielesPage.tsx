import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  Inbox,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { PielesIcon } from '@/components/icons/PielesIcon';
import { BasculaConexion, useBascula } from '@/components/bascula/Bascula';
import { cn, plantToday as today, soloDecimal } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import {
  usePielesLotes,
  usePielLoteDetail,
  useRegistrarPiel,
  type PielAnimal,
  type PielLote,
  type PielLoteDetail,
} from './api';

type Tab = 'ordenes' | 'pieles';
const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'ÓRDENES DE SERVICIO' },
  { key: 'pieles', label: 'PIELES' },
];

function hora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Identificador local del animal dentro de su guía de Peso en Pie (A01, A02…),
// igual al orden en que se insensibilizó.
function codigoAnimal(sequence: number) {
  return `A${String(sequence).padStart(2, '0')}`;
}

export function PielesPage() {
  const [tab, setTab] = useState<Tab>('ordenes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEventoId, setSelectedEventoId] = useState<string | null>(null);
  const lotes = usePielesLotes();
  const detail = usePielLoteDetail(selectedId);
  const registrar = useRegistrarPiel();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');

  const lista = lotes.data ?? [];
  const d = detail.data;
  const loteSel = d ?? lista.find((l) => l.ordenBeneficioId === selectedId);
  const refrescando = lotes.isFetching || detail.isFetching;

  const pendientes = d?.animales.filter((a) => !a.pesado) ?? [];

  // Selecciona automáticamente el primer animal por pesar.
  useEffect(() => {
    if (!pendientes.length) {
      setSelectedEventoId(null);
      return;
    }
    setSelectedEventoId((prev) =>
      prev && pendientes.some((a) => a.eventoId === prev) ? prev : pendientes[0].eventoId,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendientes.map((a) => a.eventoId).join(',')]);

  const animalSel = pendientes.find((a) => a.eventoId === selectedEventoId) ?? null;

  function seleccionarLote(id: string) {
    setSelectedId(id);
    setTab('pieles');
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  function guardar() {
    if (!animalSel || registrar.isPending) return;
    const valor = Number(peso.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return;
    registrar.mutate(
      { eventoId: animalSel.eventoId, pesoKg: valor },
      { onSuccess: () => setPeso('0.0') },
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col gap-2 p-2">
      {/* Encabezado: icono, fecha y cliente */}
      <div className="flex items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <PielesIcon className="size-10 text-foreground" />
        </div>
        <FieldBox label="Fecha:">
          <div className="flex h-9 items-center text-lg font-semibold">{today()}</div>
        </FieldBox>
        <FieldBox label="Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {loteSel?.cliente ?? '—'}
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
      <div ref={scrollRef} className="flex-1 overflow-auto rounded-sm border-2 border-border bg-card">
        {tab === 'ordenes' && (
          <OrdenesTab
            loading={lotes.isLoading}
            lotes={lista}
            selectedId={selectedId}
            onSelect={seleccionarLote}
          />
        )}
        {tab === 'pieles' && (
          <PielesTab
            detail={d}
            loading={!!selectedId && detail.isLoading}
            selectedEventoId={selectedEventoId}
            onSelectAnimal={setSelectedEventoId}
          />
        )}
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

      <BasculaConexion />

      {/* Pie: O.S No. / Animal No. / Peso(kg) + acciones */}
      <FooterPieles
        lote={loteSel}
        animal={animalSel}
        peso={peso}
        setPeso={setPeso}
        leyendo={leyendo}
        error={error}
        guardando={registrar.isPending}
        refrescando={refrescando}
        onLeer={leerBascula}
        onGuardar={guardar}
        onRefresh={() => {
          lotes.refetch();
          if (selectedId) detail.refetch();
        }}
      />
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
  lotes: PielLote[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (!lotes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <Inbox className="size-6" />
        Aún no hay animales caídos. En cuanto se insensibilice un animal, su lote aparecerá aquí.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 p-3">
      {lotes.map((l) => {
        const activo = l.ordenBeneficioId === selectedId;
        return (
          <li key={l.ordenBeneficioId}>
            <button
              onClick={() => onSelect(l.ordenBeneficioId)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm border-2 px-4 py-4 text-left text-lg font-medium transition-colors',
                activo
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <span>
                <span className="font-bold tabular-nums">{formatOB(l.reference)}</span>{' '}
                <span className="text-muted-foreground">|</span> {l.cliente}
              </span>
              <span className="tabular-nums text-sm text-muted-foreground">
                {l.pesados}/{l.caidos} pesados
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PielesTab({
  detail,
  loading,
  selectedEventoId,
  onSelectAnimal,
}: {
  detail: PielLoteDetail | undefined;
  loading: boolean;
  selectedEventoId: string | null;
  onSelectAnimal: (eventoId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <Inbox className="size-6" />
        Selecciona una orden en "Órdenes de servicio".
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-sm text-muted-foreground">
        Orden N.º {formatOB(detail.reference)} · {detail.date}
        {detail.guias.length ? ` · ${detail.guias.join(', ')}` : ''}
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="text-2xl font-bold tabular-nums text-foreground">{detail.pesados}</span>{' '}
        / {detail.caidos} pesados
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {detail.animales
          .filter((a) => !a.pesado)
          .map((a) => {
            const activo = a.eventoId === selectedEventoId;
            return (
              <button
                key={a.eventoId}
                onClick={() => onSelectAnimal(a.eventoId)}
                title={`Cayó ${hora(a.stunnedAt)}`}
                className={cn(
                  'relative flex aspect-square items-center justify-center rounded-lg border-2 text-2xl font-bold tabular-nums transition-all',
                  activo
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-300 hover:bg-emerald-100'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
                )}
              >
                {codigoAnimal(a.sequence)}
              </button>
            );
          })}
      </div>

      <div className="border-t border-border">
        <div className="py-3 text-sm font-semibold">Registro</div>
        {!detail.animales.some((a) => a.pesado) ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Clock className="size-4" /> Aún no hay pieles pesadas.
          </div>
        ) : (
          <div className="max-h-72 overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-16">#</TH>
                  <TH>Hora</TH>
                  <TH>Operario</TH>
                  <TH>Peso (kg)</TH>
                </TR>
              </THead>
              <TBody>
                {detail.animales
                  .filter((a) => a.pesado)
                  .reverse()
                  .map((a) => (
                    <TR key={a.eventoId}>
                      <TD className="font-semibold tabular-nums">{codigoAnimal(a.sequence)}</TD>
                      <TD className="tabular-nums">{hora(a.pieladoAt)}</TD>
                      <TD>{a.operatorName ?? '—'}</TD>
                      <TD className="tabular-nums">{a.pesoKg?.toFixed(2)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function FooterPieles({
  lote,
  animal,
  peso,
  setPeso,
  leyendo,
  error,
  guardando,
  refrescando,
  onLeer,
  onGuardar,
  onRefresh,
}: {
  lote: PielLote | undefined;
  animal: PielAnimal | null;
  peso: string;
  setPeso: (v: string) => void;
  leyendo: boolean;
  error: string | null;
  guardando: boolean;
  refrescando: boolean;
  onLeer: () => void;
  onGuardar: () => void;
  onRefresh: () => void;
}) {
  const osNo = lote ? formatOB(lote.reference) : '—';
  const animalNo = animal ? codigoAnimal(animal.sequence) : '—';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-stretch gap-2">
        <FieldBox label="O.S No.:">
          <div className="flex h-10 min-w-40 items-center text-2xl font-bold tabular-nums">
            {osNo}
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
              if (e.key === 'Enter') onGuardar();
            }}
            inputMode="decimal"
            placeholder="0.0"
            disabled={!animal}
            className="h-10 w-full bg-transparent text-center text-3xl font-bold text-emerald-700 outline-none disabled:opacity-50"
          />
        </FieldBox>

        <button
          onClick={onLeer}
          disabled={leyendo || !animal}
          title="Leer báscula"
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
        >
          {leyendo ? <LoaderCircle className="size-6 animate-spin" /> : <Gauge className="size-6" />}
        </button>
        <button
          onClick={onGuardar}
          disabled={!animal || guardando || peso.trim() === ''}
          title="Registrar peso de la piel"
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
        >
          {guardando ? <LoaderCircle className="size-6 animate-spin" /> : <Check className="size-6" />}
        </button>
        <button
          onClick={onRefresh}
          disabled={refrescando}
          title="Actualizar"
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn('size-6', refrescando && 'animate-spin')} />
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
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
      <span className="absolute -top-3 left-3 max-w-[85%] truncate bg-background px-2 text-xs font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

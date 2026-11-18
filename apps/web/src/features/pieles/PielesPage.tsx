import { useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gauge,
  Inbox,
  LayoutGrid,
  List,
  LoaderCircle,
  Lock,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useBascula } from '@/components/bascula/Bascula';
import { FechaFiltro } from '@/components/ui/fecha-filtro';
import { cn, formatFechaDia, soloDecimal } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import {
  useCerrarPielesLote,
  usePielesLotes,
  usePielLoteDetail,
  useRegistrarPiel,
  type PielAnimal,
  type PielLote,
  type PielLoteDetail,
} from './api';

type Tab = 'ordenes' | 'pieles';
type EstadoKey = 'proceso' | 'pendiente' | 'cerrar';

const ESTADOS: { key: EstadoKey; texto: string }[] = [
  { key: 'proceso', texto: 'En proceso' },
  { key: 'pendiente', texto: 'Sin iniciar' },
  { key: 'cerrar', texto: 'Para cerrar' },
];

const VISTA_KEY = 'pieles.vistaOrdenes';

function estadoLote(l: PielLote) {
  if (l.caidos >= l.animalCount && l.pesados >= l.caidos) {
    return { key: 'cerrar' as EstadoKey, texto: 'Lista para cerrar', clase: 'bg-primary/10 text-primary ring-primary/30', punto: 'bg-primary', barra: 'bg-primary' };
  }
  if (l.pesados > 0) {
    return { key: 'proceso' as EstadoKey, texto: 'En proceso', clase: 'bg-amber-50 text-amber-800 ring-amber-300', punto: 'bg-amber-500', barra: 'bg-amber-500' };
  }
  return { key: 'pendiente' as EstadoKey, texto: 'Sin iniciar', clase: 'bg-muted text-muted-foreground ring-border', punto: 'bg-muted-foreground/60', barra: 'bg-transparent' };
}

function kg(n: number) {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function hora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}


export function PielesPage() {
  const [tab, setTab] = useState<Tab>('ordenes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEventoId, setSelectedEventoId] = useState<string | null>(null);
  // Filtro de fecha: null = lotes abiertos (comportamiento normal).
  const [fechaFiltro, setFechaFiltro] = useState<string | null>(null);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const lotes = usePielesLotes(fechaFiltro);
  const detail = usePielLoteDetail(selectedId);
  const registrar = useRegistrarPiel();
  const cerrar = useCerrarPielesLote();
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');

  function flashNotice(type: 'success' | 'error', text: string) {
    setNotice({ type, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }

  const lista = lotes.data ?? [];
  const d = detail.data;
  const loteSel = d ?? lista.find((l) => l.ordenBeneficioId === selectedId);
  const refrescando = lotes.isFetching || detail.isFetching;

  const pendientes = d?.animales.filter((a) => !a.pesado) ?? [];
  const pesadas = d?.animales.filter((a) => a.pesado) ?? [];
  const totalKg = pesadas.reduce((s, a) => s + (a.pesoKg ?? 0), 0);
  const promedio = pesadas.length ? totalKg / pesadas.length : null;
  const faltanCaer = d ? Math.max(0, d.animalCount - d.caidos) : 0;
  const puedeCerrar = !!d && !d.cerrada && faltanCaer === 0 && pendientes.length === 0;

  // El operario escoge la tarjeta (verde) del animal cuya piel va a pesar.
  const animalSel = pendientes.find((a) => a.eventoId === selectedEventoId) ?? null;

  function seleccionarLote(id: string) {
    setSelectedId(id);
    setSelectedEventoId(null);
    setTab('pieles');
  }

  function cambiarFecha(valor: string | null) {
    setFechaFiltro(valor);
    setSelectedId(null);
    setSelectedEventoId(null);
    setTab('ordenes');
  }

  function cerrarLote() {
    if (!selectedId || !d) return;
    const ref = formatOB(d.reference);
    cerrar.mutate(selectedId, {
      onSuccess: () => {
        setConfirmarCierre(false);
        setSelectedId(null);
        setSelectedEventoId(null);
        setTab('ordenes');
        flashNotice('success', `Orden ${ref} cerrada en Pieles.`);
      },
      onError: (err) => {
        setConfirmarCierre(false);
        const msg = (err as { response?: { data?: { message?: string | string[] } } })
          .response?.data?.message;
        flashNotice('error', Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo cerrar la orden.');
      },
    });
  }

  function guardar() {
    if (!animalSel || registrar.isPending) return;
    const valor = Number(peso.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return;
    const actual = animalSel;
    // Tras registrar, queda seleccionado el siguiente animal por pesar.
    const resto = pendientes.filter((a) => a.eventoId !== actual.eventoId);
    const siguiente = resto.find((a) => a.consecutivo > actual.consecutivo) ?? resto[0] ?? null;
    registrar.mutate(
      { eventoId: actual.eventoId, pesoKg: valor },
      {
        onSuccess: () => {
          setPeso('0.0');
          setSelectedEventoId(siguiente?.eventoId ?? null);
          flashNotice('success', `Piel del animal ${actual.consecutivo} registrada: ${kg(valor)} kg.`);
        },
        onError: (err) => {
          const msg = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
          flashNotice('error', Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo registrar el peso.');
        },
      },
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Avisos flotantes: no empujan el contenido */}
      <div className="pointer-events-none fixed left-1/2 top-24 z-50 flex w-[30rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 flex-col gap-2">
        {notice && (
          <div
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-lg animate-in fade-in-0 slide-in-from-top-2',
              notice.type === 'success' ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700',
            )}
          >
            {notice.type === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <Clock className="size-4 shrink-0" />}
            <span className="flex-1">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar" className="shrink-0 opacity-60 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      {tab === 'ordenes' ? (
        <OrdenesPieles
          loading={lotes.isLoading}
          lotes={lista}
          selectedId={selectedId}
          onSelect={seleccionarLote}
          fechaFiltro={fechaFiltro}
          onFecha={cambiarFecha}
          refrescando={refrescando}
          onRefresh={() => lotes.refetch()}
        />
      ) : (
        <>
          {/* Encabezado de la orden abierta */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setTab('ordenes')}>
              <ArrowLeft className="size-5" />
              Órdenes
            </Button>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">
              {loteSel ? formatOB(loteSel.reference) : '—'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold uppercase">{loteSel?.cliente ?? '—'}</div>
              {d && (
                <div className="text-sm text-muted-foreground">
                  <b className="tabular-nums text-foreground">{d.pesados}</b>/{d.caidos} pieles pesadas ·{' '}
                  <b className="tabular-nums text-foreground">{kg(totalKg)}</b> kg
                  {d.guias.length ? ` · Guía ${d.guias.join(', ')}` : ''}
                </div>
              )}
            </div>
            <Button
              variant={puedeCerrar ? 'default' : 'outline'}
              className="h-12 px-5 text-base"
              onClick={() => setConfirmarCierre(true)}
              disabled={!puedeCerrar || cerrar.isPending}
              title={
                faltanCaer > 0
                  ? `Faltan ${faltanCaer} ${faltanCaer === 1 ? 'animal' : 'animales'} por sacrificar para poder cerrar`
                  : pendientes.length > 0
                    ? `Faltan ${pendientes.length} ${pendientes.length === 1 ? 'piel' : 'pieles'} por pesar para poder cerrar`
                    : 'Cerrar la orden: desaparece de Pieles'
              }
            >
              {cerrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Lock className="size-5" />}
              Cerrar orden
            </Button>
          </div>

          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="scrollbar-app min-h-0 overflow-auto rounded-xl border border-border bg-card">
              <PielesTab
                detail={d}
                loading={!!selectedId && detail.isLoading}
                selectedEventoId={selectedEventoId}
                onSelectAnimal={(id) => setSelectedEventoId((actual) => (actual === id ? null : id))}
                faltanCaer={faltanCaer}
                puedeCerrar={puedeCerrar}
                promedio={promedio}
              />
            </div>
            <PanelBascula
              animal={animalSel}
              peso={peso}
              setPeso={setPeso}
              leyendo={leyendo}
              error={error}
              guardando={registrar.isPending}
              refrescando={refrescando}
              promedio={promedio}
              onLeer={leerBascula}
              onGuardar={guardar}
              onRefresh={() => {
                lotes.refetch();
                if (selectedId) detail.refetch();
              }}
            />
          </div>
        </>
      )}

      {confirmarCierre && d && (
        <Dialog open onClose={() => !cerrar.isPending && setConfirmarCierre(false)} title="Cerrar orden" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              ¿Está seguro de cerrar en Pieles la orden con consecutivo <b>{formatOB(d.reference)}</b>?
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Las {d.pesados} pieles de la orden ya están pesadas. La orden deja de aparecer en
              Pieles y ya no se podrán registrar pesos. Los demás módulos siguen funcionando con
              esta orden.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarCierre(false)} disabled={cerrar.isPending}>
                No
              </Button>
              <Button disabled={cerrar.isPending} onClick={cerrarLote}>
                <Lock className="size-4" />
                {cerrar.isPending ? 'Cerrando…' : 'Sí, cerrar'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function OrdenesPieles({
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
  lotes: PielLote[];
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
    ? lotes.filter((l) => [formatOB(l.reference), l.cliente, ...l.guias].join(' ').toUpperCase().includes(q))
    : lotes;
  const conteo = (k: EstadoKey) => buscadas.filter((l) => estadoLote(l).key === k).length;
  const prioridad: Record<EstadoKey, number> = { proceso: 0, pendiente: 1, cerrar: 2 };
  const visibles = buscadas
    .filter((l) => !filtroEstado || estadoLote(l).key === filtroEstado)
    .sort((a, b) => prioridad[estadoLote(a).key] - prioridad[estadoLote(b).key] || a.reference - b.reference);

  return (
    <>
      {/* Barra: fecha, búsqueda, filtros y vista */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 rounded-lg border border-input px-3">
          <CalendarDays className="size-5 text-muted-foreground" />
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
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : !visibles.length ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Inbox className="size-8" />
            {q || filtroEstado
              ? 'Ninguna orden coincide con la búsqueda o el filtro.'
              : fechaFiltro
                ? `No hay órdenes abiertas con animales caídos del ${formatFechaDia(fechaFiltro)}.`
                : 'No hay órdenes abiertas. En cuanto se sacrifique un animal, su orden aparecerá aquí.'}
          </div>
        ) : vista === 'lista' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH className="h-10 w-28">Orden</TH>
                  <TH className="h-10">Cliente</TH>
                  <TH className="h-10">Guía</TH>
                  <TH className="h-10 text-right">Caídos</TH>
                  <TH className="h-10 text-right">Kg pieles</TH>
                  <TH className="h-10 w-64">Pieles pesadas</TH>
                  <TH className="h-10 w-12" />
                </TR>
              </THead>
              <TBody>
                {visibles.map((l) => {
                  const estado = estadoLote(l);
                  const pct = l.animalCount ? Math.round((l.pesados / l.animalCount) * 100) : 0;
                  return (
                    <TR
                      key={l.ordenBeneficioId}
                      onClick={() => onSelect(l.ordenBeneficioId)}
                      className={cn('h-16 cursor-pointer', l.ordenBeneficioId === selectedId && 'bg-primary/5')}
                    >
                      <TD className="relative py-2">
                        <span className={cn('absolute inset-y-0 left-0 w-1', estado.barra)} />
                        <span className="text-lg font-bold tabular-nums text-primary">{formatOB(l.reference)}</span>
                      </TD>
                      <TD className="max-w-80 py-2">
                        <div className="truncate text-base font-semibold uppercase">{l.cliente}</div>
                        <div className="text-xs text-muted-foreground">Sacrificio {formatFechaDia(l.date)}</div>
                      </TD>
                      <TD className="py-2 text-base tabular-nums">
                        {l.guias.length > 1 ? `${l.guias.length} guías` : l.guias[0] ?? '—'}
                      </TD>
                      <TD className="py-2 text-right text-base tabular-nums">
                        {l.caidos}/{l.animalCount}
                      </TD>
                      <TD className="py-2 text-right text-base font-semibold tabular-nums">
                        {kg(l.pesoTotalKg ?? 0)}
                      </TD>
                      <TD className="py-2">
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-14 text-right text-sm font-semibold tabular-nums">
                            {l.pesados}/{l.animalCount}
                          </span>
                          <span className={cn('size-2.5 rounded-full', estado.punto)} title={estado.texto} />
                        </div>
                      </TD>
                      <TD className="py-2 text-muted-foreground">
                        <ChevronRight className="size-5" />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {visibles.map((l) => {
              const estado = estadoLote(l);
              const pct = l.animalCount ? Math.round((l.pesados / l.animalCount) * 100) : 0;
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
                      <Dato label="Caídos">{l.caidos}/{l.animalCount}</Dato>
                      <Dato label="Pieles pesadas">{l.pesados}</Dato>
                      <Dato label="Kg pieles">{kg(l.pesoTotalKg ?? 0)}</Dato>
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

function PielesTab({
  detail,
  loading,
  selectedEventoId,
  onSelectAnimal,
  faltanCaer,
  puedeCerrar,
  promedio,
}: {
  detail: PielLoteDetail | undefined;
  loading: boolean;
  selectedEventoId: string | null;
  onSelectAnimal: (eventoId: string) => void;
  faltanCaer: number;
  puedeCerrar: boolean;
  promedio: number | null;
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
        Selecciona una orden.
      </div>
    );
  }

  const porPesar = detail.animales.filter((a) => !a.pesado);
  // Registro: la más reciente arriba.
  const registro = detail.animales
    .filter((a) => a.pesado)
    .sort((a, b) => (b.pieladoAt ?? '').localeCompare(a.pieladoAt ?? ''));

  return (
    <div className="flex flex-col gap-5 p-4">
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Por pesar <span className="tabular-nums text-foreground">({porPesar.length})</span>
          </h3>
          {faltanCaer > 0 && (
            <span className="text-sm text-amber-700">
              Faltan {faltanCaer} {faltanCaer === 1 ? 'animal' : 'animales'} por sacrificar
            </span>
          )}
        </div>
        {puedeCerrar ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
            <CheckCircle2 className="size-5" />
            Todas las pieles de la orden están pesadas. Revisá el registro y cerrá la orden.
          </div>
        ) : !porPesar.length ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            <Clock className="size-4" /> Esperando que caigan más animales…
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
            {porPesar.map((a) => {
              const activo = a.eventoId === selectedEventoId;
              return (
                <button
                  key={a.eventoId}
                  onClick={() => onSelectAnimal(a.eventoId)}
                  aria-pressed={activo}
                  title={`Animal ${a.consecutivo} (cayó ${hora(a.stunnedAt)})`}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all active:scale-95',
                    activo
                      ? 'border-primary bg-primary text-primary-foreground shadow-md ring-4 ring-primary/20'
                      : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50',
                  )}
                >
                  <span className="text-3xl font-bold tabular-nums">{a.consecutivo}</span>
                  {a.tipoAnimal && (
                    <span className={cn('text-xs font-semibold uppercase', activo ? 'text-primary-foreground/90' : 'text-muted-foreground')}>
                      {a.tipoAnimal}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Registro <span className="tabular-nums text-foreground">({registro.length})</span>
        </h3>
        {!registro.length ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            <Clock className="size-4" /> Aún no hay pieles pesadas.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <THead>
                <TR>
                  <TH className="h-9 w-20">Turno</TH>
                  <TH className="h-9">Tipo</TH>
                  <TH className="h-9 w-28">Hora</TH>
                  <TH className="h-9">Operario</TH>
                  <TH className="h-9 w-28 text-right">Peso (kg)</TH>
                  <TH className="h-9 w-28 text-right">vs prom.</TH>
                </TR>
              </THead>
              <TBody>
                {registro.map((a, i) => {
                  const dif = promedio != null && a.pesoKg != null ? a.pesoKg - promedio : null;
                  // Más de 15 % lejos del promedio de la orden: se resalta.
                  const fuera = dif != null && promedio ? Math.abs(dif) / promedio > 0.15 : false;
                  return (
                    <TR key={a.eventoId} className={cn(i === 0 && 'bg-primary/5')}>
                      <TD className="py-2 text-base font-semibold tabular-nums">{a.consecutivo}</TD>
                      <TD className="py-2 text-sm uppercase">{a.tipoAnimal ?? '—'}</TD>
                      <TD className="py-2 tabular-nums">{hora(a.pieladoAt)}</TD>
                      <TD className="py-2">{a.operatorName ?? '—'}</TD>
                      <TD className="py-2 text-right text-base font-semibold tabular-nums">
                        {a.pesoKg != null ? kg(a.pesoKg) : '—'}
                      </TD>
                      <TD
                        className={cn(
                          'py-2 text-right tabular-nums',
                          fuera ? 'font-semibold text-amber-700' : 'text-muted-foreground',
                        )}
                      >
                        {dif == null ? '—' : `${dif > 0 ? '+' : dif < 0 ? '−' : ''}${kg(Math.abs(dif))}`}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function PanelBascula({
  animal,
  peso,
  setPeso,
  leyendo,
  error,
  guardando,
  refrescando,
  promedio,
  onLeer,
  onGuardar,
  onRefresh,
}: {
  animal: PielAnimal | null;
  peso: string;
  setPeso: (v: string) => void;
  leyendo: boolean;
  error: string | null;
  guardando: boolean;
  refrescando: boolean;
  promedio: number | null;
  onLeer: () => void;
  onGuardar: () => void;
  onRefresh: () => void;
}) {
  const valor = Number(peso.replace(',', '.'));
  const valido = Number.isFinite(valor) && valor > 0;

  return (
    <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Animal</div>
          {animal ? (
            <>
              <div className="text-5xl font-bold tabular-nums leading-tight">{animal.consecutivo}</div>
              <div className="text-sm text-muted-foreground">
                {animal.tipoAnimal ? `${animal.tipoAnimal} · ` : ''}cayó {hora(animal.stunnedAt)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-base text-muted-foreground">Tocá un animal de la lista “Por pesar”.</div>
          )}
        </div>
        <Button variant="outline" className="size-11 shrink-0 p-0" onClick={onRefresh} disabled={refrescando} title="Actualizar">
          <RefreshCw className={cn('size-5', refrescando && 'animate-spin')} />
        </Button>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peso de la piel</span>
        <div
          className={cn(
            'mt-1 flex items-baseline justify-center gap-2 rounded-xl border-2 bg-muted/30 px-4 py-4 transition-colors',
            animal ? 'border-primary/40 focus-within:border-primary' : 'border-border opacity-60',
          )}
        >
          <input
            value={peso}
            onChange={(e) => setPeso(soloDecimal(e.target.value))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onGuardar();
            }}
            inputMode="decimal"
            placeholder="0.0"
            disabled={!animal}
            aria-label="Peso de la piel en kg"
            className="w-full min-w-0 bg-transparent text-right text-6xl font-bold tabular-nums text-foreground outline-none"
          />
          <span className="text-2xl font-semibold text-muted-foreground">kg</span>
        </div>
      </label>
      {error && <p className="-mt-2 text-sm font-medium text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-16 text-base" onClick={onLeer} disabled={leyendo || !animal}>
          {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
          Leer báscula
        </Button>
        <Button className="h-16 text-base" onClick={onGuardar} disabled={!animal || guardando || !valido}>
          {guardando ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
          Registrar piel
        </Button>
      </div>

      <div className="mt-auto flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Promedio de la orden</span>
        <span className="text-base font-semibold tabular-nums">{promedio != null ? `${kg(promedio)} kg` : '—'}</span>
      </div>
    </div>
  );
}

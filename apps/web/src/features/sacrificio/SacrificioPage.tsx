import { useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Inbox,
  LayoutGrid,
  List,
  LoaderCircle,
  Lock,
  RefreshCw,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Numpad } from '@/components/ui/numpad';
import { FechaFiltro } from '@/components/ui/fecha-filtro';
import { SacrificioIcon } from '@/components/icons/SacrificioIcon';
import { cn, formatFechaDia } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import { formatReferencia } from '../peso-en-camion/api';
import { formatBP } from '../peso-en-pie/api';
import {
  useSacrificioPendientes,
  useSacrificioDetail,
  useStunNext,
  useUndoLast,
  useCerrarOrden,
  type SacrificioDetail,
  type SacrificioOrderResumen,
} from './api';
import { downloadCabezaPatasTicket } from './cabeza-patas-print';

type Tab = 'ordenes' | 'animales';

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Turno del animal en el día: consecutivo que sigue entre órdenes (no se
// reinicia por orden) y vuelve a 1 con el día de planta (5:00 a. m.).
function turnoAnimal(consecutivoBase: number | undefined, sequence: number) {
  return String((consecutivoBase ?? 0) + sequence);
}

export function SacrificioPage() {
  const [tab, setTab] = useState<Tab>('ordenes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Filtro de fecha: null = todas las órdenes activas (comportamiento normal).
  const [fechaFiltro, setFechaFiltro] = useState<string | null>(null);
  const pendientes = useSacrificioPendientes(fechaFiltro);
  const detail = useSacrificioDetail(selectedId);
  const stun = useStunNext();
  // Tarjeta que se está sacrificando (para mostrar su indicador de carga).
  const [stunSeq, setStunSeq] = useState<number | null>(null);
  // Devolver el último animal caído: pide el PIN de quien lo tumbó.
  const [undoOpen, setUndoOpen] = useState(false);
  const undo = useUndoLast();
  // Cerrar la orden cuando ya cayeron todos sus animales.
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const cerrar = useCerrarOrden();
  // Animal marcado en el Registro (para devolverlo); sin selección, el ↶
  // devuelve el último caído.
  const [animalSelSeq, setAnimalSelSeq] = useState<number | null>(null);
  // Tarjeta pendiente seleccionada (en verde): la que tumba el botón del pie.
  const [cardSelSeq, setCardSelSeq] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Aviso temporal de éxito/error al sacrificar o deshacer.
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Un aviso nuevo reinicia el temporizador (si no, el del aviso anterior lo borra).
  const noticeTimer = useRef<number | undefined>(undefined);
  function flashNotice(type: 'success' | 'error', text: string) {
    setNotice({ type, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }

  const lista = pendientes.data ?? [];
  const d = detail.data;
  // Tarjeta seleccionada, solo si ese animal sigue pendiente.
  const cardSel =
    d && cardSelSeq != null && !d.eventos.some((e) => e.sequence === cardSelSeq)
      ? cardSelSeq
      : null;
  // Animal a devolver con ↶: el marcado en el Registro, o el último caído.
  const eventoSel = d?.eventos.find((e) => e.sequence === animalSelSeq) ?? null;
  const eventoDevolver = eventoSel ?? (d ? ultimoCaido(d) : null);
  const ordenSel = d ?? lista.find((o) => o.id === selectedId);
  const cliente = ordenSel
    ? `${ordenSel.clienteNit ? `${ordenSel.clienteNit} - ` : ''}${ordenSel.cliente}`
    : '';
  const refrescando = pendientes.isFetching || detail.isFetching;
  const completo = !!d && d.insensibilizados >= d.animalCount;

  function cerrarOrden() {
    if (!selectedId || !d) return;
    const ref = formatOB(d.reference);
    cerrar.mutate(selectedId, {
      onSuccess: () => {
        setConfirmarCierre(false);
        setSelectedId(null);
        setAnimalSelSeq(null);
        setCardSelSeq(null);
        setTab('ordenes');
        flashNotice('success', `Orden ${ref} cerrada.`);
      },
      onError: (error) => {
        setConfirmarCierre(false);
        const msg = (error as { response?: { data?: { message?: string | string[] } } })
          .response?.data?.message;
        flashNotice('error', Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo cerrar la orden.');
      },
    });
  }

  function seleccionarOrden(id: string) {
    setSelectedId(id);
    setAnimalSelSeq(null);
    setCardSelSeq(null);
    setTab('animales');
  }

  function cambiarFecha(valor: string | null) {
    setFechaFiltro(valor);
    setSelectedId(null);
    setAnimalSelSeq(null);
    setCardSelSeq(null);
    setTab('ordenes');
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  // Sacrifica el animal de la tarjeta seleccionada (el operario escoge el orden).
  function stunNext(sequence: number) {
    if (!selectedId) return;
    setStunSeq(sequence);
    stun.mutate({ id: selectedId, sequence }, {
      onSuccess: (data) => {
        const ultimo = [...data.eventos].sort(
          (a, b) => new Date(b.stunnedAt).getTime() - new Date(a.stunnedAt).getTime(),
        )[0];
        const caido = data.eventos.find((e) => e.sequence === sequence) ?? ultimo;
        setCardSelSeq(null);
        flashNotice('success', `Animal ${caido ? turnoAnimal(data.consecutivoBase, caido.sequence) : ''} sacrificado con éxito.`);
        if (data.cabezasPatas) {
          if (caido) {
            downloadCabezaPatasTicket({
              cliente: data.cliente,
              reference: data.reference,
              guias: data.guias,
              consecutivo: (data.consecutivoBase ?? 0) + caido.sequence,
              fecha: data.date,
              hora: new Date(caido.stunnedAt).toLocaleTimeString('es-CO'),
            });
          }
        }
        // Con el último animal la orden sigue abierta hasta que el operario
        // la cierre con "Cerrar orden".
      },
      onError: (error) => {
        const detalle = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
        flashNotice('error', detalle || 'No se pudo registrar el sacrificio. Intenta de nuevo.');
      },
      onSettled: () => setStunSeq(null),
    });
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
        <OrdenesVista
          loading={pendientes.isLoading}
          ordenes={lista}
          selectedId={selectedId}
          onSelect={seleccionarOrden}
          fechaFiltro={fechaFiltro}
          onFecha={cambiarFecha}
          refrescando={refrescando}
          onRefresh={() => pendientes.refetch()}
        />
      ) : (
        <>
      {/* Encabezado de la orden abierta */}
      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setTab('ordenes')}>
          <ArrowLeft className="size-5" />
          Órdenes
        </Button>
        <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">
          {ordenSel ? formatOB(ordenSel.reference) : '—'}
        </span>
        <span className="min-w-0 flex-1 truncate text-lg font-semibold uppercase">{cliente || '—'}</span>
      </div>

      {/* Contenido */}
      <div
        ref={scrollRef}
        className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card"
      >
          <AnimalesTab
            detail={d}
            loading={!!selectedId && detail.isLoading}
            stunPending={stun.isPending}
            stunSeq={stunSeq}
            cardSelSeq={cardSel}
            onSelectCard={(seq) => setCardSelSeq((actual) => (actual === seq ? null : seq))}
            selectedSeq={animalSelSeq}
            onSelectSeq={(seq) => setAnimalSelSeq((actual) => (actual === seq ? null : seq))}
            puedeCerrar={completo && !stun.isPending && !undo.isPending}
            cerrando={cerrar.isPending}
            onCerrar={() => setConfirmarCierre(true)}
          />
      </div>

      {/* Botones de desplazamiento */}
      <div className="grid shrink-0 grid-cols-2 gap-2">
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

      {/* Pie: O.S No. / Animal No. + acciones */}
      <FooterSacrificio
        detail={d}
        stunPending={stun.isPending}
        undoPending={undo.isPending}
        refrescando={refrescando}
        onStun={() => cardSel != null && stunNext(cardSel)}
        cardSeleccionada={cardSel}
        onUndo={() => selectedId && setUndoOpen(true)}
        animalSeleccionado={eventoSel ? turnoAnimal(d?.consecutivoBase, eventoSel.sequence) : null}
        onRefresh={() => {
          pendientes.refetch();
          if (selectedId) detail.refetch();
        }}
      />
        </>
      )}

      {confirmarCierre && d && (
        <Dialog open onClose={() => !cerrar.isPending && setConfirmarCierre(false)} title="Cerrar orden" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              ¿Está seguro de cerrar la orden con consecutivo <b>{formatOB(d.reference)}</b>?
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Los {d.animalCount} animales ya están sacrificados. La orden deja de aparecer en
              Sacrificio y ya no se podrán tumbar ni devolver animales. Pieles, Subproductos y
              Canal Caliente siguen funcionando con esta orden.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarCierre(false)} disabled={cerrar.isPending}>
                No
              </Button>
              <Button disabled={cerrar.isPending} onClick={cerrarOrden}>
                <Lock className="size-4" />
                {cerrar.isPending ? 'Cerrando…' : 'Sí, cerrar'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      <DevolverTurnoDialog
        open={undoOpen}
        evento={eventoDevolver}
        turno={eventoDevolver ? turnoAnimal(d?.consecutivoBase, eventoDevolver.sequence) : null}
        pending={undo.isPending}
        onClose={() => setUndoOpen(false)}
        onConfirm={(pin) =>
          new Promise<string | null>((resolve) => {
            if (!selectedId || !eventoDevolver) return resolve(null);
            const ev = eventoDevolver;
            undo.mutate(
              { id: selectedId, pin, sequence: ev.sequence },
              {
                onSuccess: () => {
                  setUndoOpen(false);
                  setAnimalSelSeq(null);
                  flashNotice('success', `Animal ${turnoAnimal(d?.consecutivoBase, ev.sequence)} devuelto.`);
                  resolve(null);
                },
                onError: (error) => {
                  const msg = (error as { response?: { data?: { message?: string | string[] } } })
                    .response?.data?.message;
                  resolve(Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo devolver el animal.');
                },
              },
            );
          })
        }
      />
    </div>
  );
}

/** Último animal tumbado (por hora) de la orden. */
function ultimoCaido(d: SacrificioDetail) {
  return d.eventos.reduce<SacrificioDetail['eventos'][number] | null>(
    (ult, e) => (!ult || e.stunnedAt > ult.stunnedAt ? e : ult),
    null,
  );
}

function DevolverTurnoDialog({
  open,
  evento,
  pending,
  onClose,
  onConfirm,
  turno,
}: {
  open: boolean;
  evento: SacrificioDetail['eventos'][number] | null;
  /** Turno del día del animal a devolver. */
  turno: string | null;
  pending: boolean;
  onClose: () => void;
  /** Devuelve el mensaje de error, o null si se devolvió el animal. */
  onConfirm: (pin: string) => Promise<string | null>;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    setPin('');
    setError(null);
    onClose();
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (pin.length < 4 || pending) return;
    setError(null);
    const err = await onConfirm(pin);
    setPin('');
    if (err) setError(err);
    else setError(null);
  }

  return (
    <Dialog
      open={open}
      onClose={() => !pending && cerrar()}
      title={evento && turno ? `Devolver animal ${turno}` : 'Devolver animal'}
      className="max-w-2xl"
    >
      {evento && (
        <form onSubmit={submit} className="grid gap-4 px-5 pb-5 pt-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Lo tumbó <span className="font-semibold text-foreground">{evento.operatorName}</span> ({hora(evento.stunnedAt)}).
              Ingresa su PIN de inicio de sesión para devolverlo.
            </p>
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="off"
              aria-label="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="PIN"
              className="h-12 text-center text-2xl tracking-[0.5em]"
            />
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <div className="mt-auto flex gap-2">
              <Button type="button" variant="outline" className="h-12 flex-1" onClick={cerrar} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" className="h-12 flex-1" disabled={pending || pin.length < 4}>
                {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                Devolver
              </Button>
            </div>
          </div>
          <Numpad
            disabled={pending}
            onDigit={(dgt) => setPin((p) => (p + dgt).slice(0, 12))}
            onBackspace={() => setPin((p) => p.slice(0, -1))}
            onClear={() => setPin('')}
          />
        </form>
      )}
    </Dialog>
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

type EstadoKey = 'proceso' | 'pendiente' | 'cerrar';

const ESTADOS: { key: EstadoKey; texto: string }[] = [
  { key: 'proceso', texto: 'En proceso' },
  { key: 'pendiente', texto: 'Sin iniciar' },
  { key: 'cerrar', texto: 'Para cerrar' },
];

function estadoOrden(o: SacrificioOrderResumen) {
  if (o.insensibilizados >= o.animalCount) {
    return { key: 'cerrar' as EstadoKey, texto: 'Lista para cerrar', clase: 'bg-primary/10 text-primary ring-primary/30', punto: 'bg-primary', barra: 'bg-primary' };
  }
  if (o.insensibilizados > 0) {
    return { key: 'proceso' as EstadoKey, texto: 'En proceso', clase: 'bg-amber-50 text-amber-800 ring-amber-300', punto: 'bg-amber-500', barra: 'bg-amber-500' };
  }
  return { key: 'pendiente' as EstadoKey, texto: 'Sin iniciar', clase: 'bg-muted text-muted-foreground ring-border', punto: 'bg-muted-foreground/60', barra: 'bg-transparent' };
}

const VISTA_KEY = 'sacrificio.vistaOrdenes';

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function OrdenesVista({
  loading,
  ordenes,
  selectedId,
  onSelect,
  fechaFiltro,
  onFecha,
  refrescando,
  onRefresh,
}: {
  loading: boolean;
  ordenes: SacrificioOrderResumen[];
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
    ? ordenes.filter((o) =>
        [formatOB(o.reference), o.cliente, o.clienteNit ?? '', ...o.guias, ...o.lotes]
          .join(' ')
          .toUpperCase()
          .includes(q),
      )
    : ordenes;
  const conteo = (k: EstadoKey) => buscadas.filter((o) => estadoOrden(o).key === k).length;
  const prioridad: Record<EstadoKey, number> = { proceso: 0, pendiente: 1, cerrar: 2 };
  const visibles = buscadas
    .filter((o) => !filtroEstado || estadoOrden(o).key === filtroEstado)
    .sort(
      (a, b) =>
        prioridad[estadoOrden(a).key] - prioridad[estadoOrden(b).key] || a.reference - b.reference,
    );

  return (
    <>
      {/* Barra: fecha, búsqueda y actualizar */}
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
            placeholder="Buscar orden, cliente, guía o lote"
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
                ? `No hay órdenes abiertas del ${formatFechaDia(fechaFiltro)}.`
                : 'No hay órdenes abiertas. Crea una en Orden de Beneficio.'}
          </div>
        ) : vista === 'lista' ? (
          <ListaOrdenes ordenes={visibles} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {visibles.map((o) => {
              const estado = estadoOrden(o);
              const pct = o.animalCount ? Math.round((o.insensibilizados / o.animalCount) * 100) : 0;
              const activo = o.id === selectedId;
              return (
                <li key={o.id}>
                  <button
                    onClick={() => onSelect(o.id)}
                    className={cn(
                      'group flex w-full flex-col gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.995]',
                      activo ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                    )}
                  >
                    {/* Orden, cliente y estado */}
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">
                        {formatOB(o.reference)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-bold uppercase">{o.cliente}</div>
                        <div className="text-sm text-muted-foreground">
                          {o.clienteNit ? `NIT ${o.clienteNit} · ` : ''}Sacrificio {formatFechaDia(o.date)}
                        </div>
                      </div>
                      <span className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1', estado.clase)}>
                        <span className={cn('size-2 rounded-full', estado.punto)} />
                        {estado.texto}
                      </span>
                    </div>

                    {/* Trazabilidad */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/40 px-4 py-3 sm:grid-cols-4">
                      <Dato label={o.guias.length > 1 ? 'Guías' : 'Guía'}>{o.guias.join(', ') || '—'}</Dato>
                      <Dato label="Báscula">
                        {[...o.bcReferencias.map(formatReferencia), ...o.bpReferencias.map(formatBP)].join(' · ') || '—'}
                      </Dato>
                      <Dato label="Lote">{o.lotes.join(', ') || '—'}</Dato>
                      <Dato label={o.corrales.length > 1 ? 'Corrales' : 'Corral'}>{o.corrales.join(', ') || '—'}</Dato>
                    </div>

                    {/* Animales */}
                    <div className="flex flex-wrap items-center gap-2">
                      {o.tipos.map((t) => (
                        <span key={t.tipo} className="rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium">
                          <b className="tabular-nums">{t.cantidad}</b> {t.tipo}
                        </span>
                      ))}
                      {o.cabezasPatas && (
                        <span className="rounded-md bg-sky-50 px-2.5 py-1 text-sm font-medium text-sky-800 ring-1 ring-sky-200">
                          Cabeza y patas
                        </span>
                      )}
                    </div>

                    {/* Avance */}
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="mb-1.5 flex items-baseline gap-1.5 text-sm text-muted-foreground">
                          <span className="text-xl font-bold tabular-nums text-foreground">{o.insensibilizados}</span>
                          / {o.animalCount} sacrificados
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
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

function ListaOrdenes({
  ordenes,
  selectedId,
  onSelect,
}: {
  ordenes: SacrificioOrderResumen[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <Table>
        <THead>
          <TR>
            <TH className="h-10 w-28">Orden</TH>
            <TH className="h-10">Cliente</TH>
            <TH className="h-10">Guía / Báscula</TH>
            <TH className="h-10">Animales</TH>
            <TH className="h-10 w-64">Avance</TH>
            <TH className="h-10 w-12" />
          </TR>
        </THead>
        <TBody>
          {ordenes.map((o) => {
            const estado = estadoOrden(o);
            const pct = o.animalCount ? Math.round((o.insensibilizados / o.animalCount) * 100) : 0;
            const activo = o.id === selectedId;
            const bascula = [...o.bcReferencias.map(formatReferencia), ...o.bpReferencias.map(formatBP)].join(' · ');
            const detalle = [
              o.clienteNit ? `NIT ${o.clienteNit}` : null,
              o.lotes.length ? `Lote ${o.lotes.join(', ')}` : null,
              o.corrales.length ? `Corral ${o.corrales.join(', ')}` : null,
              o.cabezasPatas ? 'Cabeza y patas' : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <TR
                key={o.id}
                onClick={() => onSelect(o.id)}
                title={detalle}
                className={cn('h-16 cursor-pointer', activo && 'bg-primary/5')}
              >
                <TD className="relative py-2">
                  <span className={cn('absolute inset-y-0 left-0 w-1', estado.barra)} />
                  <span className="text-lg font-bold tabular-nums text-primary">{formatOB(o.reference)}</span>
                </TD>
                <TD className="max-w-80 py-2">
                  <div className="truncate text-base font-semibold uppercase">{o.cliente}</div>
                  {o.cabezasPatas && <div className="text-xs font-medium text-sky-700">Cabeza y patas</div>}
                </TD>
                <TD className="py-2">
                  <div className="text-base font-medium tabular-nums">
                    {o.guias.length > 1 ? `${o.guias.length} guías` : o.guias[0] ?? '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">{bascula || '—'}</div>
                </TD>
                <TD className="py-2 text-sm">
                  {o.tipos.map((t) => `${t.cantidad} ${t.tipo}`).join(' · ') || '—'}
                </TD>
                <TD className="py-2">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-14 text-right text-sm font-semibold tabular-nums">
                      {o.insensibilizados}/{o.animalCount}
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
  );
}

function AnimalesTab({
  detail,
  loading,
  stunPending,
  stunSeq,
  cardSelSeq,
  onSelectCard,
  selectedSeq,
  onSelectSeq,
  puedeCerrar,
  cerrando,
  onCerrar,
}: {
  detail: ReturnType<typeof useSacrificioDetail>['data'];
  loading: boolean;
  stunPending: boolean;
  stunSeq: number | null;
  cardSelSeq: number | null;
  onSelectCard: (sequence: number) => void;
  selectedSeq: number | null;
  onSelectSeq: (sequence: number) => void;
  /** Todos los animales sacrificados: se habilita "Cerrar orden". */
  puedeCerrar: boolean;
  cerrando: boolean;
  onCerrar: () => void;
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

  const done = detail.insensibilizados;
  const total = detail.animalCount;
  const sacrificados = new Set(detail.eventos.map((e) => e.sequence));
  const animalPorSeq = new Map((detail.animales ?? []).map((a) => [a.sequence, a]));
  // Registro en el orden en que se tumbaron (el más reciente arriba).
  const registro = [...detail.eventos].sort(
    (a, b) => new Date(b.stunnedAt).getTime() - new Date(a.stunnedAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-sm text-muted-foreground">
        Orden N.º {formatOB(detail.reference)} · {detail.date}
        {detail.guias.length ? ` · ${detail.guias.join(', ')}` : ''}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {done}
          </span>{' '}
          / {total} sacrificados
        </div>
        <button
          type="button"
          onClick={onCerrar}
          disabled={!puedeCerrar || cerrando}
          title={
            done < total
              ? `Faltan ${total - done} ${total - done === 1 ? 'animal' : 'animales'} por sacrificar para poder cerrar`
              : 'Cerrar la orden: desaparece de Sacrificio'
          }
          className="flex items-center gap-3 rounded-md border-2 border-foreground/70 bg-card px-5 py-3 text-base font-bold uppercase hover:bg-muted disabled:opacity-40"
        >
          {cerrando ? <LoaderCircle className="size-7 animate-spin" /> : <Lock className="size-7" />}
          Cerrar orden
        </button>
      </div>

      {done >= total && (
        <div className="flex items-center gap-2 rounded-sm border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="size-5" />
          Todos los animales de la orden están sacrificados. Revisá el registro y cerrá la orden.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: total }).map((_, i) => {
          const sequence = i + 1;
          // Los ya sacrificados desaparecen; solo quedan pendientes. Un toque
          // selecciona la tarjeta (verde) y el botón del pie la sacrifica.
          if (sacrificados.has(sequence)) return null;
          const enCurso = stunPending && stunSeq === sequence;
          const seleccionada = cardSelSeq === sequence;
          const animal = animalPorSeq.get(sequence);
          const detalleAnimal = animal
            ? [animal.tipoAnimal, animal.pesoKg != null ? `${Math.round(animal.pesoKg)} kg` : null]
                .filter(Boolean)
                .join(' · ')
            : null;
          return (
            <button
              key={i}
              disabled={stunPending}
              onClick={() => onSelectCard(sequence)}
              aria-pressed={seleccionada}
              title={`Tocá para seleccionar el animal ${turnoAnimal(detail.consecutivoBase, sequence)}${detalleAnimal ? ` (${detalleAnimal})` : ''}; luego usá el botón de sacrificar`}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-lg border-2 text-2xl font-bold tabular-nums transition-all',
                seleccionada
                  ? 'border-emerald-600 bg-emerald-500 text-white ring-2 ring-emerald-300'
                  : 'border-border bg-card text-foreground hover:bg-muted',
                !stunPending && 'cursor-pointer',
                stunPending && !enCurso && 'opacity-60',
              )}
            >
              {enCurso ? (
                <LoaderCircle className={cn('size-6 animate-spin', seleccionada ? 'text-white' : 'text-emerald-700')} />
              ) : (
                <>
                  {turnoAnimal(detail.consecutivoBase, sequence)}
                  {detalleAnimal && (
                    <span
                      className={cn(
                        'mt-0.5 px-1 text-center text-[10px] font-medium leading-tight',
                        seleccionada ? 'text-white/90' : 'text-muted-foreground',
                      )}
                    >
                      {detalleAnimal}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-border">
        <div className="py-3 text-sm font-semibold">Registro</div>
        {!detail.eventos.length ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Clock className="size-4" /> Aún no hay animales marcados.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-24 whitespace-nowrap">Turno</TH>
                <TH className="w-40 whitespace-nowrap">Hora</TH>
                <TH className="whitespace-nowrap">Operario</TH>
              </TR>
            </THead>
            <TBody>
              {registro.map((e) => (
                <TR
                  key={e.sequence}
                  onClick={() => onSelectSeq(e.sequence)}
                  aria-selected={e.sequence === selectedSeq}
                  title="Tocá para marcarlo; con ↶ se devuelve este animal"
                  className={cn(
                    'cursor-pointer',
                    e.sequence === selectedSeq && 'bg-sky-100 hover:bg-sky-100',
                  )}
                >
                  <TD className="py-2 font-semibold tabular-nums">
                    {turnoAnimal(detail.consecutivoBase, e.sequence)}
                  </TD>
                  <TD className="py-2 tabular-nums">{hora(e.stunnedAt)}</TD>
                  <TD className="py-2">{e.operatorName}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function FooterSacrificio({
  detail,
  stunPending,
  undoPending,
  refrescando,
  onStun,
  onUndo,
  onRefresh,
  animalSeleccionado,
  cardSeleccionada,
}: {
  detail: SacrificioDetail | undefined;
  stunPending: boolean;
  undoPending: boolean;
  refrescando: boolean;
  onStun: () => void;
  onUndo: () => void;
  onRefresh: () => void;
  /** Turno del animal marcado en el Registro, o null si no hay. */
  animalSeleccionado: string | null;
  /** Tarjeta pendiente seleccionada (la que tumba el botón), o null. */
  cardSeleccionada: number | null;
}) {
  const done = detail?.insensibilizados ?? 0;
  const total = detail?.animalCount ?? 0;
  const completo = !!detail && done >= total;
  const osNo = detail ? formatOB(detail.reference) : '—';
  const ultimo = detail ? ultimoCaido(detail) : null;
  // Sin tarjeta seleccionada no se sabe qué animal tumbar: el botón queda inactivo.
  const animalNo = detail
    ? completo
      ? ultimo ? turnoAnimal(detail.consecutivoBase, ultimo.sequence) : '—'
      : cardSeleccionada != null
        ? turnoAnimal(detail.consecutivoBase, cardSeleccionada)
        : '—'
    : '—';

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <FieldBox label="O.S No.:">
        <div className="flex h-10 min-w-40 items-center text-2xl font-bold tabular-nums">
          {osNo}
        </div>
      </FieldBox>
      <FieldBox label="Animal No.:" className="flex-1">
        <div className="flex h-10 items-center justify-center text-2xl font-bold tabular-nums">
          {animalNo}
        </div>
      </FieldBox>

      <button
        onClick={onUndo}
        disabled={!detail || done === 0 || undoPending || stunPending}
        title={
          animalSeleccionado
            ? `Devolver el animal ${animalSeleccionado} (pide el PIN de quien lo tumbó)`
            : 'Devolver el último animal caído, o marcá uno en el Registro (pide el PIN de quien lo tumbó)'
        }
        className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        {undoPending ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : (
          <Undo2 className="size-6" />
        )}
      </button>
      <button
        onClick={onStun}
        disabled={!detail || completo || cardSeleccionada == null || stunPending || undoPending}
        title={
          completo
            ? 'Todos los animales de la orden ya están sacrificados'
            : cardSeleccionada != null
              ? `Sacrificar el animal ${turnoAnimal(detail?.consecutivoBase, cardSeleccionada)}`
              : 'Tocá primero la tarjeta del animal que vas a sacrificar'
        }
        className="flex size-14 items-center justify-center rounded-sm border-2 border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        {stunPending ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : (
          <SacrificioIcon className="size-6" />
        )}
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
  );
}

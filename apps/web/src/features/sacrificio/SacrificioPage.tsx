import { useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Undo2,
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
import {
  useSacrificioPendientes,
  useSacrificioDetail,
  useStunNext,
  useUndoLast,
  type SacrificioDetail,
  type SacrificioOrder,
} from './api';
import { downloadCabezaPatasTicket } from './cabeza-patas-print';

type Tab = 'ordenes' | 'animales';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'ÓRDENES DE SERVICIO' },
  { key: 'animales', label: 'ANIMALES' },
];

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
        // Lote completado: vuelve a la lista, donde queda marcado como completado.
        if (data.insensibilizados >= data.animalCount) {
          setSelectedId(null);
          setTab('ordenes');
        }
      },
      onError: (error) => {
        const detalle = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
        flashNotice('error', detalle || 'No se pudo registrar el sacrificio. Intenta de nuevo.');
      },
      onSettled: () => setStunSeq(null),
    });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col gap-2 p-2">
      {/* Encabezado: icono, fecha y cliente */}
      <div className="flex items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <SacrificioIcon className="size-10 text-foreground" />
        </div>
        <FieldBox label="Fecha:">
          <FechaFiltro value={fechaFiltro} onChange={cambiarFecha} />
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
            loading={pendientes.isLoading}
            ordenes={lista}
            selectedId={selectedId}
            onSelect={seleccionarOrden}
            fechaFiltro={fechaFiltro}
          />
        )}
        {tab === 'animales' && (
          <AnimalesTab
            detail={d}
            loading={!!selectedId && detail.isLoading}
            notice={notice}
            stunPending={stun.isPending}
            stunSeq={stunSeq}
            cardSelSeq={cardSel}
            onSelectCard={(seq) => setCardSelSeq((actual) => (actual === seq ? null : seq))}
            selectedSeq={animalSelSeq}
            onSelectSeq={(seq) => setAnimalSelSeq((actual) => (actual === seq ? null : seq))}
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

function OrdenesTab({
  loading,
  ordenes,
  selectedId,
  onSelect,
  fechaFiltro,
}: {
  loading: boolean;
  ordenes: SacrificioOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fechaFiltro: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (!ordenes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <Inbox className="size-6" />
        {fechaFiltro
          ? `No hay órdenes del ${fechaFiltro}.`
          : 'No hay órdenes activas. Crea una en Orden de Beneficio.'}
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2 p-2">
      {ordenes.map((o) => {
        const activo = o.id === selectedId;
        const completada = o.status === 'procesado' || o.insensibilizados >= o.animalCount;
        return (
          <li key={o.id}>
            <button
              onClick={() => onSelect(o.id)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm border-2 px-4 py-4 text-left text-lg font-medium transition-colors',
                activo
                  ? 'border-emerald-500 bg-emerald-50'
                  : completada
                    ? 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/60'
                    : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <span className="min-w-0">
                <span className="block">
                  <span className="font-bold tabular-nums">{formatOB(o.reference)}</span>{' '}
                  <span className="text-muted-foreground">|</span>{' '}
                  {o.clienteNit ? `${o.clienteNit} - ` : ''}
                  {o.cliente}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-sm font-normal text-muted-foreground">
                  <CalendarDays className="size-4" />
                  Sacrificio: {formatFechaDia(o.date)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums text-sm text-muted-foreground">
                {o.insensibilizados}/{o.animalCount}
                {completada && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase text-emerald-700">
                    <Check className="size-3.5" />
                    Completada
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AnimalesTab({
  detail,
  loading,
  notice,
  stunPending,
  stunSeq,
  cardSelSeq,
  onSelectCard,
  selectedSeq,
  onSelectSeq,
}: {
  detail: ReturnType<typeof useSacrificioDetail>['data'];
  loading: boolean;
  notice: { type: 'success' | 'error'; text: string } | null;
  stunPending: boolean;
  stunSeq: number | null;
  cardSelSeq: number | null;
  onSelectCard: (sequence: number) => void;
  selectedSeq: number | null;
  onSelectSeq: (sequence: number) => void;
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

      {notice && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium',
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-destructive/10 text-destructive',
          )}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Clock className="size-4" />
          )}
          {notice.text}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {done}
        </span>{' '}
        / {total} sacrificados
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: total }).map((_, i) => {
          const sequence = i + 1;
          // Los ya sacrificados desaparecen; solo quedan pendientes. Un toque
          // selecciona la tarjeta (verde) y el botón del pie la sacrifica.
          if (sacrificados.has(sequence)) return null;
          const enCurso = stunPending && stunSeq === sequence;
          const seleccionada = cardSelSeq === sequence;
          return (
            <button
              key={i}
              disabled={stunPending}
              onClick={() => onSelectCard(sequence)}
              aria-pressed={seleccionada}
              title={`Tocá para seleccionar el animal ${turnoAnimal(detail.consecutivoBase, sequence)}; luego usá el botón de sacrificar`}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-lg border-2 text-2xl font-bold tabular-nums transition-all',
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
                turnoAnimal(detail.consecutivoBase, sequence)
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

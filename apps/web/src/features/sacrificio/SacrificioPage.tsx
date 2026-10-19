import { useRef, useState } from 'react';
import {
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
import { SacrificioIcon } from '@/components/icons/SacrificioIcon';
import { cn, plantToday as today } from '@/lib/utils';
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

// Identificador local del animal dentro de su guía de Peso en Pie (A01, A02…).
function codigoAnimal(indiceBase0: number) {
  return `A${String(indiceBase0 + 1).padStart(2, '0')}`;
}

export function SacrificioPage() {
  const [tab, setTab] = useState<Tab>('ordenes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendientes = useSacrificioPendientes();
  const detail = useSacrificioDetail(selectedId);
  const stun = useStunNext();
  // Tarjeta que se está sacrificando (para mostrar su indicador de carga).
  const [stunSeq, setStunSeq] = useState<number | null>(null);
  // Devolver el último animal caído: pide el PIN de quien lo tumbó.
  const [undoOpen, setUndoOpen] = useState(false);
  const undo = useUndoLast();
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
  const ordenSel = d ?? lista.find((o) => o.id === selectedId);
  const cliente = ordenSel
    ? `${ordenSel.clienteNit ? `${ordenSel.clienteNit} - ` : ''}${ordenSel.cliente}`
    : '';
  const refrescando = pendientes.isFetching || detail.isFetching;

  function seleccionarOrden(id: string) {
    setSelectedId(id);
    setTab('animales');
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  // Sacrifica el animal de la tarjeta tocada (cualquier orden); sin número,
  // el primero pendiente (botón del pie).
  function stunNext(sequence?: number) {
    if (!selectedId) return;
    setStunSeq(sequence ?? null);
    stun.mutate({ id: selectedId, sequence }, {
      onSuccess: (data) => {
        const ultimo = [...data.eventos].sort(
          (a, b) => new Date(b.stunnedAt).getTime() - new Date(a.stunnedAt).getTime(),
        )[0];
        const caido = data.eventos.find((e) => e.sequence === sequence) ?? ultimo;
        flashNotice('success', `Animal ${caido ? codigoAnimal(caido.sequence - 1) : ''} sacrificado con éxito.`);
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
          <div className="flex h-9 items-center text-lg font-semibold">
            {today()}
          </div>
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
          />
        )}
        {tab === 'animales' && (
          <AnimalesTab
            detail={d}
            loading={!!selectedId && detail.isLoading}
            notice={notice}
            stunPending={stun.isPending}
            stunSeq={stunSeq}
            onStun={stunNext}
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
        evento={d ? ultimoCaido(d) : null}
        pending={undo.isPending}
        onClose={() => setUndoOpen(false)}
        onConfirm={(pin) =>
          new Promise<string | null>((resolve) => {
            if (!selectedId) return resolve(null);
            undo.mutate(
              { id: selectedId, pin },
              {
                onSuccess: () => {
                  const ev = d ? ultimoCaido(d) : null;
                  setUndoOpen(false);
                  flashNotice('success', `Animal ${ev ? codigoAnimal(ev.sequence - 1) : ''} devuelto.`);
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
        onStun={() => stunNext()}
        onUndo={() => selectedId && setUndoOpen(true)}
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
}: {
  open: boolean;
  evento: SacrificioDetail['eventos'][number] | null;
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
      title={evento ? `Devolver animal ${codigoAnimal(evento.sequence - 1)}` : 'Devolver animal'}
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
}: {
  loading: boolean;
  ordenes: SacrificioOrder[];
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
  if (!ordenes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <Inbox className="size-6" />
        No hay órdenes activas. Crea una en Orden de Beneficio.
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
              <span>
                <span className="font-bold tabular-nums">{formatOB(o.reference)}</span>{' '}
                <span className="text-muted-foreground">|</span>{' '}
                {o.clienteNit ? `${o.clienteNit} - ` : ''}
                {o.cliente}
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
  onStun,
}: {
  detail: ReturnType<typeof useSacrificioDetail>['data'];
  loading: boolean;
  notice: { type: 'success' | 'error'; text: string } | null;
  stunPending: boolean;
  stunSeq: number | null;
  onStun: (sequence: number) => void;
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
          // Los ya sacrificados desaparecen; solo quedan pendientes, y
          // cualquiera de ellos se puede tumbar.
          if (sacrificados.has(sequence)) return null;
          const enCurso = stunPending && stunSeq === sequence;
          return (
            <button
              key={i}
              disabled={stunPending}
              onDoubleClick={() => onStun(sequence)}
              title={`Doble clic para sacrificar ${codigoAnimal(i)}`}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-lg border-2 text-2xl font-bold tabular-nums transition-all',
                'border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:ring-2 hover:ring-emerald-300',
                !stunPending && 'cursor-pointer',
                stunPending && !enCurso && 'opacity-60',
              )}
            >
              {enCurso ? (
                <LoaderCircle className="size-6 animate-spin text-emerald-700" />
              ) : (
                codigoAnimal(i)
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
          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <Table>
              <THead className="sticky top-0 z-10 bg-muted">
                <TR className="border-b-2 border-border">
                  <TH className="w-20 border-r border-border text-center">#</TH>
                  <TH className="w-24 border-r border-border text-center">Animal</TH>
                  <TH className="w-48 border-r border-border">Hora</TH>
                  <TH>Operario</TH>
                </TR>
              </THead>
              <TBody>
                {registro.map((e) => (
                  <TR key={e.sequence} className="border-b border-border even:bg-muted/30">
                    <TD className="border-r border-border text-center font-semibold tabular-nums">
                      {(detail.consecutivoBase ?? 0) + e.sequence}
                    </TD>
                    <TD className="border-r border-border text-center font-semibold tabular-nums">
                      {codigoAnimal(e.sequence - 1)}
                    </TD>
                    <TD className="border-r border-border tabular-nums">{hora(e.stunnedAt)}</TD>
                    <TD>{e.operatorName}</TD>
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

function FooterSacrificio({
  detail,
  stunPending,
  undoPending,
  refrescando,
  onStun,
  onUndo,
  onRefresh,
}: {
  detail: SacrificioDetail | undefined;
  stunPending: boolean;
  undoPending: boolean;
  refrescando: boolean;
  onStun: () => void;
  onUndo: () => void;
  onRefresh: () => void;
}) {
  const done = detail?.insensibilizados ?? 0;
  const total = detail?.animalCount ?? 0;
  const completo = !!detail && done >= total;
  const osNo = detail ? formatOB(detail.reference) : '—';
  const tomados = new Set(detail?.eventos.map((e) => e.sequence) ?? []);
  let primeroPendiente = 1;
  while (tomados.has(primeroPendiente)) primeroPendiente++;
  const ultimo = detail ? ultimoCaido(detail) : null;
  const animalNo = detail
    ? completo
      ? ultimo ? codigoAnimal(ultimo.sequence - 1) : '—'
      : codigoAnimal(primeroPendiente - 1)
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
        title="Devolver el último animal caído (pide el PIN de quien lo tumbó)"
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
        disabled={!detail || completo || stunPending || undoPending}
        title="Marcar el primer animal pendiente como sacrificado"
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

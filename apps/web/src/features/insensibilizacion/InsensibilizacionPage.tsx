import { useState } from 'react';
import {
  Inbox,
  LoaderCircle,
  Undo2,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { InsensibilizacionIcon } from '@/components/icons/InsensibilizacionIcon';
import { cn } from '@/lib/utils';
import {
  useInsensibilizacionPendientes,
  useInsensibilizacionDetail,
  useStunNext,
  useUndoLast,
  useVerifyAdmin,
  type InsOrder,
} from './api';

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function InsensibilizacionPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendientes = useInsensibilizacionPendientes();
  const detail = useInsensibilizacionDetail(selectedId);
  const stun = useStunNext();
  const undo = useUndoLast();

  // Autorización de administrador para cambiar de orden.
  const [authOpen, setAuthOpen] = useState(false);

  const orders = pendientes.data ?? [];
  const d = detail.data;
  const done = d?.insensibilizados ?? 0;
  const total = d?.animalCount ?? 0;
  const completo = d?.status === 'procesado';

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <InsensibilizacionIcon className="size-9 text-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Insensibilización
          </h1>
          <p className="text-sm text-muted-foreground">
            Procesa las órdenes provenientes de Orden de Beneficio.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {/* Lista de órdenes pendientes (oculta al seleccionar una) */}
        {!selectedId && (
          <Card className="flex flex-col overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              Órdenes pendientes
            </div>
            {pendientes.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Cargando…
              </div>
            ) : !orders.length ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
                <Inbox className="size-8" />
                No hay órdenes pendientes. Crea una en Orden de Beneficio.
              </div>
            ) : (
              <ul className="flex-1 divide-y divide-border overflow-auto">
                {orders.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    active={o.id === selectedId}
                    onClick={() => setSelectedId(o.id)}
                  />
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Panel de proceso */}
        {selectedId && (
          <Card className="flex flex-col overflow-hidden">
            {!d ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" /> Cargando…
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                {/* Cabecera de la orden */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAuthOpen(true)}
                    >
                      <ArrowLeft /> Cambiar orden
                    </Button>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Orden N.º {d.reference} · {d.date}
                      </div>
                      <div className="text-lg font-semibold text-foreground">
                        {d.cliente}
                        {d.guias.length ? ` · ${d.guias.join(', ')}` : ''}
                      </div>
                    </div>
                  </div>
                  {completo && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="size-4" /> Lote completado
                    </span>
                  )}
                </div>

              {/* Recuadros por animal con su consecutivo global del día */}
              <div className="flex flex-col gap-4 px-6 py-8">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {done}
                    </span>{' '}
                    / {total} insensibilizados
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedId && undo.mutate(selectedId)}
                    disabled={done === 0 || undo.isPending || stun.isPending}
                  >
                    <Undo2 /> Deshacer
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {Array.from({ length: total }).map((_, i) => {
                    const consecutivo = (d.consecutivoBase ?? 0) + i + 1;
                    const marked = i < done;
                    const isNext = i === done;
                    const isLastMarked = i === done - 1;
                    const busy = stun.isPending || undo.isPending;
                    return (
                      <button
                        key={consecutivo}
                        disabled={busy || (!isNext && !isLastMarked)}
                        onClick={() => {
                          if (!selectedId) return;
                          if (isNext) stun.mutate(selectedId);
                          else if (isLastMarked) undo.mutate(selectedId);
                        }}
                        title={
                          marked
                            ? isLastMarked
                              ? 'Clic para deshacer'
                              : 'Insensibilizado'
                            : isNext
                              ? 'Clic para insensibilizar'
                              : 'Pendiente'
                        }
                        className={cn(
                          'flex aspect-square items-center justify-center rounded-lg border-2 text-2xl font-bold tabular-nums transition-all',
                          marked &&
                            'border-emerald-600 bg-emerald-600 text-white',
                          isNext &&
                            'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-300 hover:bg-emerald-100',
                          !marked &&
                            !isNext &&
                            'border-border bg-muted/40 text-muted-foreground',
                          !busy &&
                            (isNext || isLastMarked) &&
                            'cursor-pointer',
                        )}
                      >
                        {marked ? (
                          <CheckCircle2 className="size-7" />
                        ) : (
                          consecutivo
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Registro de eventos */}
              <div className="border-t border-border">
                <div className="px-6 py-3 text-sm font-semibold">
                  Registro
                </div>
                {!d.eventos.length ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                    <Clock className="size-4" /> Aún no hay animales marcados.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH className="w-16">#</TH>
                          <TH>Hora</TH>
                          <TH>Operario</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {[...d.eventos].reverse().map((e) => (
                          <TR key={e.sequence}>
                            <TD className="font-semibold tabular-nums">
                              {(d.consecutivoBase ?? 0) + e.sequence}
                            </TD>
                            <TD className="tabular-nums">
                              {hora(e.stunnedAt)}
                            </TD>
                            <TD>{e.operatorName}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
        )}
      </div>

      <AdminAuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthorized={() => {
          setAuthOpen(false);
          setSelectedId(null);
        }}
      />
    </div>
  );
}

function AdminAuthDialog({
  open,
  onClose,
  onAuthorized,
}: {
  open: boolean;
  onClose: () => void;
  onAuthorized: () => void;
}) {
  const [documentId, setDocumentId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verify = useVerifyAdmin();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    verify.mutate(
      { documentId: documentId.trim(), pin: pin.trim() },
      {
        onSuccess: () => {
          setDocumentId('');
          setPin('');
          onAuthorized();
        },
        onError: (err) => {
          const detail = (
            err as { response?: { data?: { message?: string | string[] } } }
          ).response?.data?.message;
          setError(
            Array.isArray(detail)
              ? detail.join(' ')
              : detail || 'No se pudo verificar. Intenta de nuevo.',
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Autorización requerida"
      description="Ingresa la cédula y PIN de un administrador para cambiar de orden."
      className="max-w-sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Cédula</label>
          <Input
            autoFocus
            inputMode="numeric"
            value={documentId}
            onChange={(e) =>
              setDocumentId(e.target.value.replace(/\D/g, ''))
            }
            placeholder="Cédula del administrador"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">PIN</label>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
          />
        </div>
        {error && (
          <p className="text-sm font-medium text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              verify.isPending || documentId.length < 5 || pin.length < 4
            }
          >
            {verify.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Lock className="size-4" />
            )}
            Autorizar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function OrderRow({
  order,
  active,
  onClick,
}: {
  order: InsOrder;
  active: boolean;
  onClick: () => void;
}) {
  const pct =
    order.animalCount > 0
      ? Math.round((order.insensibilizados / order.animalCount) * 100)
      : 0;
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50',
          active && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">
            N.º {order.reference} · {order.cliente}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {order.insensibilizados}/{order.animalCount}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {order.guias.length ? order.guias.join(', ') : 'Sin guía'} ·{' '}
          {order.animalCount} animales
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
    </li>
  );
}

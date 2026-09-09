import { useEffect, useState } from 'react';
import {
  Inbox,
  LoaderCircle,
  Undo2,
  Zap,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { InsensibilizacionIcon } from '@/components/icons/InsensibilizacionIcon';
import { cn } from '@/lib/utils';
import {
  useInsensibilizacionPendientes,
  useInsensibilizacionDetail,
  useStunNext,
  useUndoLast,
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

  // Selecciona la primera orden disponible por defecto.
  useEffect(() => {
    if (!selectedId && pendientes.data?.length) {
      setSelectedId(pendientes.data[0].id);
    }
  }, [pendientes.data, selectedId]);

  const orders = pendientes.data ?? [];
  const d = detail.data;
  const done = d?.insensibilizados ?? 0;
  const total = d?.animalCount ?? 0;
  const completo = d?.status === 'procesado';
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

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

      <div className="grid flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Lista de órdenes pendientes */}
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

        {/* Panel de proceso */}
        <Card className="flex flex-col overflow-hidden">
          {!d ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <InsensibilizacionIcon className="size-10 opacity-40" />
              Selecciona una orden para comenzar.
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              {/* Cabecera de la orden */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
                <div>
                  <div className="text-sm text-muted-foreground">
                    Orden N.º {d.reference} · {d.date}
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {d.cliente}
                    {d.guias.length ? ` · ${d.guias.join(', ')}` : ''}
                  </div>
                </div>
                {completo && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="size-4" /> Lote completado
                  </span>
                )}
              </div>

              {/* Contador grande */}
              <div className="flex flex-col items-center gap-4 px-6 py-8">
                <div className="text-center">
                  <div className="text-6xl font-bold tabular-nums text-foreground">
                    {done}
                    <span className="text-3xl text-muted-foreground">
                      {' '}
                      / {total}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    animales insensibilizados
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="h-3 w-full max-w-md overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => selectedId && undo.mutate(selectedId)}
                    disabled={done === 0 || undo.isPending || stun.isPending}
                  >
                    <Undo2 /> Deshacer
                  </Button>
                  <Button
                    size="lg"
                    className="h-16 min-w-56 bg-emerald-600 text-lg hover:bg-emerald-700"
                    onClick={() => selectedId && stun.mutate(selectedId)}
                    disabled={completo || stun.isPending}
                  >
                    {stun.isPending ? (
                      <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                      <Zap className="size-5" />
                    )}
                    {completo ? 'Completado' : 'Insensibilizar (+1)'}
                  </Button>
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
                              {e.sequence}
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
      </div>
    </div>
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

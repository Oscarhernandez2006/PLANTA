import { useMemo, useRef, useState } from 'react';
import { RotateCcw, ScanLine, Trash2, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn, formatDate } from '@/lib/utils';
import {
  orderTypeLabel,
  statusLabels,
  statusTone,
  type DispatchOrder,
} from './api';

interface CanalItem {
  id: string;
  barcode: string;
  code: string;
  product: string;
  pieces: number;
  hotKg: number; // C.C. — canal caliente
  dispatchKg: number; // D.C. — despacho
  type: string;
}

function num(n: number, d = 2) {
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function RegistroTab({
  order,
  onGoToOrders,
}: {
  order: DispatchOrder | null;
  onGoToOrders: () => void;
}) {
  const [items] = useState<CanalItem[]>([]);
  const [barcode, setBarcode] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const pieces = items.reduce((a, i) => a + i.pieces, 0);
    const hot = items.reduce((a, i) => a + i.hotKg, 0);
    const dispatch = items.reduce((a, i) => a + i.dispatchKg, 0);
    const diff = hot - dispatch;
    const pct = hot > 0 ? (diff / hot) * 100 : 0;
    return { pieces, hot, dispatch, diff, pct };
  }, [items]);

  if (!order) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">Ninguna orden seleccionada</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Elegí una orden en “Órdenes de Despacho” para asociarle canales.
        </p>
        <Button variant="outline" onClick={onGoToOrders}>
          Ir a Órdenes de Despacho
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Orden en contexto */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-primary/10 px-4 py-2 text-center">
              <div className="text-2xl font-semibold tabular-nums text-primary">
                {order.odNumber}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                O.D.
              </div>
            </div>
            <div className="leading-tight">
              <div className="font-medium">
                {order.client.name}{' '}
                <span className="text-muted-foreground">
                  ({order.client.sede})
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                NIT {order.client.nit} · {orderTypeLabel} · Proceso{' '}
                {formatDate(order.processDate)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone[order.status]}>
              {statusLabels[order.status]}
            </Badge>
            <Button variant="outline" size="sm" onClick={onGoToOrders}>
              Cambiar orden
            </Button>
          </div>
        </div>
      </Card>

      {/* Barra de escaneo */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scan">Código de barras (precinto)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="scan"
                  ref={scanRef}
                  autoFocus
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Escaneá o escribí el precinto…"
                  className="h-12 pl-10 text-base"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="size-12"
                aria-label="Limpiar"
                onClick={() => {
                  setBarcode('');
                  scanRef.current?.focus();
                }}
              >
                <Trash2 className="size-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-12"
                aria-label="Refrescar"
                onClick={() => scanRef.current?.focus()}
              >
                <RotateCcw className="size-5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Peso (kg)" value="0.0" />
            <Stat label="Gancho" value="0" tone="danger" />
            <Stat label="Cant. (kg)" value="0.0" />
          </div>
        </div>
      </Card>

      {/* Tabla de canales */}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Barcode</TH>
              <TH>Código</TH>
              <TH>Producto</TH>
              <TH className="text-center">Pza</TH>
              <TH className="text-right">C.C. (kg)</TH>
              <TH className="text-right">D.C. (kg)</TH>
              <TH className="text-right">Dif. (kg | %)</TH>
              <TH>Tipo</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR>
                <TD colSpan={8}>
                  <div className="flex flex-col items-center gap-2 py-14 text-center">
                    <ScanLine className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Sin canales aún</p>
                    <p className="text-sm text-muted-foreground">
                      Escaneá el precinto de un canal para agregarlo a la orden.
                    </p>
                  </div>
                </TD>
              </TR>
            ) : (
              items.map((it) => {
                const diff = it.hotKg - it.dispatchKg;
                const pct = it.hotKg > 0 ? (diff / it.hotKg) * 100 : 0;
                return (
                  <TR key={it.id}>
                    <TD className="font-mono text-sm">{it.barcode}</TD>
                    <TD className="tabular-nums">{it.code}</TD>
                    <TD>{it.product}</TD>
                    <TD className="text-center tabular-nums">{it.pieces}</TD>
                    <TD className="text-right tabular-nums">{num(it.hotKg)}</TD>
                    <TD className="text-right tabular-nums">
                      {num(it.dispatchKg)}
                    </TD>
                    <TD className="text-right tabular-nums text-amber-600">
                      {num(diff)} | {num(pct)}
                    </TD>
                    <TD>{it.type}</TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TotalCard label="Piezas" value={String(totals.pieces)} />
        <TotalCard
          label="Canal caliente (kg)"
          value={num(totals.hot)}
          tone="danger"
        />
        <TotalCard
          label="Despacho (kg)"
          value={num(totals.dispatch)}
          tone="success"
        />
        <TotalCard
          label="Diferencia (kg | %)"
          value={`${num(totals.diff)} | ${num(totals.pct)}`}
          tone="info"
          icon={totals.pct > 3 ? <TriangleAlert className="size-4" /> : null}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'danger' ? 'text-red-600' : 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TotalCard({
  label,
  value,
  tone = 'default',
  icon = null,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'success' | 'info';
  icon?: React.ReactNode;
}) {
  const color =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'success'
        ? 'text-emerald-600'
        : tone === 'info'
          ? 'text-blue-600'
          : 'text-foreground';
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums',
          color,
        )}
      >
        {icon}
        {value}
      </div>
    </Card>
  );
}

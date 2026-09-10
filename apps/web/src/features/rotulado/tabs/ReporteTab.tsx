import { FileText, Lock, LoaderCircle } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useReporte, type Movimiento, type RotuladoOrden, type RotuladoStage } from '../api';

function kg(n: number) {
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ReporteTab({
  stage,
  orden,
}: {
  stage: RotuladoStage;
  orden: RotuladoOrden | null;
}) {
  const reporte = useReporte(orden?.id ?? null);

  if (!orden) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <FileText className="size-8" />
        <p className="text-sm font-medium">Seleccioná una orden</p>
        <p className="text-sm">Elegí una orden para ver su reporte de traslado.</p>
      </div>
    );
  }

  if (reporte.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  const data = reporte.data;
  const movimientos: Movimiento[] = data?.movimientos ?? [];
  const traslado = movimientos.filter((m) => /SALIDA/i.test(m.movimiento));
  const productos = movimientos.filter((m) => !/SALIDA/i.test(m.movimiento));

  const recibido = data?.recibido ?? 0;
  const procesado = data?.procesado ?? 0;
  const merma = data?.merma ?? 0;
  const mermaPct = data?.mermaPct;

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground">
        Traslado de M.P a Sala, Orden No.:{' '}
        <span className="font-semibold text-foreground">
          {orden.ordenTraslado}
        </span>
      </p>

      {/* Empaques / traslado (solo acondicionamiento) */}
      {stage === 'acondicionamiento' && (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH className="w-24">Empaques</TH>
                <TH className="w-28">Código</TH>
                <TH>Producto</TH>
                <TH className="w-20 text-right">Unds</TH>
                <TH className="w-24 text-right">Peso</TH>
                <TH className="w-32">Movimiento</TH>
              </TR>
            </THead>
            <TBody>
              {traslado.length === 0 ? (
                <TR className="hover:bg-transparent">
                  <TD colSpan={6} className="py-6 text-center text-muted-foreground">
                    Sin empaques de traslado.
                  </TD>
                </TR>
              ) : (
                traslado.map((m, i) => (
                  <TR key={i} className="bg-sky-50">
                    <TD className="tabular-nums">{m.empaques ?? '—'}</TD>
                    <TD className="tabular-nums">{m.codigo}</TD>
                    <TD>{m.producto}</TD>
                    <TD className="text-right tabular-nums">{m.unds}</TD>
                    <TD className="text-right tabular-nums">{kg(m.peso)}</TD>
                    <TD>{m.movimiento}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      )}

      {/* Productos */}
      <div className="rounded-lg border border-border">
        <p className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Productos
        </p>
        <Table>
          <THead>
            <TR>
              <TH className="w-28">Código</TH>
              <TH>Producto</TH>
              <TH className="w-20 text-right">Unds</TH>
              <TH className="w-24 text-right">Peso</TH>
              <TH>Movimiento</TH>
            </TR>
          </THead>
          <TBody>
            {productos.length === 0 ? (
              <TR className="hover:bg-transparent">
                <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                  Sin movimientos de productos.
                </TD>
              </TR>
            ) : (
              productos.map((m, i) => (
                <TR key={i} className={cn(i === 0 && 'bg-red-50')}>
                  <TD className="tabular-nums">{m.codigo}</TD>
                  <TD>{m.producto}</TD>
                  <TD className="text-right tabular-nums">{m.unds}</TD>
                  <TD className="text-right tabular-nums">{kg(m.peso)}</TD>
                  <TD className="text-xs">{m.movimiento}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
        <Total label="Recibido (kg)" value={kg(recibido)} tone="text-blue-600" />
        <Total label="Procesado (kg)" value={kg(procesado)} tone="text-emerald-600" />
        <Total
          label="Merma (kg | %)"
          value={`${kg(merma)} | ${mermaPct == null ? '—' : mermaPct.toFixed(2)}`}
          tone="text-red-600"
        />
        <div className="flex justify-end">
          <button
            className="flex size-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-muted/60"
            title="Bloquear reporte"
          >
            <Lock className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', tone)}>{value}</p>
    </div>
  );
}

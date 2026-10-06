import { useState } from 'react';
import { isAxiosError } from 'axios';
import { ArrowRight, LoaderCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatOT } from '../registrar/orden-traslado-api';
import {
  formatOC,
  useCerrarAcondicionamiento,
  useResumenAcondicionamiento,
  type OrdenAcondicionamiento,
} from '../registrar/orden-acondicionamiento-api';
import { FieldBox, Mensaje } from './ui';

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const th = 'border-b-2 border-border px-2 py-1.5 text-left text-xs font-semibold uppercase text-muted-foreground';
const td = 'border-b border-border px-2 py-1';

/** Reporte: lo que llegó por la OT (salida) y lo que se transformó y etiquetó (entrada). */
export function ReporteAcondicionamiento({
  orden,
  onCerrada,
}: {
  orden: OrdenAcondicionamiento;
  onCerrada: () => void;
}) {
  const resumen = useResumenAcondicionamiento(orden.id);
  const cerrar = useCerrarAcondicionamiento();
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resumen.isLoading) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }
  const r = resumen.data;
  if (!r) return <Mensaje text="No se pudo cargar el reporte." />;

  function cerrarOrden() {
    setError(null);
    cerrar.mutate(orden.id, {
      onSuccess: () => {
        setConfirmar(false);
        onCerrada();
      },
      onError: (err) => {
        setConfirmar(false);
        const m = isAxiosError(err) ? err.response?.data?.message : null;
        setError(typeof m === 'string' ? m : 'No se pudo cerrar la orden.');
      },
    });
  }

  return (
    <div className="flex h-full flex-col gap-3 p-2 pt-4">
      <FieldBox label={`Traslado de M.P. a Sala, Orden No.: ${formatOT(r.otNumber)}`}>
        <div className="scrollbar-app max-h-48 overflow-auto pt-1">
          {!r.recibido.length ? (
            <p className="py-3 text-sm text-muted-foreground">La orden de traslado no tiene productos.</p>
          ) : (
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead className="sticky top-0 bg-card">
                <tr>
                  {['Empaques', 'Código', 'Producto', 'Unds', 'Peso (kg)', 'Movimiento'].map((c) => (
                    <th key={c} className={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.recibido.map((g) => (
                  <tr key={g.productoCodigo} className="odd:bg-muted/30">
                    <td className={td}>{g.empaques}</td>
                    <td className={td}>{g.productoCodigo}</td>
                    <td className={cn(td, 'font-medium uppercase')}>{g.productoNombre}</td>
                    <td className={td}>{g.unds}</td>
                    <td className={cn(td, 'font-semibold')}>{kg(g.netoKg)}</td>
                    <td className={cn(td, 'font-semibold text-red-600')}>SALIDA</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FieldBox>

      <FieldBox label={`Productos (${formatOC(r.ocNumber)}):`} className="flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto pt-1">
          {!r.productos.length ? (
            <p className="py-3 text-sm text-muted-foreground">Aún no hay productos etiquetados.</p>
          ) : (
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead className="sticky top-0 bg-card">
                <tr>
                  {['Unds', 'Código', 'Producto', 'Peso (kg)', 'Movimiento'].map((c) => (
                    <th key={c} className={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.productos.map((p) => (
                  <tr key={p.productoCodigo} className="odd:bg-muted/30">
                    <td className={td}>{p.unds}</td>
                    <td className={td}>{p.productoCodigo}</td>
                    <td className={cn(td, 'font-medium uppercase')}>{p.productoNombre}</td>
                    <td className={cn(td, 'font-semibold')}>{kg(p.netoKg)}</td>
                    <td className={cn(td, 'font-semibold text-emerald-700')}>ENTRADA</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FieldBox>

      {error && (
        <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr_1fr_auto] items-stretch gap-2">
        <FieldBox label="Recibido(Kg):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-blue-700">
            {kg(r.recibidoKg)}
          </div>
        </FieldBox>
        <div className="flex items-center text-muted-foreground" title="Se transforma en">
          <ArrowRight className="size-6" />
        </div>
        <FieldBox label="Procesado(Kg):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-emerald-700">
            {kg(r.procesadoKg)}
          </div>
        </FieldBox>
        <FieldBox label="Merma(Kg | %):">
          <div
            className={cn(
              'flex h-10 items-center justify-end text-2xl font-bold tabular-nums',
              r.mermaKg < 0 ? 'text-red-600' : 'text-foreground',
            )}
          >
            {r.productos.length ? `${kg(r.mermaKg)} | ${kg(r.mermaPct)}%` : ''}
          </div>
        </FieldBox>
        <button
          onClick={() => setConfirmar(true)}
          disabled={!r.activa || !r.productos.length || cerrar.isPending}
          title={
            !r.activa
              ? 'La orden ya está cerrada'
              : !r.productos.length
                ? 'Etiqueta productos antes de cerrar'
                : 'Cerrar la orden de acondicionamiento'
          }
          className="flex size-16 items-center justify-center self-center rounded-md border-2 border-foreground/70 bg-card hover:bg-muted disabled:opacity-40"
        >
          <Lock className="size-9" />
        </button>
      </div>

      {confirmar && (
        <Dialog open onClose={() => setConfirmar(false)} title="Cerrar orden" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              ¿Está seguro de cerrar la orden con consecutivo <b>{formatOC(r.ocNumber)}</b>?
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Lo trasladado en {formatOT(r.otNumber)} ({kg(r.recibidoKg)} kg) queda transformado en los
              productos etiquetados ({kg(r.procesadoKg)} kg). Ya no se podrá etiquetar ni borrar.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmar(false)}>
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
    </div>
  );
}

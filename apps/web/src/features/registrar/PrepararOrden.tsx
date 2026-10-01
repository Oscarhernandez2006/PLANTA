import { useState } from 'react';
import { isAxiosError } from 'axios';
import { RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTiendas } from '../clientes/api';
import { formatOD } from './orden-despacho-api';
import {
  formatOP,
  useAsignarTienda,
  usePreparacion,
  useQuitarTienda,
} from './orden-produccion-api';

export interface OrdenAPreparar {
  id: string;
  opNumber: number;
  odNumber: number;
  clienteId: string;
  clienteNit: string | null;
  clienteNombre: string;
}

const mensajeError = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

/** Distribución de las canales de una orden de producción entre las tiendas del cliente. */
export function PrepararOrdenDialog({
  orden,
  onClose,
}: {
  orden: OrdenAPreparar;
  onClose: () => void;
}) {
  const prep = usePreparacion(orden.id);
  const tiendas = useTiendas(orden.clienteId);
  const asignar = useAsignarTienda(orden.id);
  const quitar = useQuitarTienda(orden.id);
  const [tiendaId, setTiendaId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [error, setError] = useState<string | null>(null);

  const p = prep.data;
  const activas = (tiendas.data ?? []).filter((t) => t.active);
  const prefijo = orden.clienteNit ?? '';
  const cantidadNum = Number(cantidad);

  function elegirTienda(id: string) {
    setTiendaId(id);
    setError(null);
    const ya = p?.tiendas.find((t) => t.tiendaId === id);
    setCantidad(ya ? String(ya.cantidad) : '');
  }

  async function guardar() {
    setError(null);
    if (!tiendaId) return setError('Selecciona la tienda.');
    if (!Number.isInteger(cantidadNum) || cantidadNum < 1) {
      return setError('Digita la cantidad de canales (mínimo 1).');
    }
    try {
      await asignar.mutateAsync({ tiendaId, cantidad: cantidadNum });
      setTiendaId('');
      setCantidad('');
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la distribución.'));
    }
  }

  const caja = 'rounded-md border border-border px-4 py-2 text-center';

  return (
    <Dialog open onClose={onClose} title="Preparar orden" className="max-w-4xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-stretch justify-between gap-3">
          <div className={cn(caja, 'text-left')}>
            <p className="text-xs font-semibold uppercase text-muted-foreground">N.º orden</p>
            <p className="text-2xl font-bold tabular-nums text-red-600">{formatOP(orden.opNumber)}</p>
            <p className="text-xs text-muted-foreground">
              {orden.clienteNombre} · {formatOD(orden.odNumber)}
            </p>
          </div>
          <div className="flex gap-2">
            <div className={caja}>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Total canales</p>
              <p className="text-3xl font-bold tabular-nums">{p?.totalCanales ?? '—'}</p>
            </div>
            <div className={caja}>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Asignadas</p>
              <p className="text-3xl font-bold tabular-nums text-sky-700">{p?.asignadas ?? '—'}</p>
            </div>
            <div className={caja}>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Disponibles</p>
              <p
                className={cn(
                  'text-3xl font-bold tabular-nums',
                  p && p.disponibles === 0 ? 'text-muted-foreground' : 'text-emerald-600',
                )}
              >
                {p?.disponibles ?? '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
          <div className="space-y-1.5">
            <Label htmlFor="prep-tienda">Tienda</Label>
            <Select
              id="prep-tienda"
              className="h-11 text-base"
              value={tiendaId}
              onChange={(e) => elegirTienda(e.target.value)}
            >
              <option value="">
                {tiendas.isLoading
                  ? 'Cargando…'
                  : activas.length
                    ? 'Selecciona la tienda'
                    : 'El cliente no tiene tiendas activas'}
              </option>
              {activas.map((t) => (
                <option key={t.id} value={t.id}>
                  {prefijo}-{t.codigo} · {t.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prep-cantidad">Cantidad de canales</Label>
            <Input
              id="prep-cantidad"
              inputMode="numeric"
              className="h-11 text-center text-xl font-bold tabular-nums"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void guardar();
              }}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-center gap-2">
          <Button
            size="lg"
            className="h-11 px-8"
            onClick={() => void guardar()}
            disabled={!tiendaId || !cantidad || asignar.isPending}
          >
            <Save className="size-5" />
            {asignar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11"
            onClick={() => {
              void prep.refetch();
              void tiendas.refetch();
            }}
            disabled={prep.isFetching}
            title="Actualizar"
          >
            <RefreshCw className={cn('size-5', prep.isFetching && 'animate-spin')} />
          </Button>
        </div>

        <div className="max-h-[320px] overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted text-xs font-semibold uppercase">
              <tr>
                <th className="w-16 border border-border px-3 py-2">No.</th>
                <th className="border border-border px-3 py-2">Tienda</th>
                <th className="w-28 border border-border px-3 py-2">Cant.</th>
                <th className="w-16 border border-border px-3 py-2" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {prep.isLoading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : !p?.tiendas.length ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Aún no se han repartido canales a ninguna tienda.
                  </td>
                </tr>
              ) : (
                p.tiendas.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => elegirTienda(t.tiendaId)}
                    className={cn(
                      'cursor-pointer even:bg-muted/30 hover:bg-muted/50',
                      tiendaId === t.tiendaId && 'bg-sky-100',
                    )}
                  >
                    <td className="border border-border px-3 py-2 text-center">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="border border-border px-3 py-2">
                      {prefijo}-{t.codigo} · {t.nombre}
                    </td>
                    <td className="border border-border px-3 py-2 text-center font-semibold">
                      {t.cantidad}
                    </td>
                    <td className="border border-border px-3 py-2 text-center">
                      <button
                        type="button"
                        title="Quitar esta tienda"
                        disabled={quitar.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm(`¿Quitar la distribución de ${t.nombre}?`)) return;
                          quitar.mutate(t.id, {
                            onError: (err) => setError(mensajeError(err, 'No se pudo quitar.')),
                          });
                        }}
                        className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

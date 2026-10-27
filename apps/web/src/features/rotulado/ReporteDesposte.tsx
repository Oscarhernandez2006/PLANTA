import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePreparacion,
  useReporteRotulado,
  type EtiquetaReporte,
  type OrdenProduccion,
} from '../registrar/orden-produccion-api';
import { Mensaje } from './ui';
import { formatPieza } from './etiqueta-desposte-zpl';
import { formatOT } from '../registrar/orden-traslado-api';

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

const COLUMNAS = [
  'Hora',
  'Código de barras',
  'Pieza',
  'Código',
  'Producto',
  'N.º canast.',
  'Bruto (kg)',
  'Tara (kg)',
  'Neto (kg)',
  'Empaque',
  'Conservación',
  'Sacrificio',
  'F. empaque',
  'Vence',
  'Ref',
  'Bodega',
  'Procesado para',
  'Estación',
  'Usuario',
  'Impresa',
  'Estado',
];

/** Reporte de Rotulado Desposte: etiquetas de la orden agrupadas por tienda. */
export function ReporteDesposte({ orden, prefijo }: { orden: OrdenProduccion; prefijo: string }) {
  const reporte = useReporteRotulado(orden.id);
  const prep = usePreparacion(orden.id);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => {
    const porTienda = new Map<string, { codigo: string; nombre: string; filas: EtiquetaReporte[] }>();
    // Primero las tiendas preparadas (aunque aún no tengan etiquetas).
    for (const t of prep.data?.tiendas ?? []) {
      porTienda.set(t.tiendaId, { codigo: t.codigo, nombre: t.nombre, filas: [] });
    }
    for (const e of reporte.data ?? []) {
      const g = porTienda.get(e.tiendaId) ?? { codigo: e.tiendaCodigo, nombre: e.tiendaNombre, filas: [] };
      g.filas.push(e);
      porTienda.set(e.tiendaId, g);
    }
    return [...porTienda.entries()]
      .map(([tiendaId, g]) => ({ tiendaId, ...g }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }, [reporte.data, prep.data]);

  if (reporte.isLoading || prep.isLoading) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }
  if (!grupos.length) return <Mensaje text="La orden no tiene tiendas preparadas ni productos etiquetados." />;

  function toggle(id: string) {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-2 p-2">
      {grupos.map((g) => {
        const abierta = abiertas.has(g.tiendaId);
        const netoTotal = g.filas.reduce((s, e) => s + e.netoKg, 0);
        const canastillas = new Set(g.filas.map((e) => e.canastillaNumero).filter((n) => n !== null)).size;
        const productos = new Set(g.filas.map((e) => e.productoCodigo)).size;
        return (
          <li key={g.tiendaId} className="rounded-sm border-2 border-border">
            <button
              onClick={() => toggle(g.tiendaId)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left text-lg font-medium transition-colors',
                abierta ? 'bg-sky-100' : 'bg-card hover:bg-muted/50',
              )}
            >
              {abierta ? <ChevronDown className="size-5 shrink-0" /> : <ChevronRight className="size-5 shrink-0" />}
              <Store className="size-5 shrink-0 text-muted-foreground" />
              <span className="font-bold tabular-nums">
                {prefijo}-{g.codigo}
              </span>
              <span className="uppercase">{g.nombre}</span>
              <span className="ml-auto flex gap-4 text-sm font-semibold tabular-nums text-muted-foreground">
                <span>{productos} prod.</span>
                <span>{g.filas.length} pzs</span>
                <span>{canastillas} canast.</span>
                <span className="text-emerald-700">{kg(netoTotal)} kg</span>
              </span>
            </button>
            {abierta &&
              (g.filas.length === 0 ? (
                <p className="border-t-2 border-border px-4 py-4 text-sm text-muted-foreground">
                  Aún no hay productos etiquetados para esta tienda.
                </p>
              ) : (
                <div className="scrollbar-app max-h-[420px] overflow-auto border-t-2 border-border">
                  <table className="w-full border-collapse whitespace-nowrap text-xs tabular-nums">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="text-left font-semibold uppercase text-muted-foreground">
                        {COLUMNAS.map((c) => (
                          <th key={c} className="px-2 py-1.5">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.filas.map((e) => (
                        <tr key={e.id} className="border-b border-border odd:bg-muted/30">
                          <td className="px-2 py-1">{hora(e.createdAt)}</td>
                          <td className="px-2 py-1 font-semibold">{e.codigo ?? '—'}</td>
                          <td className="px-2 py-1 font-semibold">#{formatPieza(e.pieza)}</td>
                          <td className="px-2 py-1">{e.productoCodigo}</td>
                          <td className="px-2 py-1 font-medium uppercase">
                            {e.productoNombre}
                            {e.sobrante && (
                              <span className="ml-1.5 rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                                SOBRANTE
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center">{e.canastillaNumero ?? '—'}</td>
                          <td className="px-2 py-1 text-right">{kg(e.brutoKg)}</td>
                          <td className="px-2 py-1 text-right">{kg(e.taraKg)}</td>
                          <td className="px-2 py-1 text-right font-bold text-emerald-700">{kg(e.netoKg)}</td>
                          <td className="px-2 py-1">{e.empaque}</td>
                          <td className="px-2 py-1 uppercase">
                            {e.conservacion} {e.temperatura}
                          </td>
                          <td className="px-2 py-1">{fecha(e.fechaSacrificio)}</td>
                          <td className="px-2 py-1">{fecha(e.fechaEmpaque)}</td>
                          <td className="px-2 py-1">{fecha(e.fechaVencimiento)}</td>
                          <td className="px-2 py-1">{e.ref || '—'}</td>
                          <td className="px-2 py-1 uppercase">{e.bodega ?? '—'}</td>
                          <td className="px-2 py-1 uppercase">{e.procesadoPara || '—'}</td>
                          <td className="px-2 py-1 uppercase">{e.estacion || '—'}</td>
                          <td className="px-2 py-1">{e.usuario}</td>
                          <td className="px-2 py-1 text-center">{e.impresa ? 'Sí' : 'No'}</td>
                          <td className="px-2 py-1">
                            {e.trasladoOt ? (
                              <span className="rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                                EN PROCESO · {formatOT(e.trasladoOt)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700">DISPONIBLE</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

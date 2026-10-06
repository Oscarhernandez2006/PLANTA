import { useMemo, useState } from 'react';
import { ChevronRight, LoaderCircle, Search, Warehouse } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatOT } from '../registrar/orden-traslado-api';
import { formatOC } from '../registrar/orden-acondicionamiento-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { useBodegaInventario, useBodegasInventario, type BodegaDetalle, type BodegaResumen } from './api';

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

const PIEZA: Record<string, string> = { canal: 'CANAL', cizq: 'CIZQ', cder: 'CDER' };

const enProceso = 'rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950';
const disponible = 'text-[10px] font-bold text-emerald-700';

/** Inventario por bodega (interna del software) de cada cliente. */
export function BodegasTab() {
  const bodegas = useBodegasInventario();
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<BodegaResumen | null>(null);
  const q = busqueda.trim().toUpperCase();
  const rows = (bodegas.data ?? []).filter(
    (b) =>
      !q ||
      b.cliente.toUpperCase().includes(q) ||
      b.nombre.toUpperCase().includes(q) ||
      (b.clienteNit ?? '').includes(q),
  );

  if (bodegas.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b-2 border-border px-3 py-2">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 uppercase"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, NIT o bodega…"
          />
        </div>
        <p className="ml-auto text-xs text-muted-foreground">{rows.length} bodega(s)</p>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto p-2">
        {rows.map((b) => (
          <li key={b.id} className="mb-2">
            <button
              onClick={() => setAbierta(b)}
              className="flex w-full items-center gap-3 rounded-sm border-2 border-border bg-card px-4 py-3 text-left hover:bg-muted/50"
            >
              <Warehouse className="size-6 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold uppercase">
                  <span className="tabular-nums">{b.code}</span> - {b.nombre}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {b.clienteNit ? `${b.clienteNit} - ` : ''}
                  {b.cliente}
                </span>
              </span>
              <span className="flex shrink-0 gap-4 text-sm font-semibold tabular-nums text-muted-foreground">
                <span>{b.canales} canal(es)</span>
                <span>{b.productos} producto(s)</span>
                <span className="text-emerald-700">{kg(b.productosKg)} kg</span>
              </span>
              <ChevronRight className="size-5 shrink-0" />
            </button>
          </li>
        ))}
        {!rows.length && (
          <p className="py-10 text-center text-sm text-muted-foreground">No hay bodegas que coincidan.</p>
        )}
      </ul>
      {abierta && <BodegaDialog bodega={abierta} onClose={() => setAbierta(null)} />}
    </div>
  );
}

function BodegaDialog({ bodega, onClose }: { bodega: BodegaResumen; onClose: () => void }) {
  const detalle = useBodegaInventario(bodega.id);
  const d = detalle.data;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Bodega ${bodega.code} - ${bodega.nombre}`}
      description={`${bodega.clienteNit ? `${bodega.clienteNit} - ` : ''}${bodega.cliente}`}
      className="max-w-6xl"
      scrollInterno
    >
      {!d ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <Resumen d={d} />
          <Canales d={d} />
          <Productos d={d} />
        </div>
      )}
    </Dialog>
  );
}

function Caja({ titulo, valor, detalle, className }: { titulo: string; valor: string; detalle?: string; className?: string }) {
  return (
    <div className="rounded-md border border-border px-4 py-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{titulo}</p>
      <p className={cn('text-2xl font-bold tabular-nums', className)}>{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

function Resumen({ d }: { d: BodegaDetalle }) {
  const canalesKg = d.canales.reduce((s, c) => s + (c.pesoFrioKg ?? c.pesoKg), 0);
  const canalesEnOrden = d.canales.filter((c) => c.enOrden || c.enDespacho).length;
  const productosKg = d.productos.reduce((s, p) => s + p.netoKg, 0);
  const productosEnProceso = d.productos.filter((p) => p.trasladoOt && !p.transformadoOc).length;
  const transformados = d.productos.filter((p) => p.transformadoOc).length;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Caja titulo="Canales" valor={String(d.canales.length)} detalle={`${kg(canalesKg)} kg`} />
      <Caja titulo="Canales en orden" valor={String(canalesEnOrden)} className="text-amber-600" />
      <Caja titulo="Productos rotulados" valor={String(d.productos.length)} detalle={`${kg(productosKg)} kg`} className="text-emerald-700" />
      <Caja titulo="Productos en proceso" valor={String(productosEnProceso)} className="text-amber-600" />
      <Caja titulo="Transformados" valor={String(transformados)} className="text-violet-700" />
    </div>
  );
}

const th = 'whitespace-nowrap border-b-2 border-border px-2 py-1.5 text-left text-xs font-semibold uppercase text-muted-foreground';
const td = 'whitespace-nowrap border-b border-border px-2 py-1';

function Canales({ d }: { d: BodegaDetalle }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold">Canales ({d.canales.length})</h3>
      {!d.canales.length ? (
        <p className="text-sm text-muted-foreground">No hay canales en esta bodega.</p>
      ) : (
        <div className="scrollbar-app max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {['Lote', 'Animal', 'Barcode', 'Fecha', 'Tipo', 'Pieza', 'Cava', 'Destino', 'Caliente (kg)', 'Frío (kg)', 'Estado'].map((c) => (
                  <th key={c} className={th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.canales.map((c) => (
                <tr key={c.id} className="odd:bg-muted/30">
                  <td className={td}>{c.reference}</td>
                  <td className={td}>A{String(c.sequence).padStart(2, '0')}</td>
                  <td className={td}>
                    {c.canalTipo
                      ? codigoBarras({ lote: c.reference, turno: c.turno ?? c.sequence, canalTipo: c.canalTipo, pieza: c.pieza })
                      : '—'}
                  </td>
                  <td className={td}>{fecha(c.date)}</td>
                  <td className={cn(td, 'uppercase')}>{c.canalAnimalTipo ?? '—'}</td>
                  <td className={cn(td, 'font-semibold text-red-600')}>{PIEZA[c.pieza]}</td>
                  <td className={td}>{c.cava ?? '—'}</td>
                  <td className={td}>{c.destino || '—'}</td>
                  <td className={cn(td, 'text-right')}>{kg(c.pesoKg)}</td>
                  <td className={cn(td, 'text-right')}>{c.pesoFrioKg == null ? '—' : kg(c.pesoFrioKg)}</td>
                  <td className={td}>
                    {c.enOrden ? (
                      <span className={enProceso}>
                        {formatOD(c.enOrden.odNumber)}
                        {c.enOrden.opNumbers.length > 0 && ` · ${c.enOrden.opNumbers.map(formatOP).join(', ')} · EN PROCESO`}
                      </span>
                    ) : c.enDespacho ? (
                      <span className="rounded-sm bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {formatDC(c.enDespacho.dcNumber)} · DESPACHO {c.enDespacho.tipo === 'caliente' ? 'CALIENTE' : 'FRÍO'}
                      </span>
                    ) : (
                      <span className={disponible}>DISPONIBLE</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Productos({ d }: { d: BodegaDetalle }) {
  const resumen = useMemo(() => {
    const m = new Map<string, { codigo: string; producto: string; piezas: number; kg: number; enProceso: number; transformados: number }>();
    for (const p of d.productos) {
      const g = m.get(p.productoCodigo) ?? { codigo: p.productoCodigo, producto: p.productoNombre, piezas: 0, kg: 0, enProceso: 0, transformados: 0 };
      g.piezas += 1;
      g.kg += p.netoKg;
      if (p.transformadoOc) g.transformados += 1;
      else if (p.trasladoOt) g.enProceso += 1;
      m.set(p.productoCodigo, g);
    }
    return [...m.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }, [d.productos]);

  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold">Productos rotulados ({d.productos.length})</h3>
      {!d.productos.length ? (
        <p className="text-sm text-muted-foreground">No hay productos rotulados en esta bodega.</p>
      ) : (
        <>
          <div className="scrollbar-app overflow-auto rounded-md border border-border">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead className="bg-muted">
                <tr>
                  {['Código', 'Producto', 'Piezas', 'Neto (kg)', 'En proceso', 'Transformados', 'Disponibles'].map((c) => (
                    <th key={c} className={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.codigo} className="odd:bg-muted/30">
                    <td className={td}>{r.codigo}</td>
                    <td className={cn(td, 'font-medium uppercase')}>{r.producto}</td>
                    <td className={td}>{r.piezas}</td>
                    <td className={cn(td, 'text-right font-semibold text-emerald-700')}>{kg(r.kg)}</td>
                    <td className={cn(td, 'text-amber-700')}>{r.enProceso}</td>
                    <td className={cn(td, 'text-violet-700')}>{r.transformados}</td>
                    <td className={cn(td, 'text-emerald-700')}>{r.piezas - r.enProceso - r.transformados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="scrollbar-app max-h-[55vh] overflow-auto rounded-md border border-border">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {['Código de barras', 'Producto', 'Pieza', 'Tienda', 'N.º canast.', 'Neto (kg)', 'Conservación', 'Empaque', 'Vence', 'Lote', 'Estado'].map((c) => (
                    <th key={c} className={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.productos.map((p) => (
                  <tr key={p.id} className="odd:bg-muted/30">
                    <td className={cn(td, 'font-semibold')}>{p.codigo ?? '—'}</td>
                    <td className={cn(td, 'uppercase')}>
                      {p.productoCodigo} · {p.productoNombre}
                      {p.sobrante && <span className={cn(enProceso, 'ml-1.5')}>SOBRANTE</span>}
                    </td>
                    <td className={td}>#{p.pieza}</td>
                    <td className={cn(td, 'uppercase')}>{p.tiendaCodigo} - {p.tienda}</td>
                    <td className={cn(td, 'text-center')}>{p.canastilla ?? '—'}</td>
                    <td className={cn(td, 'text-right font-semibold text-emerald-700')}>{kg(p.netoKg)}</td>
                    <td className={cn(td, 'uppercase')}>{p.conservacion}</td>
                    <td className={td}>{fecha(p.fechaEmpaque)}</td>
                    <td className={td}>{fecha(p.fechaVencimiento)}</td>
                    <td className={td}>
                      {p.ocNumber ? (
                        <span title={p.origenOt ? `Viene de ${formatOT(p.origenOt)}` : undefined}>
                          {formatOC(p.ocNumber)}
                          {p.origenOt && <span className="text-muted-foreground"> ← {formatOT(p.origenOt)}</span>}
                        </span>
                      ) : p.opNumber ? (
                        formatOP(p.opNumber)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={td}>
                      {p.despachoDc ? (
                        <span className="rounded-sm bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          EN DESPACHO · {formatDC(p.despachoDc)}
                        </span>
                      ) : p.transformadoOc ? (
                        <span className="rounded-sm bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          TRANSFORMADO · {formatOC(p.transformadoOc)}
                        </span>
                      ) : p.trasladoOt ? (
                        <span className={enProceso}>EN PROCESO · {formatOT(p.trasladoOt)}</span>
                      ) : (
                        <span className={disponible}>DISPONIBLE</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

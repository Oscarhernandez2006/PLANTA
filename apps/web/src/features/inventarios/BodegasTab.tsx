import { Fragment, useMemo, useState } from 'react';
import { Beef, Boxes, ChevronDown, ChevronRight, LoaderCircle, Search, Warehouse } from 'lucide-react';
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
import { TrazabilidadCanalDialog } from './TrazabilidadCanalDialog';
import { TrazabilidadEtiquetaDialog } from './TrazabilidadEtiquetaDialog';
import { TrazabilidadReciboDialog } from './TrazabilidadReciboDialog';
import { DIAS_VENCE, diasVence, fecha, SemaforoPill, semaforoGeneral, VenceChip } from './semaforo-ui';

export { fecha } from './semaforo-ui';

export const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PIEZA: Record<string, string> = { canal: 'CANAL', cizq: 'CIZQ', cder: 'CDER' };

const enProceso = 'rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950';
const disponible = 'text-[10px] font-bold text-emerald-700';

/** Inventario por bodega (interna del software) de cada cliente. */
export function BodegasTab() {
  const bodegas = useBodegasInventario();
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<BodegaResumen | null>(null);
  const q = busqueda.trim().toUpperCase();
  const rows = (bodegas.data ?? [])
    .filter((b) =>
      !q ||
      b.cliente.toUpperCase().includes(q) ||
      b.nombre.toUpperCase().includes(q) ||
      (b.clienteNit ?? '').includes(q) ||
      String(b.code).includes(q),
    )
    .sort((a, b) =>
      (b.canalesKg + b.productosKg) - (a.canalesKg + a.productosKg) ||
      a.cliente.localeCompare(b.cliente, 'es') || a.code - b.code,
    );

  if (bodegas.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  if (bodegas.isError && !bodegas.data) {
    return <p role="alert" className="p-6 text-sm text-destructive">No se pudieron cargar las bodegas. Intenta nuevamente.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-8"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, NIT o bodega…"
          />
        </div>
        <p className="ml-auto text-xs text-muted-foreground">{rows.length} bodega(s) · mayor peso primero</p>
      </div>
      <ul className="scrollbar-app min-h-0 flex-1 divide-y divide-border overflow-auto px-3">
        {rows.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setAbierta(b)}
              className="flex w-full flex-wrap items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:flex-nowrap"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Warehouse className="size-5" />
              </span>
              <span className="min-w-0 flex-1 basis-[calc(100%-5rem)] sm:basis-auto">
                <span className="block truncate text-sm font-bold uppercase">
                  <span className="tabular-nums">{b.code}</span> · {b.nombre}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {b.clienteNit ? `${b.clienteNit} - ` : ''}
                  {b.cliente}
                </span>
              </span>
              <span className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground sm:flex-none">
                <span className="flex items-center gap-1"><Beef className="size-4" /> {b.canales} canales · {kg(b.canalesKg)} kg</span>
                <span className="flex items-center gap-1"><Boxes className="size-4" /> {b.productos} productos · {kg(b.productosKg)} kg</span>
              </span>
              <span className="ml-auto text-right text-sm font-bold tabular-nums text-primary">
                {kg(b.canalesKg + b.productosKg)} kg
                <span className="block text-[10px] font-medium uppercase text-muted-foreground">Canales + productos</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
      className="max-w-[min(92vw,100rem)]"
      scrollInterno
    >
      {detalle.isError && !d ? (
        <p role="alert" className="py-8 text-center text-sm text-destructive">No se pudo cargar el detalle de la bodega. Intenta nuevamente.</p>
      ) : !d ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <Resumen d={d} />
          <Canales d={d} />
          <Productos d={d} ajustarAncho />
        </div>
      )}
    </Dialog>
  );
}

export function Caja({ titulo, valor, detalle, className }: { titulo: string; valor: string; detalle?: string; className?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{titulo}</p>
      <p className={cn('text-2xl font-bold tabular-nums', className)}>{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

function Resumen({ d }: { d: BodegaDetalle }) {
  const enPlanta = d.canales.filter((c) => !c.enDespacho?.cerrada && !c.enOrden?.cerrada);
  const canalesKg = enPlanta.reduce((s, c) => s + (c.pesoFrioKg ?? c.pesoKg), 0);
  const canalesEnOrden = enPlanta.filter((c) => c.enOrden || c.enDespacho).length;
  const despachadas = d.canales.filter((c) => c.enDespacho?.cerrada).length;
  const procesadas = d.canales.filter((c) => c.enOrden?.cerrada).length;
  const vigentes = d.productos.filter((p) => !p.transformadoOc && !p.despachoCerrado);
  const productosKg = vigentes.reduce((s, p) => s + p.netoKg, 0);
  const productosEnProceso = vigentes.filter((p) => p.trasladoOt && !p.despachoDc).length;
  const transformados = d.productos.filter((p) => p.transformadoOc).length;
  const productosDespachados = d.productos.filter((p) => p.despachoCerrado).length;
  const porVencer = vigentes.filter((p) => {
    const dias = diasVence(p.fechaVencimiento);
    return dias != null && dias <= DIAS_VENCE;
  }).length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Caja titulo="Canales en planta" valor={`${kg(canalesKg)} kg`} detalle={`${enPlanta.length} piezas · ${canalesEnOrden} en orden`} />
      <Caja titulo="Productos en planta" valor={`${kg(productosKg)} kg`} detalle={`${vigentes.length} etiquetas · ${productosEnProceso} en proceso`} className="text-emerald-700" />
      <Caja titulo="Por vencer o vencidas" valor={String(porVencer)} detalle="Etiquetas dentro de 5 días o vencidas" className={porVencer ? 'text-amber-700' : undefined} />
      <Caja
        titulo="Histórico"
        valor={String(despachadas + procesadas + transformados + productosDespachados)}
        detalle={`${despachadas} canales despachadas · ${procesadas} procesadas · ${transformados} transformados · ${productosDespachados} productos despachados`}
      />
    </div>
  );
}

const th = 'whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-xs font-semibold uppercase text-muted-foreground';
const td = 'whitespace-nowrap border-b border-border px-3 py-2';

function Canales({ d }: { d: BodegaDetalle }) {
  const [trazaId, setTrazaId] = useState<string | null>(null);
  const [reciboId, setReciboId] = useState<string | null>(null);
  return (
    <section className="space-y-2">
      {trazaId && <TrazabilidadCanalDialog piezaId={trazaId} onClose={() => setTrazaId(null)} />}
      {reciboId && <TrazabilidadReciboDialog tipo="canal" id={reciboId} onClose={() => setReciboId(null)} />}
      <h3 className="flex items-center gap-2 text-base font-semibold"><Beef className="size-4 text-primary" /> Canales ({d.canales.length})</h3>
      {!d.canales.length ? (
        <p className="text-sm text-muted-foreground">No hay canales en esta bodega.</p>
      ) : (
        <div className="scrollbar-app max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm tabular-nums xl:table-fixed">
            <colgroup>
              {[6, 5, 9, 9, 7, 6, 7, 15, 9, 9, 18].map((ancho, i) => <col key={i} style={{ width: `${ancho}%` }} />)}
            </colgroup>
            <thead className="sticky top-0 bg-muted">
              <tr>
                {['Lote', 'Animal', 'Barcode', 'Fecha', 'Tipo', 'Pieza', 'Cava', 'Destino', 'Caliente (kg)', 'Frío (kg)', 'Estado'].map((c) => (
                  <th key={c} className={cn(th, 'xl:whitespace-normal xl:break-words')}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.canales.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => (c.recibo ? setReciboId(c.id) : setTrazaId(c.id))}
                  title={c.recibo ? 'Ver trazabilidad del recibo' : 'Ver trazabilidad de la canal'}
                  className="cursor-pointer odd:bg-muted/30 hover:bg-muted/60"
                >
                  <td className={cn(td, 'xl:whitespace-normal xl:break-words')}>{c.recibo ? `RC${c.recibo.receiptNumber}` : c.reference}</td>
                  <td className={cn(td, 'xl:whitespace-normal xl:break-words')}>{c.recibo ? '—' : `A${String(c.sequence).padStart(2, '0')}`}</td>
                  <td className={cn(td, 'xl:whitespace-normal xl:break-all')}>
                    {c.recibo
                      ? `RC${c.recibo.receiptNumber}-${String(c.recibo.codigo).padStart(2, '0')}`
                      : c.canalTipo
                        ? codigoBarras({ lote: c.reference, turno: c.turno ?? c.sequence, canalTipo: c.canalTipo, pieza: c.pieza })
                        : '—'}
                  </td>
                  <td className={cn(td, 'xl:whitespace-normal xl:break-words')}>{fecha(c.date)}</td>
                  <td className={cn(td, 'uppercase xl:whitespace-normal xl:break-words')}>{c.recibo ? 'RECIBIDA' : (c.canalAnimalTipo ?? '—')}</td>
                  <td className={cn(td, 'font-semibold text-red-600 xl:whitespace-normal xl:break-words')}>{PIEZA[c.pieza]}</td>
                  <td className={cn(td, 'xl:whitespace-normal xl:break-words')}>{c.cava ?? '—'}</td>
                  <td className={cn(td, 'xl:whitespace-normal xl:break-words')}>{c.destino || '—'}</td>
                  <td className={cn(td, 'text-right xl:whitespace-normal xl:break-words')}>{kg(c.pesoKg)}</td>
                  <td className={cn(td, 'text-right xl:whitespace-normal xl:break-words')}>{c.pesoFrioKg == null ? '—' : kg(c.pesoFrioKg)}</td>
                  <td className={cn(td, 'xl:whitespace-normal xl:break-words')}>
                    {c.enOrden?.cerrada ? (
                      <span className="rounded-sm bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        PROCESADA · {formatOD(c.enOrden.odNumber)}
                        {c.enOrden.opNumbers.length > 0 && ` · ${c.enOrden.opNumbers.map(formatOP).join(', ')}`}
                      </span>
                    ) : c.enOrden ? (
                      <span className={enProceso}>
                        {formatOD(c.enOrden.odNumber)}
                        {c.enOrden.opNumbers.length > 0 && ` · ${c.enOrden.opNumbers.map(formatOP).join(', ')} · EN PROCESO`}
                      </span>
                    ) : c.enDespacho?.cerrada ? (
                      <span className="rounded-sm bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        DESPACHADA · {formatDC(c.enDespacho.dcNumber)} · {c.enDespacho.tipo === 'caliente' ? 'CALIENTE' : 'FRÍO'}
                      </span>
                    ) : c.enDespacho ? (
                      <span className="rounded-sm bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {formatDC(c.enDespacho.dcNumber)} · DESPACHO {c.enDespacho.tipo === 'caliente' ? 'CALIENTE' : 'FRÍO'}
                      </span>
                    ) : (
                      <span className={disponible}>DISPONIBLE</span>
                    )}
                    {!c.enOrden?.cerrada && !c.enDespacho?.cerrada && (
                      <span className="ml-1.5"><SemaforoPill estado={c.semaforo} canal /></span>
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

export function Productos({ d, ajustarAncho = false }: { d: Pick<BodegaDetalle, 'productos'>; ajustarAncho?: boolean }) {
  // Despliegue del detalle (etiquetas) por producto al hacer clic en su fila.
  const [abierto, setAbierto] = useState<Set<string>>(new Set());
  const [trazaId, setTrazaId] = useState<string | null>(null);
  const [postaId, setPostaId] = useState<string | null>(null);
  const toggle = (codigo: string) =>
    setAbierto((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });

  const porProducto = useMemo(() => {
    const m = new Map<string, BodegaDetalle['productos']>();
    for (const p of d.productos) {
      const lista = m.get(p.productoCodigo) ?? [];
      lista.push(p);
      m.set(p.productoCodigo, lista);
    }
    return m;
  }, [d.productos]);

  const resumen = useMemo(() => {
    const m = new Map<string, { codigo: string; producto: string; piezas: number; kg: number; enProceso: number; enDespacho: number; transformados: number; despachados: number; vence: string | null }>();
    for (const p of d.productos) {
      const g = m.get(p.productoCodigo) ?? { codigo: p.productoCodigo, producto: p.productoNombre, piezas: 0, kg: 0, enProceso: 0, enDespacho: 0, transformados: 0, despachados: 0, vence: null };
      m.set(p.productoCodigo, g);
      // Lo despachado ya salió de planta: se lista pero no suma piezas ni kilos.
      if (p.despachoCerrado) {
        g.despachados += 1;
        continue;
      }
      g.piezas += 1;
      g.kg += p.netoKg;
      if (p.transformadoOc) g.transformados += 1;
      else if (p.despachoDc) g.enDespacho += 1;
      else if (p.trasladoOt) g.enProceso += 1;
      if (!p.transformadoOc && p.fechaVencimiento && (!g.vence || p.fechaVencimiento < g.vence)) g.vence = p.fechaVencimiento;
    }
    return [...m.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }, [d.productos]);

  const ajuste = ajustarAncho ? 'xl:whitespace-normal xl:break-words' : '';
  const sub = cn('whitespace-nowrap border-b border-border px-3 py-2 text-xs', ajuste);

  return (
    <section className="space-y-2">
      {trazaId && <TrazabilidadEtiquetaDialog id={trazaId} onClose={() => setTrazaId(null)} />}
      {postaId && <TrazabilidadReciboDialog tipo="posta" id={postaId} onClose={() => setPostaId(null)} />}
      <h3 className="flex items-center gap-2 text-base font-semibold"><Boxes className="size-4 text-primary" /> Productos rotulados ({d.productos.length})</h3>
      {!d.productos.length ? (
        <p className="text-sm text-muted-foreground">No hay productos rotulados en esta bodega.</p>
      ) : (
        <div className="scrollbar-app max-h-[60vh] overflow-auto rounded-md border border-border">
          <table className={cn('w-full border-collapse text-sm tabular-nums', ajustarAncho && 'xl:table-fixed')}>
            {ajustarAncho && (
              <colgroup>
                {[3, 7, 25, 6, 9, 9, 9, 10, 9, 13].map((ancho, i) => <col key={i} style={{ width: `${ancho}%` }} />)}
              </colgroup>
            )}
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                {['', 'Código', 'Producto', 'Piezas', 'Neto (kg)', 'En proceso', 'En despacho', 'Transformados', 'Disponibles', 'Vence'].map(
                  (c, i) => (
                    <th key={i} className={cn(th, ajuste)}>{c}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => {
                const expandido = abierto.has(r.codigo);
                const etiquetas = porProducto.get(r.codigo) ?? [];
                return (
                  <Fragment key={r.codigo}>
                    <tr
                      className="cursor-pointer odd:bg-muted/30 hover:bg-muted/60"
                      onClick={() => toggle(r.codigo)}
                      title="Ver el detalle de las etiquetas"
                    >
                      <td className={cn(td, ajuste, 'text-center text-muted-foreground')}>
                        {expandido ? <ChevronDown className="inline size-4" /> : <ChevronRight className="inline size-4" />}
                      </td>
                      <td className={cn(td, ajuste, 'font-semibold')}>{r.codigo}</td>
                      <td className={cn(td, ajuste, 'font-medium uppercase')}>{r.producto}</td>
                      <td className={cn(td, ajuste)}>{r.piezas}</td>
                      <td className={cn(td, ajuste, 'text-right font-semibold text-emerald-700')}>{kg(r.kg)}</td>
                      <td className={cn(td, ajuste, 'text-amber-700')}>{r.enProceso}</td>
                      <td className={cn(td, ajuste, 'text-sky-700')}>
                        {r.enDespacho}
                        {r.despachados > 0 && <span className="ml-1 text-xs font-semibold">(+{r.despachados} despachados)</span>}
                      </td>
                      <td className={cn(td, ajuste, 'text-violet-700')}>{r.transformados}</td>
                      <td className={cn(td, ajuste, 'text-emerald-700')}>{r.piezas - r.enProceso - r.enDespacho - r.transformados}</td>
                      <td className={cn(td, ajuste)}>
                        <div className="flex items-center gap-2">
                          <VenceChip iso={r.vence} />
                          {etiquetas.some((e) => !e.transformadoOc && !e.despachoCerrado) && (
                            <SemaforoPill estado={semaforoGeneral(etiquetas.filter((e) => !e.transformadoOc && !e.despachoCerrado).map((e) => e.semaforo))} />
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandido && (
                      <tr>
                        <td className="bg-muted/10 p-0" colSpan={10}>
                          <div className="scrollbar-app max-h-[40vh] overflow-auto">
                            <table className={cn('w-full border-collapse text-sm tabular-nums', ajustarAncho && 'xl:table-fixed')}>
                              <thead className="sticky top-0 bg-muted/80 text-left">
                                <tr>
                                  {['Código de barras', 'Pieza', 'Tienda', 'N.º canast.', 'Neto (kg)', 'Conservación', 'Empaque', 'Vence', 'Lote', 'Estado'].map(
                                    (c) => (
                                      <th key={c} className={cn(th, ajuste, 'text-[11px]')}>{c}</th>
                                    ),
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {etiquetas.map((p) => (
                                  <tr
                                    key={p.id}
                                    onClick={() => (p.rpNumber ? setPostaId(p.id) : setTrazaId(p.id))}
                                    title={p.rpNumber ? 'Ver trazabilidad del recibo en posta' : 'Ver trazabilidad de la etiqueta'}
                                    className="cursor-pointer odd:bg-background hover:bg-emerald-50"
                                  >
                                    <td className={cn(sub, 'font-semibold text-emerald-700 underline-offset-2 hover:underline')}>
                                      {p.codigo ?? '—'}
                                    </td>
                                    <td className={sub}>#{p.pieza}</td>
                                    <td className={cn(sub, 'uppercase')}>{p.tiendaCodigo ? `${p.tiendaCodigo} - ${p.tienda}` : p.tienda}</td>
                                    <td className={cn(sub, 'text-center')}>{p.canastilla ?? '—'}</td>
                                    <td className={cn(sub, 'text-right font-semibold text-emerald-700')}>{kg(p.netoKg)}</td>
                                    <td className={cn(sub, 'uppercase')}>{p.conservacion}</td>
                                    <td className={cn(sub, p.sobrante ? 'font-semibold text-amber-700' : '')}>
                                      {fecha(p.fechaEmpaque)}
                                      {p.sobrante && <span className={cn(enProceso, 'ml-1.5')}>SOBRANTE</span>}
                                    </td>
                                    <td className={sub}><VenceChip iso={p.fechaVencimiento} resaltado /></td>
                                    <td className={sub}>
                                      {p.rpNumber ? (
                                        `RP${p.rpNumber}`
                                      ) : p.ocNumber ? (
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
                                    <td className={sub}>
                                      {p.despachoCerrado ? (
                                        <span className="rounded-sm bg-sky-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                          DESPACHADO · {formatDC(p.despachoDc!)}
                                        </span>
                                      ) : p.despachoDc ? (
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


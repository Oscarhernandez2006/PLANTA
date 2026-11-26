import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Beef,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Inbox,
  LoaderCircle,
  Search,
  Snowflake,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { formatOB } from '../registrar/orden-beneficio-api';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatOC } from '../registrar/orden-acondicionamiento-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { formatOT } from '../registrar/orden-traslado-api';
import { Productos, fecha, kg } from './BodegasTab';
import { DIAS_VENCE, diasVence, SemaforoPill, semaforoGeneral, VenceChip } from './semaforo-ui';
import { FiltroSelect } from './FiltroSelect';
import { TrazabilidadCanalDialog } from './TrazabilidadCanalDialog';
import { TrazabilidadEtiquetaDialog } from './TrazabilidadEtiquetaDialog';
import { TrazabilidadReciboDialog } from './TrazabilidadReciboDialog';
import { descargarInventarioClienteExcel } from './inventario-cliente-export';
import { descargarReporteInventario } from './inventario-reporte-export';
import { DescargasDesposte } from '../informes/DescargasDesposte';
import {
  useBodegasDetalle,
  useBodegasInventario,
  useResumenInventario,
  type BodegaDetalle,
  type BodegaResumen,
  type CavaSubproductoCategoria,
  type DestinoProducto,
  type Semaforo,
} from './api';

type Canal = BodegaDetalle['canales'][number];
type Producto = BodegaDetalle['productos'][number];
type Subproducto = BodegaDetalle['subproductos'][number];

// Módulo de subproductos en pruebas: se muestra como "Próximamente" sin datos.
const SUBPRODUCTOS_ACTIVO = false;

interface ClienteResumen {
  id: string;
  nombre: string;
  nit: string | null;
  bodegas: BodegaResumen[];
  canales: number;
  canalesKg: number;
  productos: number;
  productosKg: number;
}

const PIEZA: Record<Canal['pieza'], string> = { canal: 'CANAL', cizq: 'CIZQ', cder: 'CDER' };
const ORDEN_PIEZA: Record<Canal['pieza'], number> = { canal: 0, cizq: 1, cder: 2 };

const CATEGORIA: Record<CavaSubproductoCategoria, { label: string; orden: number }> = {
  viscera_roja: { label: 'Vísceras rojas', orden: 0 },
  viscera_blanca: { label: 'Vísceras blancas', orden: 1 },
  retoma: { label: 'Retomas', orden: 2 },
  cabeza_patas: { label: 'Retomas', orden: 2 },
};

const kg0 = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 0 });

const cavaSubproducto = (cava: string | null) =>
  !cava ? '—' : cava === '3' ? 'SUBPRODUCTO DESPACHO' : `SUBPRODUCTO ${cava}`;

/** En una orden activa (OD a proceso o DC sin cerrar): sigue en planta pero ya está asignada. */
const canalEnOrden = (c: Canal) =>
  !!((c.enOrden && !c.enOrden.cerrada) || (c.enDespacho && !c.enDespacho.cerrada));
const canalDespachada = (c: Canal) => !!c.enDespacho?.cerrada;
const canalProcesada = (c: Canal) => !!c.enOrden?.cerrada;
const estadoCanal = (c: Canal) =>
  canalDespachada(c) ? 'despachada' : canalProcesada(c) ? 'procesada' : canalEnOrden(c) ? 'orden' : 'libre';
const barcodeDe = (c: Canal) =>
  c.recibo
    ? `RC${c.recibo.receiptNumber}-${String(c.recibo.codigo).padStart(2, '0')}`
    : c.canalTipo
      ? codigoBarras({ lote: c.reference, turno: c.turno ?? c.sequence, canalTipo: c.canalTipo, pieza: c.pieza })
      : '';
const productoLibre = (p: Producto) => !p.despachoDc && !p.transformadoOc && !p.trasladoOt;
const productoFuera = (p: Producto) => !!p.transformadoOc || p.despachoCerrado;

function LotesAntiguos({ etiquetas }: { etiquetas: Producto[] }) {
  const lotes = new Map<number, number>();
  const ahora = Date.now();
  for (const p of etiquetas) {
    if (productoFuera(p) || !p.opNumber || !p.desposteCerradoAt) continue;
    const dias = (ahora - new Date(p.desposteCerradoAt).getTime()) / 86_400_000;
    if (dias > 5) lotes.set(p.opNumber, Math.floor(dias));
  }
  if (!lotes.size) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {[...lotes].map(([op, dias]) => (
        <Chip key={op} className="bg-amber-100 text-amber-800">
          {formatOP(op)} · más de {dias} días en planta
        </Chip>
      ))}
    </div>
  );
}

function Vacio({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
      <Inbox className="size-8" />
      <p className="max-w-xs text-sm">{text}</p>
    </div>
  );
}

function Kpi({
  icon: Icon,
  titulo,
  valor,
  sub,
  alerta,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  valor: string;
  sub?: string;
  alerta?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card px-4 py-3', alerta ? 'border-red-200' : 'border-border')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('size-4', alerta ? 'text-red-600' : 'text-primary')} />
        {titulo}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold tabular-nums', alerta && 'text-red-600')}>{valor}</span>
        {sub && <span className="truncate text-sm text-muted-foreground">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', className)}>{children}</span>;
}

/** Inventario por cliente: lista a la izquierda y el inventario del cliente elegido a la derecha. */
export function ClientesView({ destino = null }: { destino?: DestinoProducto | null }) {
  const bodegas = useBodegasInventario();
  const resumen = useResumenInventario();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [verTodo, setVerTodo] = useState(false);

  const clientes = useMemo(() => {
    const m = new Map<string, ClienteResumen>();
    for (const b of bodegas.data ?? []) {
      const total =
        b.canales +
        b.productos +
        (SUBPRODUCTOS_ACTIVO ? b.subproductos : 0) +
        (verTodo ? b.canalesDespachadas + b.canalesProcesadas + b.productosDespachados : 0);
      if (!total) continue;
      const c = m.get(b.clienteId) ?? {
        id: b.clienteId,
        nombre: b.cliente,
        nit: b.clienteNit,
        bodegas: [],
        canales: 0,
        canalesKg: 0,
        productos: 0,
        productosKg: 0,
      };
      c.bodegas.push(b);
      c.canales += b.canales;
      c.canalesKg += b.canalesKg;
      c.productos += b.productos;
      c.productosKg += b.productosKg;
      m.set(b.clienteId, c);
    }
    return [...m.values()].sort((a, b) => b.canalesKg + b.productosKg - (a.canalesKg + a.productosKg));
  }, [bodegas.data, verTodo]);

  const extra = useMemo(() => {
    const r = resumen.data;
    const m = new Map<string, { subKg: number; porVencer: number; canalesViejas: number; semaforo: Semaforo | null }>();
    for (const c of r?.clientes ?? [])
      m.set(c.cliente, { subKg: SUBPRODUCTOS_ACTIVO ? c.subproductosKg : 0, porVencer: 0, canalesViejas: 0, semaforo: c.semaforo });
    for (const p of r?.alertas.productosPorVencer ?? []) {
      const e = m.get(p.cliente);
      if (e) e.porVencer += p.unds;
    }
    for (const a of r?.alertas.canalesAntiguas ?? []) {
      const e = m.get(a.cliente);
      if (e) e.canalesViejas += 1;
    }
    return m;
  }, [resumen.data]);

  const q = busqueda.trim().toUpperCase();
  // Un código de barras se busca dentro del inventario de todas las bodegas.
  const codigoQ = busqueda.replace(/\s/g, '').toUpperCase();
  const porCodigo = codigoQ.length >= 4 && /\d/.test(codigoQ);
  const listaBodegas = bodegas.data ?? [];
  const detalles = useBodegasDetalle(porCodigo ? listaBodegas.map((b) => b.id) : []);
  const buscandoCodigo = detalles.some((r) => r.isLoading);
  const conCodigo = useMemo(() => {
    const s = new Set<string>();
    if (!porCodigo) return s;
    detalles.forEach((r, i) => {
      const d = r.data;
      if (!d) return;
      if (
        d.productos.some((p) => (verTodo || !p.despachoCerrado) && (p.codigo ?? '').toUpperCase().includes(codigoQ)) ||
        d.canales.some((c) => barcodeDe(c).toUpperCase().includes(codigoQ))
      )
        s.add(listaBodegas[i].clienteId);
    });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porCodigo, codigoQ, verTodo, detalles.map((r) => r.dataUpdatedAt).join('|')]);
  const visibles = clientes.filter(
    (c) => !q || c.nombre.toUpperCase().includes(q) || (c.nit ?? '').includes(q) || conCodigo.has(c.id),
  );
  const bodegasDestino = destino
    ? listaBodegas.filter((b) => destino.bodegaId
      ? b.id === destino.bodegaId
      : b.cliente === destino.cliente && b.nombre === destino.bodega)
    : [];
  const bodegaDestino = bodegasDestino.length === 1 ? bodegasDestino[0] : null;
  const cliente = clienteId
    ? clientes.find((c) => c.id === clienteId) ?? null
    : destino
      ? clientes.find((c) => c.bodegas.some((b) => b.id === bodegaDestino?.id)) ?? null
      : visibles[0] ?? null;
  const buscarEnCliente = cliente && conCodigo.has(cliente.id) ? codigoQ : '';
  const maxKg = Math.max(1, ...clientes.map((c) => c.canalesKg + c.productosKg + (extra.get(c.nombre)?.subKg ?? 0)));

  if (bodegas.isLoading)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[21rem_minmax(0,1fr)]">
      {/* Clientes */}
      <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="space-y-2 border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, NIT o barcode"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {buscandoCodigo && <LoaderCircle className="size-3 animate-spin" />}
              {visibles.length} cliente(s) con inventario
            </span>
            <label className="flex cursor-pointer items-center gap-1.5" title="Incluir canales procesadas/despachadas y productos transformados/despachados">
              <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={verTodo} onChange={(e) => setVerTodo(e.target.checked)} />
              Ver histórico
            </label>
          </div>
        </div>
        {!visibles.length ? (
          <Vacio text={clientes.length ? 'No hay clientes que coincidan.' : 'Ningún cliente tiene inventario en planta.'} />
        ) : (
          <ul className="scrollbar-app min-h-0 flex-1 space-y-1.5 overflow-auto p-2">
            {visibles.map((c) => {
              const e = extra.get(c.nombre);
              const subKg = e?.subKg ?? 0;
              const total = c.canalesKg + c.productosKg + subKg;
              const sel = cliente?.id === c.id;
              const pct = (n: number) => `${(n / maxKg) * 100}%`;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setClienteId(c.id)}
                    className={cn(
                      'flex w-full flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      sel ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-transparent hover:bg-muted/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold uppercase">{c.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.nit ? `NIT ${c.nit}` : 'Sin NIT'} ·{' '}
                          {c.bodegas.length === 1 ? `Bodega ${c.bodegas[0].code}` : `${c.bodegas.length} bodegas`}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-bold tabular-nums">{kg0(total)} kg</span>
                        <SemaforoPill estado={e?.semaforo ?? null} />
                      </div>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={`Canal ${kg0(c.canalesKg)} · Producto ${kg0(c.productosKg)} · Subproducto ${kg0(subKg)} kg`}>
                      <div className="bg-primary" style={{ width: pct(c.canalesKg) }} />
                      <div className="bg-teal-400" style={{ width: pct(c.productosKg) }} />
                      <div className="bg-orange-400" style={{ width: pct(subKg) }} />
                    </div>
                    {(!!e?.porVencer || !!e?.canalesViejas) && (
                      <div className="flex flex-wrap gap-1">
                        {!!e?.porVencer && <Chip className="bg-amber-100 text-amber-800">{e.porVencer} por vencer</Chip>}
                        {!!e?.canalesViejas && <Chip className="bg-red-100 text-red-700">{e.canalesViejas} canales +días</Chip>}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center justify-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" />Canal</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-teal-400" />Producto</span>
          {SUBPRODUCTOS_ACTIVO && (
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-orange-400" />Subproducto</span>
          )}
        </div>
      </section>

      {/* Inventario del cliente */}
      {cliente ? (
        <DetalleCliente
          key={`${cliente.id}|${buscarEnCliente}`}
          cliente={cliente}
          verTodo={verTodo}
          buscar={buscarEnCliente}
          destino={!clienteId && destino && bodegaDestino ? { ...destino, bodegaId: bodegaDestino.id } : null}
        />
      ) : (
        <section className="rounded-xl border border-dashed border-border">
          <Vacio
            text={bodegas.isError
              ? 'No se pudo cargar el inventario de clientes. Actualiza la página.'
              : destino && !clienteId
                ? bodegasDestino.length > 1
                  ? 'No se pudo identificar una única bodega para esta alerta. Elegí un cliente o actualiza el tablero.'
                  : 'La bodega de esta alerta ya no está disponible en inventario. Elegí otro cliente o actualiza el tablero.'
                : 'Elegí un cliente para ver su inventario.'}
          />
        </section>
      )}
    </div>
  );
}

type TabDetalle = 'productos' | 'canales' | 'subproductos';

function DetalleCliente({ cliente, verTodo, buscar, destino }: { cliente: ClienteResumen; verTodo: boolean; buscar: string; destino: DestinoProducto | null }) {
  const [productoInicial, setProductoInicial] = useState(destino);
  const [bodegaId, setBodegaId] = useState<string>(destino?.bodegaId ?? 'todas');
  const ids = bodegaId === 'todas' ? cliente.bodegas.map((b) => b.id) : [bodegaId];
  const queries = useBodegasDetalle(ids);
  const cargando = queries.some((q) => q.isLoading);
  const errorBodega = queries.some((q) => q.isError);
  const [tab, setTab] = useState<TabDetalle | null>(destino ? 'productos' : null);
  const [agrupar, setAgrupar] = useState<'producto' | 'orden'>('producto');
  const [exportando, setExportando] = useState(false);
  const [exportandoReporte, setExportandoReporte] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState('');

  const datos = useMemo(() => {
    const canales: Canal[] = [];
    const productos: Producto[] = [];
    const subs = new Map<string, Subproducto>();
    for (const q of queries) {
      const d = q.data;
      if (!d) continue;
      canales.push(...(verTodo ? d.canales : d.canales.filter((c) => !canalDespachada(c) && !canalProcesada(c))));
      productos.push(...(verTodo ? d.productos : d.productos.filter((p) => !productoFuera(p))));
      // Un subproducto puede quedar asociado a varias bodegas del mismo cliente: se cuenta una vez.
      for (const s of d.subproductos) subs.set(s.id, s);
    }
    return { canales, productos, subproductos: SUBPRODUCTOS_ACTIVO ? [...subs.values()] : [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join('|'), verTodo, bodegaId]);

  const { canales, productos, subproductos } = datos;
  const enPlanta = canales.filter((c) => !canalDespachada(c) && !canalProcesada(c));
  const canalesKg = enPlanta.reduce((s, c) => s + c.pesoKg, 0);
  const canalesOrden = enPlanta.filter(canalEnOrden).length;
  // Lo despachado (DC cerrada) ya salió de planta: no suma al inventario aunque se vea en el histórico.
  const enStock = productos.filter((p) => !p.despachoCerrado);
  const productosKg = enStock.reduce((s, p) => s + p.netoKg, 0);
  const libres = enStock.filter(productoLibre);
  const libresKg = libres.reduce((s, p) => s + p.netoKg, 0);
  const subKg = subproductos.reduce((s, x) => s + (x.pesoKg ?? 0), 0);
  const subUnd = subproductos.reduce((s, x) => s + (x.cantidad ?? 0), 0);
  const vigentes = productos.filter((p) => !productoFuera(p));
  const vencidas = vigentes.filter((p) => (diasVence(p.fechaVencimiento) ?? 99) < 0).length;
  const porVencer = vigentes.filter((p) => {
    const d = diasVence(p.fechaVencimiento);
    return d != null && d >= 0 && d <= DIAS_VENCE;
  }).length;

  const porProducto = useMemo(() => agruparPorProducto(productos), [productos]);

  const tabs: { key: TabDetalle; label: string; n: number }[] = [
    { key: 'productos', label: 'Productos', n: productos.length },
    { key: 'canales', label: 'Canales', n: canales.length },
    { key: 'subproductos', label: 'Subproductos', n: subproductos.length },
  ];
  const activa =
    tab ??
    (buscar ? (canales.some((c) => barcodeDe(c).toUpperCase().includes(buscar)) ? 'canales' : 'productos') : undefined) ??
    tabs.find((t) => t.n > 0)?.key ??
    'productos';
  const nombreBodega = bodegaId === 'todas' ? 'Todas las bodegas' : cliente.bodegas.find((b) => b.id === bodegaId)?.nombre ?? '';

  async function exportar() {
    setExportando(true);
    setErrorExportacion('');
    try {
      await descargarInventarioClienteExcel({
        cliente: cliente.nombre,
        nit: cliente.nit,
        bodega: nombreBodega,
        porProducto: porProducto.map((p) => ({
          codigo: p.codigo,
          nombre: p.nombre,
          unds: p.unds,
          kg: p.kg,
          disponibles: p.disponibles,
          comprometidas: p.enProceso + p.enDespacho,
          vence: p.vence,
        })),
        productos,
        canales,
        subproductos,
      });
    } catch (error) {
      console.error('Error al exportar el inventario:', error);
      setErrorExportacion('No se pudo descargar el inventario. Intenta nuevamente.');
    } finally {
      setExportando(false);
    }
  }

  async function exportarReporte(tipo: 'productos' | 'canales') {
    setExportandoReporte(true);
    setErrorExportacion('');
    try {
      await descargarReporteInventario({ tipo, cliente: cliente.nombre, bodega: nombreBodega, productos, canales });
    } catch (error) {
      console.error('Error al exportar el reporte de inventario:', error);
      setErrorExportacion('No se pudo descargar el reporte. Intenta nuevamente.');
    } finally {
      setExportandoReporte(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-col gap-3">
      {/* Encabezado */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <Building2 className="size-7 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold uppercase">{cliente.nombre}</h2>
          <p className="text-sm text-muted-foreground">{cliente.nit ? `NIT ${cliente.nit}` : 'Sin NIT registrado'}</p>
        </div>
        {cliente.bodegas.length > 1 ? (
          <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
            Bodega
            <select
              value={bodegaId}
              onChange={(e) => {
                setProductoInicial(null);
                setBodegaId(e.target.value);
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-semibold normal-case text-foreground outline-none focus:border-primary"
            >
              <option value="todas">Todas ({cliente.bodegas.length})</option>
              {cliente.bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} - {b.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold">
            Bodega {cliente.bodegas[0]?.code} - {cliente.bodegas[0]?.nombre}
          </span>
        )}
        <Button variant="outline" className="h-10" onClick={() => void exportar()} disabled={cargando || errorBodega || exportando || exportandoReporte}>
          {exportando ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
          Excel general
        </Button>
      </div>

      {/* Indicadores */}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Beef} titulo="Canales" valor={`${kg(canalesKg)} kg`} sub={`${enPlanta.length} piezas`}>
          <div className="flex flex-wrap gap-1.5">
            <Chip className="bg-emerald-100 text-emerald-800">{enPlanta.length - canalesOrden} disponibles</Chip>
            {canalesOrden > 0 && <Chip className="bg-amber-100 text-amber-800">{canalesOrden} en orden</Chip>}
          </div>
        </Kpi>
        <Kpi icon={Boxes} titulo="Producto empacado" valor={`${kg(productosKg)} kg`} sub={`${enStock.length} etiquetas`}>
          <div className="flex flex-wrap gap-1.5">
            <Chip className="bg-emerald-100 text-emerald-800">{kg(libresKg)} kg disponibles</Chip>
            {enStock.length - libres.length > 0 && (
              <Chip className="bg-amber-100 text-amber-800">{enStock.length - libres.length} en proceso/despacho</Chip>
            )}
            {productos.length > enStock.length && (
              <Chip className="bg-sky-100 text-sky-800">{productos.length - enStock.length} despachados</Chip>
            )}
          </div>
        </Kpi>
        {SUBPRODUCTOS_ACTIVO ? (
          <Kpi icon={ClipboardList} titulo="Subproductos" valor={`${kg(subKg)} kg`} sub={`${subUnd} und`} />
        ) : (
          <Kpi icon={ClipboardList} titulo="Subproductos" valor="Próximamente" sub="Módulo en construcción" />
        )}
        <Kpi
          icon={AlertTriangle}
          titulo="Vencimientos"
          valor={`${porVencer + vencidas}`}
          sub={porVencer + vencidas ? `etiquetas en ${DIAS_VENCE} días o vencidas` : 'nada por vencer'}
          alerta={porVencer + vencidas > 0}
        >
          {vencidas > 0 && (
            <div>
              <Chip className="bg-red-600 text-white">{vencidas} vencidas</Chip>
            </div>
          )}
        </Kpi>
      </div>

      {/* Detalle */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setProductoInicial(null);
                  setTab(t.key);
                }}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors',
                  activa === t.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {t.key === 'subproductos' && !SUBPRODUCTOS_ACTIVO ? (
                  <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold uppercase text-amber-800">Pronto</span>
                ) : (
                  <span className={cn('rounded-full px-1.5 text-xs tabular-nums', activa === t.key ? 'bg-primary text-primary-foreground' : 'bg-background')}>
                    {t.n}
                  </span>
                )}
              </button>
            ))}
          </div>
          {activa === 'productos' && (
            <div className="ml-auto flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              Agrupar por
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                {(['producto', 'orden'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      setProductoInicial(null);
                      setAgrupar(a);
                    }}
                    className={cn(
                      'h-8 rounded-md px-3 text-sm font-semibold normal-case transition-colors',
                      agrupar === a ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {a === 'producto' ? 'Producto' : 'Orden'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(activa === 'productos' || activa === 'canales') && (
            <Button
              variant="outline"
              size="sm"
              className={activa === 'canales' ? 'ml-auto' : ''}
              onClick={() => void exportarReporte(activa)}
              disabled={cargando || errorBodega || exportando || exportandoReporte || (activa === 'productos' ? !productos.length : !canales.length)}
              title="Exporta todo el inventario de la bodega seleccionada, sin aplicar la búsqueda"
            >
              {exportandoReporte ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              Excel {activa}
            </Button>
          )}
        </div>
        {(errorBodega || errorExportacion) && (
          <p role="alert" className="px-3 py-2 text-sm text-destructive">
            {errorBodega ? 'No se pudo cargar el inventario de todas las bodegas. Actualiza la página.' : errorExportacion}
          </p>
        )}
        {productoInicial && !cargando && !errorBodega && !porProducto.some((p) => p.codigo === productoInicial.codigo) && (
          <p role="alert" className="px-3 py-2 text-sm text-destructive">
            El producto de esta alerta ya no está disponible en esta bodega. Actualiza el tablero.
          </p>
        )}
        <div className="min-h-0 flex-1">
          {cargando ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : activa === 'productos' ? (
            !productos.length ? (
              <Vacio text="Este cliente no tiene producto empacado en esta bodega." />
            ) : agrupar === 'producto' ? (
              <ProductosPorProducto filas={porProducto} verTodo={verTodo} buscar={buscar} codigoInicial={productoInicial?.codigo} />
            ) : (
              <ProductosPorOrden productos={productos} />
            )
          ) : activa === 'canales' ? (
            !canales.length ? <Vacio text="No hay canales de este cliente en planta." /> : <CanalesTabla canales={canales} buscar={buscar} />
          ) : !SUBPRODUCTOS_ACTIVO ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
                Próximamente
              </span>
              <p className="text-sm text-muted-foreground">El inventario de subproductos está en construcción.</p>
            </div>
          ) : !subproductos.length ? (
            <Vacio text="No hay subproductos de este cliente en cava." />
          ) : (
            <SubproductosTabla items={subproductos} />
          )}
        </div>
      </div>
    </section>
  );
}

interface FilaProducto {
  codigo: string;
  nombre: string;
  unds: number;
  kg: number;
  disponibles: number;
  disponiblesKg: number;
  enProceso: number;
  enDespacho: number;
  transformados: number;
  despachados: number;
  congelado: boolean;
  vence: string | null;
  etiquetas: Producto[];
}

function agruparPorProducto(productos: Producto[]): FilaProducto[] {
  const m = new Map<string, FilaProducto>();
  for (const p of productos) {
    const f = m.get(p.productoCodigo) ?? {
      codigo: p.productoCodigo,
      nombre: p.productoNombre,
      unds: 0,
      kg: 0,
      disponibles: 0,
      disponiblesKg: 0,
      enProceso: 0,
      enDespacho: 0,
      transformados: 0,
      despachados: 0,
      congelado: false,
      vence: null,
      etiquetas: [],
    };
    f.etiquetas.push(p);
    m.set(p.productoCodigo, f);
    // Lo despachado se lista pero ya no suma unidades ni kilos en planta.
    if (p.despachoCerrado) {
      f.despachados += 1;
      continue;
    }
    f.unds += 1;
    f.kg += p.netoKg;
    if (p.transformadoOc) f.transformados += 1;
    else if (p.despachoDc) f.enDespacho += 1;
    else if (p.trasladoOt) f.enProceso += 1;
    else {
      f.disponibles += 1;
      f.disponiblesKg += p.netoKg;
    }
    if (!p.transformadoOc && p.fechaVencimiento && (!f.vence || p.fechaVencimiento < f.vence)) f.vence = p.fechaVencimiento;
    if (/congel/i.test(p.conservacion)) f.congelado = true;
  }
  return [...m.values()].sort((a, b) => b.kg - a.kg);
}

function ProductosPorProducto({ filas, verTodo, buscar, codigoInicial }: {
  filas: FilaProducto[];
  verTodo: boolean;
  buscar: string;
  codigoInicial?: string;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(codigoInicial ? [codigoInicial] : []));
  const filaInicial = useRef<HTMLTableRowElement>(null);
  const desplazado = useRef(false);
  const [busqueda, setBusqueda] = useState(buscar);
  const [etiquetaId, setEtiquetaId] = useState<string | null>(null);
  const [postaId, setPostaId] = useState<string | null>(null);
  const q = busqueda.trim().toUpperCase();
  const codigoQ = busqueda.replace(/\s/g, '').toUpperCase();
  // Si no coincide el producto se buscan sus etiquetas por código de barras y se abren.
  const visibles = filas.flatMap((f) => {
    if (!q || f.codigo.includes(q) || f.nombre.toUpperCase().includes(q)) return [{ f, etiquetas: f.etiquetas, porCodigo: false }];
    const etiquetas = f.etiquetas.filter((e) => (e.codigo ?? '').toUpperCase().includes(codigoQ));
    return etiquetas.length ? [{ f, etiquetas, porCodigo: true }] : [];
  });
  useEffect(() => {
    if (!desplazado.current && filaInicial.current) {
      filaInicial.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      desplazado.current = true;
    }
  }, [filas, codigoInicial]);
  const toggle = (codigo: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  const tot = visibles.reduce(
    (s, { f }) => ({ unds: s.unds + f.unds, kg: s.kg + f.kg, disp: s.disp + f.disponibles, dispKg: s.dispKg + f.disponiblesKg }),
    { unds: 0, kg: 0, disp: 0, dispKg: 0 },
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-8" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar código, producto o barcode" />
        </div>
        <p className="ml-auto text-sm text-muted-foreground">
          {visibles.length} referencia(s) · <b className="tabular-nums text-foreground">{tot.unds}</b> und ·{' '}
          <b className="tabular-nums text-foreground">{kg(tot.kg)}</b> kg
        </p>
      </div>
      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="[&>th]:h-10 [&>th]:px-3">
              <th className="w-8" />
              <th>Código</th>
              <th>Producto</th>
              <th className="text-right">Und</th>
              <th className="text-right">Kg</th>
              <th className="text-right">Disponible</th>
              <th>Comprometido</th>
              <th>Vence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.map(({ f, etiquetas, porCodigo }) => {
              const abierto = porCodigo || abiertos.has(f.codigo);
              return (
                <Fragment key={f.codigo}>
                  <tr
                    ref={f.codigo === codigoInicial ? filaInicial : undefined}
                    onClick={() => toggle(f.codigo)}
                    className={cn('h-12 cursor-pointer transition-colors [&>td]:px-3', abierto ? 'bg-primary/5' : 'hover:bg-muted/40')}
                  >
                    <td className="text-muted-foreground">
                      {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </td>
                    <td className="font-semibold tabular-nums text-muted-foreground">{f.codigo}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold uppercase">
                          {f.nombre}
                          {f.congelado && <Snowflake className="ml-1.5 inline size-3.5 text-sky-600" />}
                        </span>
                        <LotesAntiguos etiquetas={f.etiquetas} />
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{f.unds}</td>
                    <td className="text-right font-semibold tabular-nums">{kg(f.kg)}</td>
                    <td className="text-right tabular-nums text-emerald-700">
                      {f.disponibles} <span className="text-xs text-muted-foreground">· {kg(f.disponiblesKg)} kg</span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {f.enProceso > 0 && <Chip className="bg-amber-100 text-amber-800">{f.enProceso} en proceso</Chip>}
                        {f.enDespacho > 0 && <Chip className="bg-sky-100 text-sky-800">{f.enDespacho} en despacho</Chip>}
                        {verTodo && f.transformados > 0 && <Chip className="bg-violet-100 text-violet-800">{f.transformados} transformados</Chip>}
                        {verTodo && f.despachados > 0 && <Chip className="bg-sky-600 text-white">{f.despachados} despachados</Chip>}
                        {!f.enProceso && !f.enDespacho && !(verTodo && (f.transformados || f.despachados)) && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <VenceChip iso={f.vence} />
                        <SemaforoPill estado={semaforoGeneral(f.etiquetas.filter((e) => !productoFuera(e)).map((e) => e.semaforo))} />
                      </div>
                    </td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={8} className="bg-muted/20 p-0">
                        <table className="w-full text-xs">
                          <thead className="text-left uppercase text-muted-foreground">
                            <tr className="[&>th]:px-3 [&>th]:py-1.5">
                              <th className="pl-11">Código de barras</th>
                              <th>Origen</th>
                              <th>Tienda</th>
                              <th className="text-right">Kg</th>
                              <th>Conservación</th>
                              <th>Empaque</th>
                              <th>Vence</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {etiquetas.map((e) => (
                              <tr
                                key={e.id}
                                onClick={() => (e.rpNumber ? setPostaId(e.id) : setEtiquetaId(e.id))}
                                title="Ver trazabilidad"
                                className="cursor-pointer hover:bg-card [&>td]:px-3 [&>td]:py-1.5"
                              >
                                <td className="pl-11 font-mono font-semibold text-primary">{e.codigo ?? '—'}</td>
                                <td className="tabular-nums">
                                  {e.rpNumber
                                    ? `RP${e.rpNumber}`
                                    : e.ocNumber
                                      ? `${formatOC(e.ocNumber)}${e.origenOt ? ` ← ${formatOT(e.origenOt)}` : ''}`
                                      : e.opNumber
                                        ? formatOP(e.opNumber)
                                        : '—'}
                                </td>
                                <td className="uppercase">{e.tiendaCodigo ? `${e.tiendaCodigo} - ${e.tienda}` : e.tienda}</td>
                                <td className="text-right font-semibold tabular-nums">{kg(e.netoKg)}</td>
                                <td className="uppercase">{e.conservacion || '—'}</td>
                                <td className="tabular-nums">{fecha(e.fechaEmpaque)}</td>
                                <td>
                                  <VenceChip iso={e.fechaVencimiento} resaltado />
                                </td>
                                <td>
                                  {e.despachoCerrado ? (
                                    <span className="font-semibold text-sky-800">
                                      DESPACHADO · {formatDC(e.despachoDc!)}
                                      {e.despachoCerradoAt && <span className="ml-1 font-normal text-muted-foreground">{fecha(e.despachoCerradoAt)}</span>}
                                    </span>
                                  ) : e.transformadoOc ? (
                                    <span className="font-semibold text-violet-700">TRANSFORMADO · {formatOC(e.transformadoOc)}</span>
                                  ) : e.despachoDc ? (
                                    <span className="font-semibold text-sky-700">EN DESPACHO · {formatDC(e.despachoDc)}</span>
                                  ) : e.trasladoOt ? (
                                    <span className="font-semibold text-amber-700">EN PROCESO · {formatOT(e.trasladoOt)}</span>
                                  ) : (
                                    <span className="font-semibold text-emerald-700">DISPONIBLE</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted font-semibold tabular-nums">
            <tr className="h-10 [&>td]:px-3">
              <td />
              <td colSpan={2}>TOTAL</td>
              <td className="text-right">{tot.unds}</td>
              <td className="text-right">{kg(tot.kg)}</td>
              <td className="text-right text-emerald-700">
                {tot.disp} <span className="text-xs text-muted-foreground">· {kg(tot.dispKg)} kg</span>
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {etiquetaId && <TrazabilidadEtiquetaDialog id={etiquetaId} onClose={() => setEtiquetaId(null)} />}
      {postaId && <TrazabilidadReciboDialog tipo="posta" id={postaId} onClose={() => setPostaId(null)} />}
    </div>
  );
}

function ProductosPorOrden({ productos }: { productos: Producto[] }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const ordenes = useMemo(() => {
    const m = new Map<string, { key: string; titulo: string; date: string; productos: Producto[] }>();
    for (const p of productos) {
      const [key, titulo] = p.rpNumber
        ? [`rp|${p.rpNumber}`, `Recibo en posta RP${p.rpNumber}`]
        : p.ocNumber
          ? [`oc|${p.ocNumber}`, `Orden de acondicionamiento ${formatOC(p.ocNumber)}`]
          : p.opNumber
            ? [`op|${p.opNumber}`, `Orden de producción ${formatOP(p.opNumber)}`]
            : ['sin', 'Productos sin orden'];
      const o = m.get(key) ?? { key, titulo, date: p.fechaEmpaque, productos: [] };
      o.productos.push(p);
      if (p.fechaEmpaque > o.date) o.date = p.fechaEmpaque;
      m.set(key, o);
    }
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [productos]);
  const toggle = (k: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <ul className="scrollbar-app h-full space-y-2 overflow-auto p-3">
      {ordenes.map((o) => {
        const abierto = abiertos.has(o.key);
        const totalKg = o.productos.reduce((s, p) => s + p.netoKg, 0);
        const libres = o.productos.filter(productoLibre).length;
        return (
          <li key={o.key} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => toggle(o.key)}
              className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', abierto ? 'bg-primary/5' : 'hover:bg-muted/40')}
            >
              {abierto ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold uppercase">{o.titulo}</span>
                <span className="text-xs text-muted-foreground">Último empaque {fecha(o.date)}</span>
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2 text-sm tabular-nums">
                <span>{o.productos.length} etiquetas</span>
                <b>{kg(totalKg)} kg</b>
                <Chip className="bg-emerald-100 text-emerald-800">{libres} disponibles</Chip>
              </span>
            </button>
            {abierto && (
              <div className="border-t border-border p-3">
                {o.key.startsWith('op|') && o.productos[0]?.opNumber != null && <DescargasDesposte opNumber={o.productos[0].opNumber} />}
                <Productos d={{ productos: o.productos }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EstadoCanal({ c }: { c: Canal }) {
  if (c.enOrden?.cerrada) {
    return (
      <span
        title="La orden de despacho se cerró en Canal Fría: la canal salió a desposte"
        className="inline-flex flex-col rounded-md bg-violet-600 px-2 py-0.5 text-xs font-bold tabular-nums text-white"
      >
        <span>PROCESADA · {formatOD(c.enOrden.odNumber)}</span>
        {c.enOrden.opNumbers.length > 0 && <span>{c.enOrden.opNumbers.map(formatOP).join(', ')}</span>}
      </span>
    );
  }
  if (c.enOrden) {
    return (
      <span
        title="Sigue en la cava, pero ya está asignada a esta orden"
        className="inline-flex flex-col rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-900"
      >
        <span>{formatOD(c.enOrden.odNumber)}</span>
        {c.enOrden.opNumbers.length > 0 && <span>{c.enOrden.opNumbers.map(formatOP).join(', ')} · EN PROCESO</span>}
      </span>
    );
  }
  if (c.enDespacho?.cerrada) {
    return (
      <span
        title={`Salió de planta${c.enDespacho.cerradaAt ? ` el ${new Date(c.enDespacho.cerradaAt).toLocaleString('es-CO')}` : ''}`}
        className="inline-flex flex-col rounded-md bg-sky-600 px-2 py-0.5 text-xs font-bold tabular-nums text-white"
      >
        <span>DESPACHADA · {formatDC(c.enDespacho.dcNumber)}</span>
        <span>{c.enDespacho.tipo === 'caliente' ? 'CALIENTE' : 'FRÍO'}</span>
      </span>
    );
  }
  if (c.enDespacho) {
    return (
      <span
        title="Sigue en la cava hasta que se cierre la orden de despacho"
        className="inline-flex flex-col rounded-md border border-sky-400 bg-sky-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-sky-900"
      >
        <span>{formatDC(c.enDespacho.dcNumber)}</span>
        <span>DESPACHO {c.enDespacho.tipo === 'caliente' ? 'CALIENTE' : 'FRÍO'}</span>
      </span>
    );
  }
  return <span className="text-xs font-semibold text-emerald-700">DISPONIBLE</span>;
}

function CanalesTabla({ canales, buscar }: { canales: Canal[]; buscar: string }) {
  const [busqueda, setBusqueda] = useState(buscar);
  const [tipo, setTipo] = useState('');
  const [pieza, setPieza] = useState('');
  const [cava, setCava] = useState('');
  const [estado, setEstado] = useState('');
  const [trazaId, setTrazaId] = useState<string | null>(null);
  const [reciboId, setReciboId] = useState<string | null>(null);

  const tipoDe = (c: Canal) => (c.recibo ? 'RECIBIDA' : c.canalAnimalTipo);
  const tipos = useMemo(
    () => [...new Set(canales.map(tipoDe).filter((t): t is string => !!t))].sort(),
    [canales],
  );
  const cavas = useMemo(
    () => [...new Set(canales.map((c) => c.cava).filter((c): c is string => !!c))].sort(),
    [canales],
  );
  const q = busqueda.replace(/\s/g, '').toUpperCase();
  const filtradas = canales
    .filter(
      (c) =>
        (!q || barcodeDe(c).toUpperCase().includes(q)) &&
        (!tipo || tipoDe(c) === tipo) &&
        (!pieza || c.pieza === pieza) &&
        (!cava || c.cava === cava) &&
        (!estado || estadoCanal(c) === estado),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.reference - b.reference ||
        a.sequence - b.sequence ||
        ORDEN_PIEZA[a.pieza] - ORDEN_PIEZA[b.pieza],
    );
  const totalKg = filtradas.reduce((s, c) => s + c.pesoKg, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-4 px-3 py-2">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 pr-8 uppercase"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar barcode…"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <FiltroSelect label="Tipo" value={tipo} onChange={setTipo} opciones={tipos.map((t) => ({ value: t, label: t.toUpperCase() }))} />
        <FiltroSelect
          label="Pieza"
          value={pieza}
          onChange={setPieza}
          opciones={(Object.keys(PIEZA) as Canal['pieza'][]).map((p) => ({ value: p, label: PIEZA[p] }))}
        />
        <FiltroSelect label="Cava" value={cava} onChange={setCava} opciones={cavas.map((c) => ({ value: c, label: c }))} />
        <FiltroSelect
          label="Estado"
          value={estado}
          onChange={setEstado}
          opciones={[
            { value: 'libre', label: 'Disponible en cava' },
            { value: 'orden', label: 'En orden / proceso' },
            { value: 'despachada', label: 'Despachada' },
            { value: 'procesada', label: 'Procesada' },
          ]}
        />
        <p className="ml-auto text-sm font-semibold tabular-nums text-muted-foreground">
          {filtradas.length} canal(es) · {kg(totalKg)} kg
        </p>
      </div>
      {!filtradas.length ? (
        <Vacio text="No hay canales con estos filtros." />
      ) : (
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:h-10 [&>th]:px-3">
                <th>Orden</th>
                <th>Turno</th>
                <th>Barcode</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Pieza</th>
                <th>Cava</th>
                <th>Estado</th>
                <th>Destino</th>
                <th className="text-right">Caliente (kg)</th>
                <th className="text-right">Frío (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtradas.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => (c.recibo ? setReciboId(c.id) : setTrazaId(c.id))}
                  title={c.recibo ? 'Ver trazabilidad del recibo' : 'Ver trazabilidad de la canal'}
                  className={cn('cursor-pointer hover:bg-muted/50 [&>td]:px-3 [&>td]:py-2', canalDespachada(c) && 'bg-sky-50/60')}
                >
                  <td className="tabular-nums">{c.recibo ? `RC${c.recibo.receiptNumber}` : formatOB(c.reference)}</td>
                  <td className="tabular-nums">{c.turno ?? '—'}</td>
                  <td className="font-mono tabular-nums">{barcodeDe(c) || '—'}</td>
                  <td className="tabular-nums">{fecha(c.date)}</td>
                  <td className="text-xs uppercase">
                    {c.recibo ? (
                      <span className="rounded-md bg-violet-100 px-1.5 py-0.5 font-bold text-violet-800">RECIBIDA</span>
                    ) : (
                      (c.canalAnimalTipo ?? '—')
                    )}
                  </td>
                  <td className="text-xs font-semibold uppercase text-red-600">{PIEZA[c.pieza]}</td>
                  <td className="uppercase">{c.cava ?? '—'}</td>
                  <td>
                    <EstadoCanal c={c} />
                    {!canalDespachada(c) && !canalProcesada(c) && <span className="ml-1"><SemaforoPill estado={c.semaforo} canal /></span>}
                  </td>
                  <td className="whitespace-normal">{c.destino || '—'}</td>
                  <td className="text-right font-semibold tabular-nums">{kg(c.pesoKg)}</td>
                  <td className="text-right tabular-nums">{c.pesoFrioKg == null ? '—' : kg(c.pesoFrioKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {trazaId && <TrazabilidadCanalDialog piezaId={trazaId} onClose={() => setTrazaId(null)} />}
      {reciboId && <TrazabilidadReciboDialog tipo="canal" id={reciboId} onClose={() => setReciboId(null)} />}
    </div>
  );
}

function SubproductosTabla({ items }: { items: Subproducto[] }) {
  // Una fila por producto y cava: suma unidades o kilos, como en la vista por cava.
  const filas = useMemo(() => {
    const m = new Map<
      string,
      {
        codigo: string;
        label: string;
        categoria: CavaSubproductoCategoria;
        unidad: Subproducto['unidad'];
        cava: string | null;
        registros: number;
        unidades: number;
        kg: number;
        ultimo: string | null;
      }
    >();
    for (const it of items) {
      const clave = `${it.tipo}|${it.cava}`;
      const f = m.get(clave) ?? {
        codigo: it.codigo,
        label: it.label,
        categoria: it.categoria,
        unidad: it.unidad,
        cava: it.cava,
        registros: 0,
        unidades: 0,
        kg: 0,
        ultimo: null,
      };
      f.registros += 1;
      f.unidades += it.cantidad ?? 0;
      f.kg += it.pesoKg ?? 0;
      if (it.registradoAt && (!f.ultimo || it.registradoAt > f.ultimo)) f.ultimo = it.registradoAt;
      m.set(clave, f);
    }
    return [...m.values()].sort(
      (a, b) =>
        CATEGORIA[a.categoria].orden - CATEGORIA[b.categoria].orden ||
        a.label.localeCompare(b.label, 'es') ||
        (a.cava ?? '').localeCompare(b.cava ?? ''),
    );
  }, [items]);

  return (
    <div className="scrollbar-app h-full overflow-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr className="[&>th]:h-10 [&>th]:px-3">
            <th>Código</th>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Cava</th>
            <th className="text-right">Cantidad</th>
            <th className="text-right">Peso (kg)</th>
            <th>Último registro</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((f) => (
            <tr key={`${f.codigo}|${f.label}|${f.cava}`} className="[&>td]:px-3 [&>td]:py-2">
              <td className="tabular-nums">{f.codigo || '—'}</td>
              <td className="font-medium uppercase">{f.label}</td>
              <td className="text-xs uppercase text-muted-foreground">{CATEGORIA[f.categoria].label}</td>
              <td className="uppercase">{cavaSubproducto(f.cava)}</td>
              <td className="text-right tabular-nums">{f.unidad === 'unidad' ? `${f.unidades} und` : `${f.registros} reg.`}</td>
              <td className="text-right font-semibold tabular-nums">{f.kg > 0 ? kg(f.kg) : '—'}</td>
              <td className="tabular-nums">
                {f.ultimo
                  ? new Date(f.ultimo).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

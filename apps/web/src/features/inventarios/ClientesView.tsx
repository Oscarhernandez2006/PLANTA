import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Building2,
  ChevronRight,
  ClipboardList,
  Inbox,
  LoaderCircle,
  Search,
  Warehouse,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { formatOB } from '../registrar/orden-beneficio-api';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatOC } from '../registrar/orden-acondicionamiento-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { Caja, Productos, fecha, kg } from './BodegasTab';
import { FiltroSelect } from './FiltroSelect';
import { TrazabilidadCanalDialog } from './TrazabilidadCanalDialog';
import {
  useBodegaInventario,
  useBodegasInventario,
  type BodegaDetalle,
  type BodegaResumen,
  type CavaSubproductoCategoria,
} from './api';

type Canal = BodegaDetalle['canales'][number];
type Producto = BodegaDetalle['productos'][number];
type Subproducto = BodegaDetalle['subproductos'][number];

interface ClienteResumen {
  id: string;
  nombre: string;
  nit: string | null;
  bodegas: BodegaResumen[];
  canales: number;
  canalesKg: number;
  canalesDespachadas: number;
  canalesProcesadas: number;
  productos: number;
  productosKg: number;
  subproductos: number;
}

interface Orden {
  key: string;
  tipo: 'ob' | 'op' | 'oc' | 'sin';
  numero: number | null;
  date: string | null;
  canales: Canal[];
  subproductos: Subproducto[];
  productos: Producto[];
}

const PIEZA: Record<Canal['pieza'], string> = { canal: 'CANAL', cizq: 'CIZQ', cder: 'CDER' };
const ORDEN_PIEZA: Record<Canal['pieza'], number> = { canal: 0, cizq: 1, cder: 2 };

const CATEGORIA: Record<CavaSubproductoCategoria, { label: string; orden: number }> = {
  viscera_roja: { label: 'Vísceras rojas', orden: 0 },
  viscera_blanca: { label: 'Vísceras blancas', orden: 1 },
  retoma: { label: 'Retomas', orden: 2 },
  cabeza_patas: { label: 'Retomas', orden: 2 },
};

const cavaSubproducto = (cava: string | null) =>
  !cava ? '—' : cava === '3' ? 'CAVA SUBPRODUCTO DESPACHO' : `CAVA SUBPRODUCTO ${cava}`;

/** En una orden activa (OD a proceso o DC sin cerrar): sigue en planta pero ya está asignada. */
const canalEnOrden = (c: Canal) =>
  !!((c.enOrden && !c.enOrden.cerrada) || (c.enDespacho && !c.enDespacho.cerrada));
const canalDespachada = (c: Canal) => !!c.enDespacho?.cerrada;
const canalProcesada = (c: Canal) => !!c.enOrden?.cerrada;
const estadoCanal = (c: Canal) =>
  canalDespachada(c)
    ? 'despachada'
    : canalProcesada(c)
      ? 'procesada'
      : canalEnOrden(c)
        ? 'orden'
        : 'libre';
const barcodeDe = (c: Canal) =>
  c.canalTipo
    ? codigoBarras({ lote: c.reference, turno: c.turno ?? c.sequence, canalTipo: c.canalTipo, pieza: c.pieza })
    : '';
const productoLibre = (p: Producto) => !p.despachoDc && !p.transformadoOc && !p.trasladoOt;
const conInventario = (b: BodegaResumen) =>
  b.canales + b.canalesDespachadas + b.canalesProcesadas + b.productos + b.subproductos > 0;

function tituloOrden(o: Orden) {
  if (o.tipo === 'ob') return `Orden de beneficio ${formatOB(o.numero!)}`;
  if (o.tipo === 'op') return `Orden de producción ${formatOP(o.numero!)}`;
  if (o.tipo === 'oc') return `Orden de acondicionamiento ${formatOC(o.numero!)}`;
  return 'Productos sin orden';
}

function agruparOrdenes(d: BodegaDetalle | undefined): Orden[] {
  if (!d) return [];
  const m = new Map<string, Orden>();
  const obtener = (key: string, tipo: Orden['tipo'], numero: number | null, date: string | null) => {
    let o = m.get(key);
    if (!o) {
      o = { key, tipo, numero, date, canales: [], subproductos: [], productos: [] };
      m.set(key, o);
    }
    return o;
  };
  // El consecutivo de la orden de beneficio se repite entre fechas: la clave lleva ambas.
  for (const c of d.canales) obtener(`ob|${c.date}|${c.reference}`, 'ob', c.reference, c.date).canales.push(c);
  for (const s of d.subproductos)
    obtener(`ob|${s.date}|${s.reference}`, 'ob', s.reference, s.date).subproductos.push(s);
  for (const p of d.productos) {
    const o = p.ocNumber
      ? obtener(`oc|${p.ocNumber}`, 'oc', p.ocNumber, null)
      : p.opNumber
        ? obtener(`op|${p.opNumber}`, 'op', p.opNumber, null)
        : obtener('sin', 'sin', null, null);
    o.productos.push(p);
    if (!o.date || p.fechaEmpaque > o.date) o.date = p.fechaEmpaque;
  }
  const prioridad = { ob: 0, op: 1, oc: 2, sin: 3 };
  return [...m.values()].sort(
    (a, b) =>
      prioridad[a.tipo] - prioridad[b.tipo] ||
      (a.date ?? '').localeCompare(b.date ?? '') ||
      (a.numero ?? 0) - (b.numero ?? 0),
  );
}

function Cargando() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" />
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

/** Inventario navegable: cliente → bodega → orden → detalle. */
export function ClientesView() {
  const bodegas = useBodegasInventario();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [bodegaId, setBodegaId] = useState<string | null>(null);
  const [ordenKey, setOrdenKey] = useState<string | null>(null);

  const clientes = useMemo(() => {
    const m = new Map<string, ClienteResumen>();
    for (const b of bodegas.data ?? []) {
      if (!conInventario(b)) continue;
      const c = m.get(b.clienteId) ?? {
        id: b.clienteId,
        nombre: b.cliente,
        nit: b.clienteNit,
        bodegas: [],
        canales: 0,
        canalesKg: 0,
        canalesDespachadas: 0,
        canalesProcesadas: 0,
        productos: 0,
        productosKg: 0,
        subproductos: 0,
      };
      c.bodegas.push(b);
      c.canales += b.canales;
      c.canalesKg += b.canalesKg;
      c.canalesDespachadas += b.canalesDespachadas;
      c.canalesProcesadas += b.canalesProcesadas;
      c.productos += b.productos;
      c.productosKg += b.productosKg;
      c.subproductos += b.subproductos;
      m.set(b.clienteId, c);
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [bodegas.data]);

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const bodega = cliente?.bodegas.find((b) => b.id === bodegaId) ?? null;
  const detalle = useBodegaInventario(bodega?.id ?? null);
  const ordenes = useMemo(() => agruparOrdenes(detalle.data), [detalle.data]);
  const orden = ordenes.find((o) => o.key === ordenKey) ?? null;
  const unaBodega = cliente?.bodegas.length === 1;

  function abrirCliente(c: ClienteResumen) {
    setClienteId(c.id);
    // Con una sola bodega no hay nada que elegir: se pasa directo a sus órdenes.
    setBodegaId(c.bodegas.length === 1 ? c.bodegas[0].id : null);
    setOrdenKey(null);
  }

  const migas: { label: string; onClick?: () => void }[] = [
    {
      label: 'Clientes',
      onClick: () => {
        setClienteId(null);
        setBodegaId(null);
        setOrdenKey(null);
      },
    },
  ];
  if (cliente) {
    migas.push({
      label: cliente.nombre,
      onClick: () => {
        if (!unaBodega) setBodegaId(null);
        setOrdenKey(null);
      },
    });
  }
  if (bodega) migas.push({ label: `Bodega ${bodega.code} - ${bodega.nombre}`, onClick: () => setOrdenKey(null) });
  if (orden) migas.push({ label: tituloOrden(orden) });

  let contenido: ReactNode;
  if (bodegas.isLoading) contenido = <Cargando />;
  else if (!cliente) contenido = <ListaClientes clientes={clientes} onAbrir={abrirCliente} />;
  else if (!bodega)
    contenido = (
      <ListaBodegas
        bodegas={cliente.bodegas}
        onAbrir={(b) => {
          setBodegaId(b.id);
          setOrdenKey(null);
        }}
      />
    );
  else if (!detalle.data) contenido = <Cargando />;
  else if (!orden) contenido = <ListaOrdenes ordenes={ordenes} onAbrir={(o) => setOrdenKey(o.key)} />;
  else contenido = <OrdenDetalle key={orden.key} orden={orden} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex flex-wrap items-center gap-1 border-b-2 border-border px-3 py-2 text-sm">
        {migas.map((m, i) => {
          const ultima = i === migas.length - 1;
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-4 text-muted-foreground" />}
              {ultima || !m.onClick ? (
                <span className="font-semibold uppercase">{m.label}</span>
              ) : (
                <button
                  onClick={m.onClick}
                  className="font-medium uppercase text-emerald-700 hover:underline"
                >
                  {m.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1">{contenido}</div>
    </div>
  );
}

function Fila({
  icon: Icon,
  titulo,
  subtitulo,
  datos,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  titulo: string;
  subtitulo?: string;
  datos: ReactNode[];
  onClick: () => void;
}) {
  return (
    <li className="mb-2">
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-sm border-2 border-border bg-card px-4 py-3 text-left hover:bg-muted/50"
      >
        <Icon className="size-6 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold uppercase">{titulo}</span>
          {subtitulo && <span className="block truncate text-sm text-muted-foreground">{subtitulo}</span>}
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-1 text-sm font-semibold tabular-nums text-muted-foreground">
          {datos.filter(Boolean).map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </span>
        <ChevronRight className="size-5 shrink-0" />
      </button>
    </li>
  );
}

function ListaClientes({
  clientes,
  onAbrir,
}: {
  clientes: ClienteResumen[];
  onAbrir: (c: ClienteResumen) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const q = busqueda.trim().toUpperCase();
  const rows = clientes.filter(
    (c) => !q || c.nombre.toUpperCase().includes(q) || (c.nit ?? '').includes(q),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b-2 border-border px-3 py-2">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 uppercase"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o NIT…"
          />
        </div>
        <p className="ml-auto text-xs text-muted-foreground">{rows.length} cliente(s) con inventario</p>
      </div>
      {!rows.length ? (
        <Vacio text={clientes.length ? 'No hay clientes que coincidan.' : 'Ningún cliente tiene inventario en planta.'} />
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto p-2">
          {rows.map((c) => (
            <Fila
              key={c.id}
              icon={Building2}
              titulo={c.nombre}
              subtitulo={c.nit ? `NIT ${c.nit}` : undefined}
              onClick={() => onAbrir(c)}
              datos={[
                `${c.bodegas.length} bodega(s)`,
                c.canales > 0 && `${c.canales} canal(es) · ${kg(c.canalesKg)} kg`,
                c.canalesDespachadas > 0 && (
                  <span className="text-sky-700">{c.canalesDespachadas} despachada(s)</span>
                ),
                c.canalesProcesadas > 0 && (
                  <span className="text-violet-700">{c.canalesProcesadas} procesada(s)</span>
                ),
                c.subproductos > 0 && `${c.subproductos} subproducto(s)`,
                c.productos > 0 && (
                  <span className="text-emerald-700">
                    {c.productos} producto(s) · {kg(c.productosKg)} kg
                  </span>
                ),
              ]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ListaBodegas({
  bodegas,
  onAbrir,
}: {
  bodegas: BodegaResumen[];
  onAbrir: (b: BodegaResumen) => void;
}) {
  return (
    <ul className="h-full overflow-auto p-2">
      {bodegas.map((b) => (
        <Fila
          key={b.id}
          icon={Warehouse}
          titulo={`${b.code} - ${b.nombre}`}
          onClick={() => onAbrir(b)}
          datos={[
            b.canales > 0 && `${b.canales} canal(es) · ${kg(b.canalesKg)} kg`,
            b.canalesDespachadas > 0 && (
              <span className="text-sky-700">{b.canalesDespachadas} despachada(s)</span>
            ),
            b.canalesProcesadas > 0 && (
              <span className="text-violet-700">{b.canalesProcesadas} procesada(s)</span>
            ),
            b.subproductos > 0 && `${b.subproductos} subproducto(s)`,
            b.productos > 0 && (
              <span className="text-emerald-700">
                {b.productos} producto(s) · {kg(b.productosKg)} kg
              </span>
            ),
          ]}
        />
      ))}
    </ul>
  );
}

function ListaOrdenes({ ordenes, onAbrir }: { ordenes: Orden[]; onAbrir: (o: Orden) => void }) {
  if (!ordenes.length) return <Vacio text="Esta bodega no tiene órdenes con inventario." />;
  return (
    <ul className="h-full overflow-auto p-2">
      {ordenes.map((o) => {
        const enOrden = o.canales.filter(canalEnOrden).length;
        const despachadas = o.canales.filter(canalDespachada).length;
        const procesadas = o.canales.filter(canalProcesada).length;
        const canalesKg = o.canales.reduce((s, c) => s + c.pesoKg, 0);
        const productosKg = o.productos.reduce((s, p) => s + p.netoKg, 0);
        const libres = o.canales.length - enOrden - despachadas - procesadas;
        return (
          <Fila
            key={o.key}
            icon={ClipboardList}
            titulo={tituloOrden(o)}
            subtitulo={o.date ? `Fecha ${fecha(o.date)}` : undefined}
            onClick={() => onAbrir(o)}
            datos={[
              o.canales.length > 0 && `${o.canales.length} canal(es) · ${kg(canalesKg)} kg`,
              libres > 0 && <span className="text-emerald-700">{libres} disponible(s)</span>,
              enOrden > 0 && <span className="text-amber-600">{enOrden} en orden</span>,
              despachadas > 0 && <span className="text-sky-700">{despachadas} despachada(s)</span>,
              procesadas > 0 && <span className="text-violet-700">{procesadas} procesada(s)</span>,
              o.subproductos.length > 0 && `${o.subproductos.length} subproducto(s)`,
              o.productos.length > 0 && (
                <span className="text-emerald-700">
                  {o.productos.length} producto(s) · {kg(productosKg)} kg
                </span>
              ),
            ]}
          />
        );
      })}
    </ul>
  );
}

type TabDetalle = 'canales' | 'subproductos' | 'productos';

function OrdenDetalle({ orden }: { orden: Orden }) {
  const tabs: { key: TabDetalle; label: string; n: number }[] = [
    { key: 'canales' as const, label: 'Canales', n: orden.canales.length },
    { key: 'subproductos' as const, label: 'Subproductos', n: orden.subproductos.length },
    { key: 'productos' as const, label: 'Productos', n: orden.productos.length },
  ].filter((t) => t.n > 0);
  const [tab, setTab] = useState<TabDetalle>(tabs[0]?.key ?? 'canales');
  const activa = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  const canalesKg = orden.canales.reduce((s, c) => s + c.pesoKg, 0);
  const enOrden = orden.canales.filter(canalEnOrden).length;
  const despachadas = orden.canales.filter(canalDespachada).length;
  const procesadas = orden.canales.filter(canalProcesada).length;
  const subKg = orden.subproductos.reduce((s, x) => s + (x.pesoKg ?? 0), 0);
  const subUnidades = orden.subproductos.reduce((s, x) => s + (x.cantidad ?? 0), 0);
  const productosKg = orden.productos.reduce((s, p) => s + p.netoKg, 0);
  const productosLibres = orden.productos.filter(productoLibre).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 gap-2 border-b-2 border-border p-3 sm:grid-cols-4">
        {orden.canales.length > 0 && (
          <>
            <Caja titulo="Canales" valor={String(orden.canales.length)} detalle={`${kg(canalesKg)} kg`} />
            <Caja
              titulo="Disponibles"
              valor={String(orden.canales.length - enOrden - despachadas - procesadas)}
              className="text-emerald-700"
            />
            <Caja titulo="En orden / despacho" valor={String(enOrden)} className="text-amber-600" />
            {despachadas > 0 && (
              <Caja titulo="Despachadas" valor={String(despachadas)} className="text-sky-700" />
            )}
            {procesadas > 0 && (
              <Caja titulo="Procesadas" valor={String(procesadas)} className="text-violet-700" />
            )}
          </>
        )}
        {orden.subproductos.length > 0 && (
          <Caja
            titulo="Subproductos"
            valor={String(orden.subproductos.length)}
            detalle={[subUnidades > 0 && `${subUnidades} und`, subKg > 0 && `${kg(subKg)} kg`].filter(Boolean).join(' · ')}
          />
        )}
        {orden.productos.length > 0 && (
          <>
            <Caja
              titulo="Productos"
              valor={String(orden.productos.length)}
              detalle={`${kg(productosKg)} kg`}
              className="text-emerald-700"
            />
            <Caja titulo="Disponibles" valor={String(productosLibres)} className="text-emerald-700" />
            <Caja
              titulo="En proceso / despacho"
              valor={String(orden.productos.length - productosLibres)}
              className="text-amber-600"
            />
          </>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="flex border-b-2 border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 border-r-2 border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors last:border-r-0',
                activa === t.key
                  ? 'bg-background text-foreground shadow-[inset_0_-3px_0_0] shadow-emerald-600'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label} ({t.n})
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {activa === 'canales' && <CanalesTabla canales={orden.canales} />}
        {activa === 'subproductos' && <SubproductosTabla items={orden.subproductos} />}
        {activa === 'productos' && (
          <div className="h-full overflow-auto p-3">
            <Productos d={{ productos: orden.productos }} />
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoCanal({ c }: { c: Canal }) {
  if (c.enOrden?.cerrada) {
    return (
      <span
        title="La orden de despacho se cerró en Canal Fría: la canal salió a desposte"
        className="inline-flex flex-col rounded-sm bg-violet-600 px-2 py-0.5 text-xs font-bold tabular-nums text-white"
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
        className="inline-flex flex-col rounded-sm border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-900"
      >
        <span>{formatOD(c.enOrden.odNumber)}</span>
        {c.enOrden.opNumbers.length > 0 && (
          <span>{c.enOrden.opNumbers.map(formatOP).join(', ')} · EN PROCESO</span>
        )}
      </span>
    );
  }
  if (c.enDespacho?.cerrada) {
    return (
      <span
        title={`Salió de planta${c.enDespacho.cerradaAt ? ` el ${new Date(c.enDespacho.cerradaAt).toLocaleString('es-CO')}` : ''}`}
        className="inline-flex flex-col rounded-sm bg-sky-600 px-2 py-0.5 text-xs font-bold tabular-nums text-white"
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
        className="inline-flex flex-col rounded-sm border border-sky-400 bg-sky-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-sky-900"
      >
        <span>{formatDC(c.enDespacho.dcNumber)}</span>
        <span>DESPACHO {c.enDespacho.tipo === 'caliente' ? 'CALIENTE' : 'FRÍO'}</span>
      </span>
    );
  }
  return <span className="text-xs font-semibold text-emerald-700">DISPONIBLE</span>;
}

function CanalesTabla({ canales }: { canales: Canal[] }) {
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [pieza, setPieza] = useState('');
  const [cava, setCava] = useState('');
  const [estado, setEstado] = useState('');
  const [trazaId, setTrazaId] = useState<string | null>(null);

  const tipos = useMemo(
    () => [...new Set(canales.map((c) => c.canalAnimalTipo).filter((t): t is string => !!t))].sort(),
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
        (!tipo || c.canalAnimalTipo === tipo) &&
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
      <div className="flex flex-wrap items-center gap-4 border-b-2 border-border px-3 py-2">
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
        <FiltroSelect
          label="Tipo"
          value={tipo}
          onChange={setTipo}
          opciones={tipos.map((t) => ({ value: t, label: t.toUpperCase() }))}
        />
        <FiltroSelect
          label="Pieza"
          value={pieza}
          onChange={setPieza}
          opciones={(Object.keys(PIEZA) as Canal['pieza'][]).map((p) => ({ value: p, label: PIEZA[p] }))}
        />
        <FiltroSelect
          label="Cava"
          value={cava}
          onChange={setCava}
          opciones={cavas.map((c) => ({ value: c, label: c }))}
        />
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
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                <th>Orden</th>
                <th>Turno</th>
                <th>Barcode</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Pieza</th>
                <th>Cava</th>
                <th>Estado</th>
                <th>Destino</th>
                <th>Observación</th>
                <th className="text-right">Caliente (kg)</th>
                <th className="text-right">Frío (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtradas.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setTrazaId(c.id)}
                  title="Ver trazabilidad de la canal"
                  className={cn(
                    'cursor-pointer hover:bg-muted/50 [&>td]:px-3 [&>td]:py-2',
                    canalDespachada(c) && 'bg-sky-50/60',
                  )}
                >
                  <td className="tabular-nums">{formatOB(c.reference)}</td>
                  <td className="tabular-nums">{c.turno ?? '—'}</td>
                  <td className="tabular-nums">{barcodeDe(c) || '—'}</td>
                  <td className="tabular-nums">{c.date}</td>
                  <td className="text-xs uppercase">{c.canalAnimalTipo ?? '—'}</td>
                  <td className="text-xs font-semibold uppercase text-red-600">{PIEZA[c.pieza]}</td>
                  <td className="uppercase">{c.cava ?? '—'}</td>
                  <td>
                    <EstadoCanal c={c} />
                  </td>
                  <td className="whitespace-normal">{c.destino || '—'}</td>
                  <td className="min-w-40 whitespace-normal">{c.observaciones || '—'}</td>
                  <td className="text-right font-semibold tabular-nums">{kg(c.pesoKg)}</td>
                  <td className="text-right tabular-nums">
                    {c.pesoFrioKg == null ? '—' : kg(c.pesoFrioKg)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {trazaId && <TrazabilidadCanalDialog piezaId={trazaId} onClose={() => setTrazaId(null)} />}
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
    <div className="h-full overflow-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-left">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
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
              <td className="text-right tabular-nums">
                {f.unidad === 'unidad' ? `${f.unidades} und` : `${f.registros} reg.`}
              </td>
              <td className="text-right font-semibold tabular-nums">{f.kg > 0 ? kg(f.kg) : '—'}</td>
              <td className="tabular-nums">
                {f.ultimo
                  ? new Date(f.ultimo).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

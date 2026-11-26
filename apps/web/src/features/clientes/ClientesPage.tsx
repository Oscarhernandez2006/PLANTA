import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardList,
  Copy,
  Inbox,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Store,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn, formatFechaDia } from '@/lib/utils';
import { useBodegasInventario, type BodegaResumen } from '../inventarios/api';
import { useProductosCliente } from '../conservacion/api';
import {
  useActualizarBodega,
  useActualizarCliente,
  useActualizarPuntoEnvio,
  useActualizarTienda,
  useCrearPuntoEnvio,
  usePuntosEnvio,
  type PuntoEnvio,
  type PuntoEnvioInput,
  useBodegas,
  useClientesAdmin,
  useCrearBodega,
  useCrearCliente,
  useCrearTienda,
  useNextBodegaCode,
  useNextClienteCode,
  useNextTiendaCode,
  useOrdenesCliente,
  useResumenClientes,
  useTiendas,
  type ClienteCompleto,
  type Bodega,
  type ClienteDatos,
  type ResumenCliente,
  type Tienda,
  type TiendaInput,
} from './api';

function mensajeError(err: unknown, porDefecto: string) {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
}

const kg0 = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
// Sin movimiento en este tiempo, el cliente deja de contar como "con movimiento".
const DIAS_MOVIMIENTO = 90;

/** Nombre comparable para detectar duplicados: sin tildes, signos ni razón social. */
function nombreBase(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(S\.?\s?A\.?\s?S|S\.?\s?A|LTDA|E\.?\s?U|S\.?\s?C\.?\s?S)\.?\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

type Filtro = 'movimiento' | 'todos' | 'inactivos' | 'incompletos' | 'duplicados';
type Pestana = 'datos' | 'bodegas' | 'tiendas' | 'envio' | 'productos' | 'ordenes';

interface Info {
  r: ResumenCliente | undefined;
  stockKg: number;
  faltantes: string[];
  duplicados: ClienteCompleto[];
  movimiento: boolean;
}

export function ClientesPage() {
  const clientes = useClientesAdmin();
  const resumen = useResumenClientes();
  const inventario = useBodegasInventario();
  const rows = clientes.data ?? [];
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('movimiento');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [editando, setEditando] = useState<ClienteCompleto | null>(null);
  const [agregando, setAgregando] = useState(false);

  const stockPorBodega = useMemo(() => new Map((inventario.data ?? []).map((b) => [b.id, b])), [inventario.data]);

  const info = useMemo(() => {
    const porResumen = new Map((resumen.data ?? []).map((r) => [r.clienteId, r]));
    const stock = new Map<string, number>();
    for (const b of inventario.data ?? []) stock.set(b.clienteId, (stock.get(b.clienteId) ?? 0) + b.canalesKg + b.productosKg);
    const porNombre = new Map<string, ClienteCompleto[]>();
    const porNit = new Map<string, ClienteCompleto[]>();
    for (const c of rows) {
      const n = nombreBase(c.concepto);
      porNombre.set(n, [...(porNombre.get(n) ?? []), c]);
      const nit = (c.nit ?? '').replace(/\D/g, '');
      if (nit.length >= 5) porNit.set(nit, [...(porNit.get(nit) ?? []), c]);
    }
    const limite = Date.now() - DIAS_MOVIMIENTO * 86_400_000;
    const m = new Map<string, Info>();
    for (const c of rows) {
      const r = porResumen.get(c.id);
      const faltantes = [
        !c.nit?.trim() && 'NIT',
        !r?.bodegas && 'bodega',
        !c.telefono?.trim() && !c.celular?.trim() && 'teléfono',
      ].filter((x): x is string => !!x);
      const nit = (c.nit ?? '').replace(/\D/g, '');
      const duplicados = [
        ...(porNombre.get(nombreBase(c.concepto)) ?? []),
        ...(nit.length >= 5 ? (porNit.get(nit) ?? []) : []),
      ].filter((x, i, arr) => x.id !== c.id && arr.findIndex((y) => y.id === x.id) === i);
      const stockKg = stock.get(c.id) ?? 0;
      const reciente = !!r?.ultimoMovimiento && new Date(r.ultimoMovimiento).getTime() >= limite;
      m.set(c.id, { r, stockKg, faltantes, duplicados, movimiento: reciente || stockKg > 0 });
    }
    return m;
  }, [rows, resumen.data, inventario.data]);

  const activos = rows.filter((c) => c.active);
  const conteo: Record<Filtro, number> = {
    movimiento: activos.filter((c) => info.get(c.id)?.movimiento).length,
    todos: rows.length,
    inactivos: rows.length - activos.length,
    incompletos: activos.filter((c) => info.get(c.id)?.faltantes.length).length,
    duplicados: rows.filter((c) => info.get(c.id)?.duplicados.length).length,
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = rows.filter((c) => {
    if (q) return c.concepto.toLowerCase().includes(q) || (c.nit ?? '').toLowerCase().includes(q);
    const i = info.get(c.id);
    if (filtro === 'movimiento') return c.active && i?.movimiento;
    if (filtro === 'inactivos') return !c.active;
    if (filtro === 'incompletos') return c.active && !!i?.faltantes.length;
    if (filtro === 'duplicados') return !!i?.duplicados.length;
    return true;
  });
  const cliente = rows.find((c) => c.id === clienteId) ?? visibles[0] ?? null;
  const cargando = clientes.isLoading || resumen.isLoading;

  const FILTROS: { key: Filtro; texto: string }[] = [
    { key: 'movimiento', texto: 'Con movimiento' },
    { key: 'todos', texto: 'Todos' },
    { key: 'incompletos', texto: 'Incompletos' },
    { key: 'duplicados', texto: 'Duplicados' },
    { key: 'inactivos', texto: 'Inactivos' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="size-9 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Datos, bodegas, tiendas, productos y órdenes de cada cliente.</p>
          </div>
        </div>
        <Button size="lg" className="h-11" onClick={() => setAgregando(true)}>
          <Plus className="size-5" />
          Agregar nuevo cliente
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador icon={Users} titulo="Clientes" valor={rows.length} detalle={`${activos.length} activos`} onClick={() => setFiltro('todos')} />
        <Indicador
          icon={ClipboardList}
          titulo="Con movimiento"
          valor={conteo.movimiento}
          detalle={`Órdenes en ${DIAS_MOVIMIENTO} días o inventario`}
          onClick={() => setFiltro('movimiento')}
          activo={filtro === 'movimiento'}
        />
        <Indicador
          icon={AlertTriangle}
          titulo="Datos incompletos"
          valor={conteo.incompletos}
          detalle="Sin NIT, bodega o teléfono"
          alerta={conteo.incompletos > 0}
          onClick={() => setFiltro('incompletos')}
          activo={filtro === 'incompletos'}
        />
        <Indicador
          icon={Copy}
          titulo="Posibles duplicados"
          valor={conteo.duplicados}
          detalle="Mismo NIT o nombre parecido"
          alerta={conteo.duplicados > 0}
          onClick={() => setFiltro('duplicados')}
          activo={filtro === 'duplicados'}
        />
        <Indicador icon={Power} titulo="Inactivos" valor={conteo.inactivos} detalle="Ocultos en las órdenes" onClick={() => setFiltro('inactivos')} activo={filtro === 'inactivos'} />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-10 pl-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar nombre o NIT/C.C…" />
              </div>
              <Button
                variant="outline"
                className="h-10 px-3"
                onClick={() => {
                  void clientes.refetch();
                  void resumen.refetch();
                }}
                disabled={clientes.isFetching}
                title="Refrescar"
              >
                <RefreshCw className={clientes.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFiltro(f.key)}
                  className={cn(
                    'flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                    filtro === f.key && !q ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
                  )}
                >
                  {f.texto}
                  <span className="tabular-nums opacity-80">{conteo[f.key]}</span>
                </button>
              ))}
            </div>
          </div>
          {cargando ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : !visibles.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {q ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes en este filtro.'}
            </p>
          ) : (
            <ul className="scrollbar-app min-h-0 flex-1 space-y-1 overflow-auto p-2">
              {visibles.map((c) => {
                const i = info.get(c.id);
                const sel = cliente?.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setClienteId(c.id)}
                      className={cn(
                        'flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        sel ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-transparent hover:bg-muted/60',
                        !c.active && 'opacity-60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold uppercase">{c.concepto}</div>
                          <div className="text-xs text-muted-foreground">{c.nit ? `NIT ${c.nit}` : 'Sin NIT'}</div>
                        </div>
                        {(!!i?.faltantes.length || !!i?.duplicados.length) && (
                          <AlertTriangle
                            className="size-4 shrink-0 text-amber-500"
                            aria-label={[
                              i?.faltantes.length ? `Falta: ${i.faltantes.join(', ')}` : '',
                              i?.duplicados.length ? 'Posible duplicado' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 text-[11px] font-semibold">
                        <Chip>{i?.r?.bodegas ?? 0} bod.</Chip>
                        <Chip>{i?.r?.productos ?? 0} prod.</Chip>
                        {!!i?.r?.ordenes && <Chip>{i.r.ordenes} órdenes</Chip>}
                        {!!i?.stockKg && <Chip className="bg-primary/10 text-primary">{kg0(i.stockKg)} kg en planta</Chip>}
                        {!c.active && <Chip className="bg-red-100 text-red-700">Inactivo</Chip>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {cliente ? (
          <FichaCliente
            key={cliente.id}
            cliente={cliente}
            info={info.get(cliente.id)}
            stock={stockPorBodega}
            onEditar={() => setEditando(cliente)}
            onElegir={setClienteId}
          />
        ) : (
          <section className="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            Elige un cliente para ver su ficha.
          </section>
        )}
      </div>

      {editando && <ClienteFormDialog cliente={editando} onClose={() => setEditando(null)} />}
      {agregando && <ClienteFormDialog onClose={() => setAgregando(false)} />}
    </div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('rounded-full bg-muted px-2 py-0.5 tabular-nums text-muted-foreground', className)}>{children}</span>;
}

function Indicador({
  icon: Icon,
  titulo,
  valor,
  detalle,
  alerta,
  activo,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  valor: React.ReactNode;
  detalle: string;
  alerta?: boolean;
  activo?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40',
        alerta ? 'border-amber-300 bg-amber-50' : 'border-border',
        activo && 'ring-2 ring-primary/30',
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('size-4', alerta ? 'text-amber-600' : 'text-primary')} />
        {titulo}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', alerta && 'text-amber-800')}>{valor}</div>
      <div className="text-xs text-muted-foreground">{detalle}</div>
    </button>
  );
}

const ESTADO_ORDEN: Record<string, { texto: string; clase: string }> = {
  activo: { texto: 'Activa', clase: 'bg-emerald-100 text-emerald-800' },
  inactivo: { texto: 'Inactiva', clase: 'bg-muted text-muted-foreground' },
  facturado: { texto: 'Cerrada', clase: 'bg-sky-100 text-sky-800' },
};

function FichaCliente({
  cliente,
  info,
  stock,
  onEditar,
  onElegir,
}: {
  cliente: ClienteCompleto;
  info: Info | undefined;
  stock: Map<string, BodegaResumen>;
  onEditar: () => void;
  onElegir: (id: string) => void;
}) {
  const navigate = useNavigate();
  const actualizar = useActualizarCliente();
  const [pestana, setPestana] = useState<Pestana>('datos');
  const r = info?.r;
  const misBodegas = [...stock.values()].filter((b) => b.clienteId === cliente.id);
  const canalesKg = misBodegas.reduce((s, b) => s + b.canalesKg, 0);
  const productosKg = misBodegas.reduce((s, b) => s + b.productosKg, 0);
  const v = (s: string | null) => s || '—';

  const pestanas: { key: Pestana; label: string; n?: number }[] = [
    { key: 'datos', label: 'Datos' },
    { key: 'bodegas', label: 'Bodegas', n: r?.bodegas },
    { key: 'tiendas', label: 'Tiendas', n: r?.tiendas },
    { key: 'envio', label: 'Puntos de envío' },
    { key: 'productos', label: 'Productos', n: r?.productos },
    { key: 'ordenes', label: 'Órdenes', n: r?.ordenes },
  ];

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <Building2 className="size-7 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold uppercase">{cliente.concepto}</h2>
          <p className="text-sm text-muted-foreground">
            Código {cliente.code} · {cliente.nit ? `NIT ${cliente.nit}` : 'Sin NIT'}
            {r?.ultimoMovimiento && ` · último movimiento ${formatFechaDia(r.ultimoMovimiento.slice(0, 10))}`}
          </p>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-xs font-bold uppercase', cliente.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>
          {cliente.active ? 'Activo' : 'Inactivo'}
        </span>
        <Button
          variant="outline"
          className="h-10"
          disabled={actualizar.isPending}
          onClick={() => actualizar.mutate({ id: cliente.id, active: !cliente.active })}
        >
          <Power className="size-4" />
          {cliente.active ? 'Desactivar' : 'Activar'}
        </Button>
        <Button className="h-10" onClick={onEditar}>
          <Pencil className="size-4" />
          Editar datos
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-border p-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {pestanas.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPestana(p.key)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors',
                  pestana === p.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p.label}
                {p.n != null && (
                  <span className={cn('rounded-full px-1.5 text-xs tabular-nums', pestana === p.key ? 'bg-primary text-primary-foreground' : 'bg-background')}>
                    {p.n}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto p-4">
          {pestana === 'datos' && (
            <div className="space-y-5">
              {(!!info?.faltantes.length || !!info?.duplicados.length) && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {!!info?.faltantes.length && (
                    <p className="flex items-center gap-2">
                      <AlertTriangle className="size-4 shrink-0" />
                      Datos incompletos: falta {info.faltantes.join(', ')}.
                      {info.faltantes.includes('bodega') && ' Sin bodega no se pueden cerrar sus recibos.'}
                    </p>
                  )}
                  {!!info?.duplicados.length && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Copy className="size-4 shrink-0" />
                      Posible duplicado de:
                      {info.duplicados.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => onElegir(d.id)}
                          className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-semibold uppercase hover:bg-amber-100"
                        >
                          {d.concepto}
                          {d.nit ? ` · ${d.nit}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Campo label="NIT/CC">{v(cliente.nit)}</Campo>
                <Campo label="Dirección">{v(cliente.direccion)}</Campo>
                <Campo label="Ciudad">{v(cliente.ciudad)}</Campo>
                <Campo label="Teléfono">{v(cliente.telefono)}</Campo>
                <Campo label="Celular">{v(cliente.celular)}</Campo>
                <Campo label="Contacto">{v(cliente.contacto)}</Campo>
                <Campo label="Correo">{v(cliente.correo)}</Campo>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MiniKpi icon={Warehouse} titulo="Bodegas activas" valor={r?.bodegas ?? 0} />
                <MiniKpi icon={Store} titulo="Tiendas activas" valor={r?.tiendas ?? 0} />
                <MiniKpi icon={Boxes} titulo="Canales en planta" valor={`${kg0(canalesKg)} kg`} />
                <MiniKpi icon={Package} titulo="Producto en planta" valor={`${kg0(productosKg)} kg`} />
              </div>
              {canalesKg + productosKg > 0 && (
                <Button variant="outline" className="h-10" onClick={() => navigate('/inventarios')}>
                  <Boxes className="size-4" />
                  Ver inventario del cliente
                </Button>
              )}
            </div>
          )}
          {pestana === 'bodegas' && <BodegasPanel cliente={cliente} stock={stock} />}
          {pestana === 'tiendas' && <TiendasPanel cliente={cliente} />}
          {pestana === 'envio' && <PuntosEnvioPanel cliente={cliente} />}
          {pestana === 'productos' && <ProductosPanel cliente={cliente} />}
          {pestana === 'ordenes' && <OrdenesPanel clienteId={cliente.id} />}
        </div>
      </div>
    </section>
  );
}

function MiniKpi({ icon: Icon, titulo, valor }: { icon: React.ComponentType<{ className?: string }>; titulo: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {titulo}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function ProductosPanel({ cliente }: { cliente: ClienteCompleto }) {
  const navigate = useNavigate();
  const productos = useProductosCliente(cliente.id);
  const lista = productos.data ?? [];
  const sinCaducidad = lista.filter((p) => p.refrigeradoDias === 0).length;
  const congelables = lista.filter((p) => p.congeladoDias > 0).length;
  const conPiezas = lista.filter((p) => p.piezasPorCanal > 1).length;
  if (productos.isLoading)
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi icon={Package} titulo="Configurados" valor={lista.length} />
        <MiniKpi icon={AlertTriangle} titulo="Sin caducidad" valor={sinCaducidad} />
        <MiniKpi icon={Boxes} titulo="Se congelan" valor={congelables} />
        <MiniKpi icon={ClipboardList} titulo="Con piezas por canal" valor={conPiezas} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-10" onClick={() => navigate('/conservacion')}>
          Abrir en Conservación (caducidad y piezas desposte)
        </Button>
      </div>
      {!lista.length ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Este cliente no tiene productos configurados. Configúralos en Conservación (puedes copiarlos de otro cliente).
        </p>
      ) : (
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
              <tr className="[&>th]:h-9 [&>th]:px-3">
                <th>Código</th>
                <th>Producto</th>
                <th>PLU</th>
                <th className="text-center">Refrigerado</th>
                <th className="text-center">Congelado</th>
                <th className="text-center">Piezas / canal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.map((p) => (
                <tr key={p.id} className={cn('h-10 [&>td]:px-3', p.refrigeradoDias === 0 && 'bg-amber-50/60')}>
                  <td className="tabular-nums">{p.codigo}</td>
                  <td className="font-medium uppercase">{p.nombre}</td>
                  <td>{p.refPluSku || '—'}</td>
                  <td className="text-center tabular-nums">{p.refrigeradoDias} d</td>
                  <td className="text-center tabular-nums">{p.congeladoDias ? `${p.congeladoDias} d` : 'No aplica'}</td>
                  <td className="text-center tabular-nums">{p.piezasPorCanal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrdenesPanel({ clienteId }: { clienteId: string }) {
  const ordenes = useOrdenesCliente(clienteId);
  const lista = ordenes.data ?? [];
  if (ordenes.isLoading)
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  if (!lista.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-sm text-muted-foreground">
        <Inbox className="size-7" />
        Este cliente no tiene órdenes.
      </div>
    );
  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr className="[&>th]:h-9 [&>th]:px-3">
            <th>Orden</th>
            <th>Tipo</th>
            <th>Fecha de proceso</th>
            <th>Estado</th>
            <th>Creada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lista.map((o) => (
            <tr key={`${o.tipo}-${o.id}`} className="h-10 [&>td]:px-3">
              <td className="font-bold tabular-nums text-primary">{o.numero}</td>
              <td>
                {o.tipo}
                {o.detalle && <span className="ml-1 text-xs uppercase text-muted-foreground">({o.detalle})</span>}
              </td>
              <td className="tabular-nums">{formatFechaDia(o.processDate)}</td>
              <td>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold uppercase', ESTADO_ORDEN[o.status]?.clase)}>
                  {ESTADO_ORDEN[o.status]?.texto ?? o.status}
                </span>
              </td>
              <td className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bodegas internas del cliente (no son cavas físicas); código consecutivo global. */
function BodegasPanel({
  cliente,
  stock,
}: {
  cliente: ClienteCompleto;
  stock: Map<string, BodegaResumen>;
}) {
  const bodegas = useBodegas(cliente.id);
  const next = useNextBodegaCode();
  const crear = useCrearBodega(cliente.id);
  const actualizar = useActualizarBodega(cliente.id);
  // null = formulario cerrado; 'nueva' = registrando; Bodega = editando.
  const [form, setForm] = useState<Bodega | 'nueva' | null>(null);
  const [nombre, setNombre] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;
  const rows = bodegas.data ?? [];
  const editando = form && form !== 'nueva' ? form : null;

  function abrir(b: Bodega | 'nueva') {
    setForm(b);
    setNombre(b === 'nueva' ? '' : b.nombre);
    setActive(b === 'nueva' ? true : b.active);
    setError(null);
    if (b === 'nueva') void next.refetch();
  }

  function cerrar() {
    setForm(null);
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editando) await actualizar.mutateAsync({ id: editando.id, nombre: nombre.trim(), active });
      else await crear.mutateAsync({ nombre: nombre.trim() });
      cerrar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la bodega.'));
    }
  }

  return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Bodegas internas del software donde queda registrado el producto del cliente.</p>
          <Button className="h-9" onClick={() => abrir('nueva')}>
            <Plus className="size-4" />
            Agregar bodega
          </Button>
        </div>

        {form && (
          <Dialog
            open
            onClose={cerrar}
            title={editando ? 'Editar bodega' : 'Registrar bodega'}
            description={`${cliente.nit ?? 'SIN NIT'} - ${cliente.concepto}`}
            className="max-w-xl"
          >
            <form onSubmit={guardar}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="bodega-code">Código</Label>
                  <Input
                    id="bodega-code"
                    className="h-9 font-semibold tabular-nums"
                    value={editando ? editando.code : (next.data?.next ?? '—')}
                    disabled
                    title="Consecutivo automático: se asigna al guardar."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bodega-nombre">Bodega</Label>
                  <Input
                    id="bodega-nombre"
                    className="h-9 uppercase"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={120}
                    placeholder={cliente.concepto}
                    autoFocus
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-end gap-2 border-t border-border pt-4">
                {editando && (
                  <div className="mr-auto space-y-1.5">
                    <Label htmlFor="bodega-estado">Estado</Label>
                    <Select
                      id="bodega-estado"
                      className="h-9 w-40"
                      value={active ? 'activo' : 'inactivo'}
                      onChange={(e) => setActive(e.target.value === 'activo')}
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </Select>
                  </div>
                )}
                <Button type="button" variant="outline" className="h-9" onClick={cerrar}>
                  <X className="size-4" />
                  Cancelar
                </Button>
                <Button type="submit" className="h-9 px-6" disabled={nombre.trim().length < 2 || guardando}>
                  <Save className="size-4" />
                  {guardando ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
              {error && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </form>
          </Dialog>
        )}

        <div className="overflow-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR>
                <TH className="w-24">Código</TH>
                <TH>Bodega</TH>
                <TH className="w-28">Estado</TH>
                <TH className="text-right">Canales</TH>
                <TH className="text-right">Producto (kg)</TH>
                <TH className="w-24 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {bodegas.isLoading ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                    Este cliente aún no tiene bodegas.
                  </TD>
                </TR>
              ) : (
                rows.map((b) => (
                  <TR key={b.id} className={cn(!b.active && 'text-muted-foreground')}>
                    <TD className="font-medium tabular-nums">{b.code}</TD>
                    <TD>{b.nombre}</TD>
                    <TD className="text-xs font-semibold">{b.active ? 'ACTIVA' : 'INACTIVA'}</TD>
                    <TD className="text-right tabular-nums">
                      {stock.get(b.id)?.canales ? `${stock.get(b.id)!.canales} · ${kg0(stock.get(b.id)!.canalesKg)} kg` : '—'}
                    </TD>
                    <TD className="text-right tabular-nums">{stock.get(b.id)?.productos ? kg0(stock.get(b.id)!.productosKg) : '—'}</TD>
                    <TD>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => abrir(b)}>
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </div>
  );
}

const TIENDA_VACIA: TiendaInput = { nombre: '', direccion: '', ciudad: '' };

/** Tiendas del cliente: lista y registro/edición. El código completo es NIT-código. */
function TiendasPanel({ cliente }: { cliente: ClienteCompleto }) {
  const tiendas = useTiendas(cliente.id);
  const next = useNextTiendaCode(cliente.id);
  const crear = useCrearTienda(cliente.id);
  const actualizar = useActualizarTienda(cliente.id);
  // null = formulario cerrado; 'nueva' = registrando; Tienda = editando.
  const [form, setForm] = useState<Tienda | 'nueva' | null>(null);
  const [valores, setValores] = useState<TiendaInput>(TIENDA_VACIA);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;
  const rows = tiendas.data ?? [];
  const prefijo = cliente.nit ?? String(cliente.code);
  const editando = form && form !== 'nueva' ? form : null;

  function abrir(t: Tienda | 'nueva') {
    setForm(t);
    setValores(
      t === 'nueva'
        ? TIENDA_VACIA
        : { nombre: t.nombre, direccion: t.direccion ?? '', ciudad: t.ciudad ?? '' },
    );
    setActive(t === 'nueva' ? true : t.active);
    setError(null);
    if (t === 'nueva') void next.refetch();
  }

  function cerrar() {
    setForm(null);
    setError(null);
  }

  const set = (k: keyof TiendaInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValores((prev) => ({ ...prev, [k]: e.target.value }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = {
      nombre: valores.nombre.trim(),
      direccion: valores.direccion.trim(),
      ciudad: valores.ciudad.trim(),
    };
    try {
      if (editando) await actualizar.mutateAsync({ id: editando.id, ...datos, active });
      else await crear.mutateAsync(datos);
      cerrar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la tienda.'));
    }
  }

  const v = (s: string | null) => s || 'N/A';

  return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Tiendas o destinos que salen en la etiqueta. Código: NIT-consecutivo.</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9"
              onClick={() => tiendas.refetch()}
              disabled={tiendas.isFetching}
              title="Refrescar"
            >
              <RefreshCw className={tiendas.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              Refrescar
            </Button>
            <Button className="h-9" onClick={() => abrir('nueva')}>
              <Plus className="size-4" />
              Agregar tienda
            </Button>
          </div>
        </div>

        {form && (
          <Dialog
            open
            onClose={cerrar}
            title={editando ? 'Editar tienda' : 'Registrar tienda'}
            description={`${cliente.nit ?? 'SIN NIT'} - ${cliente.concepto}`}
            className="max-w-3xl"
          >
          <form onSubmit={guardar}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tienda-cliente">Cliente</Label>
                <Input id="tienda-cliente" className="h-9" value={cliente.concepto} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tienda-nombre">Tienda</Label>
                <Input
                  id="tienda-nombre"
                  className="h-9 uppercase"
                  value={valores.nombre}
                  onChange={set('nombre')}
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tienda-codigo">Código</Label>
                <Input
                  id="tienda-codigo"
                  className="h-9 font-semibold tabular-nums"
                  value={
                    editando
                      ? `${prefijo}-${editando.codigo}`
                      : next.data
                        ? `${prefijo}-${next.data.next}`
                        : '—'
                  }
                  disabled
                  title="Consecutivo automático: se asigna al guardar."
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="tienda-direccion">Dirección</Label>
                <Input
                  id="tienda-direccion"
                  className="h-9 uppercase"
                  value={valores.direccion}
                  onChange={set('direccion')}
                  maxLength={160}
                  placeholder="N/A"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tienda-ciudad">Ciudad</Label>
                <Input
                  id="tienda-ciudad"
                  className="h-9 uppercase"
                  value={valores.ciudad}
                  onChange={set('ciudad')}
                  maxLength={80}
                  placeholder="N/A"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-end gap-2 border-t border-border pt-4">
              {editando && (
                <div className="mr-auto space-y-1.5">
                  <Label htmlFor="tienda-estado">Estado</Label>
                  <Select
                    id="tienda-estado"
                    className="h-9 w-40"
                    value={active ? 'activo' : 'inactivo'}
                    onChange={(e) => setActive(e.target.value === 'activo')}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </Select>
                </div>
              )}
              <Button type="button" variant="outline" className="h-9" onClick={cerrar}>
                <X className="size-4" />
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-9 px-6"
                disabled={valores.nombre.trim().length < 2 || guardando}
              >
                <Save className="size-4" />
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
            {error && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
          </Dialog>
        )}

        <div className="overflow-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Tienda</TH>
                <TH>Código</TH>
                <TH>Dirección</TH>
                <TH>Ciudad</TH>
                <TH className="w-24 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {tiendas.isLoading ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                    Este cliente aún no tiene tiendas registradas.
                  </TD>
                </TR>
              ) : (
                rows.map((t) => (
                  <TR
                    key={t.id}
                    className={cn(
                      !t.active && 'text-muted-foreground',
                      editando?.id === t.id && 'bg-emerald-50',
                    )}
                  >
                    <TD>{cliente.concepto}</TD>
                    <TD>
                      {t.nombre}
                      {!t.active && <span className="ml-2 text-xs">(inactiva)</span>}
                    </TD>
                    <TD className="tabular-nums">
                      {prefijo}-{t.codigo}
                    </TD>
                    <TD>{v(t.direccion)}</TD>
                    <TD>{v(t.ciudad)}</TD>
                    <TD>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => abrir(t)}>
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </div>
  );
}

const PUNTO_VACIO: PuntoEnvioInput = {
  razonSocial: '',
  nit: '',
  telefono: '',
  direccion: '',
  municipio: '',
  departamento: '',
};

const CAMPOS_PUNTO: { k: keyof PuntoEnvioInput; label: string; max: number; span?: string }[] = [
  { k: 'razonSocial', label: 'Razón social', max: 160, span: 'lg:col-span-2' },
  { k: 'nit', label: 'NIT', max: 30 },
  { k: 'telefono', label: 'Teléfono', max: 40 },
  { k: 'direccion', label: 'Dirección', max: 200, span: 'lg:col-span-2' },
  { k: 'municipio', label: 'Municipio', max: 80 },
  { k: 'departamento', label: 'Departamento', max: 80 },
];

/** Puntos de envío: los clientes de mi cliente, a donde se despacha. Salen en la guía de transporte. */
function PuntosEnvioPanel({ cliente }: { cliente: ClienteCompleto }) {
  const puntos = usePuntosEnvio(cliente.id);
  const crear = useCrearPuntoEnvio(cliente.id);
  const actualizar = useActualizarPuntoEnvio(cliente.id);
  const [form, setForm] = useState<PuntoEnvio | 'nuevo' | null>(null);
  const [valores, setValores] = useState<PuntoEnvioInput>(PUNTO_VACIO);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;
  const rows = puntos.data ?? [];
  const editando = form && form !== 'nuevo' ? form : null;

  function abrir(p: PuntoEnvio | 'nuevo') {
    setForm(p);
    setValores(
      p === 'nuevo'
        ? PUNTO_VACIO
        : {
            razonSocial: p.razonSocial,
            nit: p.nit ?? '',
            telefono: p.telefono ?? '',
            direccion: p.direccion ?? '',
            municipio: p.municipio ?? '',
            departamento: p.departamento ?? '',
          },
    );
    setActive(p === 'nuevo' ? true : p.active);
    setError(null);
  }

  function cerrar() {
    setForm(null);
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = Object.fromEntries(
      Object.entries(valores).map(([k, v]) => [k, v.trim()]),
    ) as unknown as PuntoEnvioInput;
    try {
      if (editando) await actualizar.mutateAsync({ id: editando.id, ...datos, active });
      else await crear.mutateAsync(datos);
      cerrar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el punto de envío.'));
    }
  }

  const v = (s: string | null) => s || 'N/A';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Clientes de este cliente a donde se despacha. Al cerrar una orden de despacho se elige el destino y sus datos salen en la guía de transporte.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9" onClick={() => puntos.refetch()} disabled={puntos.isFetching}>
            <RefreshCw className={puntos.isFetching ? 'size-4 animate-spin' : 'size-4'} />
            Refrescar
          </Button>
          <Button className="h-9" onClick={() => abrir('nuevo')}>
            <Plus className="size-4" />
            Agregar punto de envío
          </Button>
        </div>
      </div>

      {form && (
        <Dialog
          open
          onClose={cerrar}
          title={editando ? 'Editar punto de envío' : 'Registrar punto de envío'}
          description={`${cliente.nit ?? 'SIN NIT'} - ${cliente.concepto}`}
          className="max-w-3xl"
        >
          <form onSubmit={guardar}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAMPOS_PUNTO.map((c, i) => (
                <div key={c.k} className={cn('space-y-1.5', c.span)}>
                  <Label htmlFor={`punto-${c.k}`}>{c.label}</Label>
                  <Input
                    id={`punto-${c.k}`}
                    className="h-9 uppercase"
                    value={valores[c.k]}
                    onChange={(e) => setValores((prev) => ({ ...prev, [c.k]: e.target.value }))}
                    maxLength={c.max}
                    autoFocus={i === 0}
                    placeholder={i === 0 ? '' : 'N/A'}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-end gap-2 border-t border-border pt-4">
              {editando && (
                <div className="mr-auto space-y-1.5">
                  <Label htmlFor="punto-estado">Estado</Label>
                  <Select
                    id="punto-estado"
                    className="h-9 w-40"
                    value={active ? 'activo' : 'inactivo'}
                    onChange={(e) => setActive(e.target.value === 'activo')}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </Select>
                </div>
              )}
              <Button type="button" variant="outline" className="h-9" onClick={cerrar}>
                <X className="size-4" />
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-9 px-6"
                disabled={valores.razonSocial.trim().length < 2 || guardando}
              >
                <Save className="size-4" />
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
            {error && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        </Dialog>
      )}

      <div className="overflow-auto rounded-md border border-border">
        <Table>
          <THead>
            <TR>
              <TH>Razón social</TH>
              <TH>NIT</TH>
              <TH>Teléfono</TH>
              <TH>Dirección</TH>
              <TH>Municipio / Depto.</TH>
              <TH className="w-24 text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {puntos.isLoading ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                  Cargando…
                </TD>
              </TR>
            ) : rows.length === 0 ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                  Este cliente aún no tiene puntos de envío. Si no se configura ninguno, se despacha al mismo cliente.
                </TD>
              </TR>
            ) : (
              rows.map((p) => (
                <TR key={p.id} className={cn(!p.active && 'text-muted-foreground', editando?.id === p.id && 'bg-emerald-50')}>
                  <TD className="font-semibold">
                    {p.razonSocial}
                    {!p.active && <span className="ml-2 text-xs font-normal">(inactivo)</span>}
                  </TD>
                  <TD className="tabular-nums">{v(p.nit)}</TD>
                  <TD className="tabular-nums">{v(p.telefono)}</TD>
                  <TD>{v(p.direccion)}</TD>
                  <TD>
                    {[p.municipio, p.departamento].filter(Boolean).join(' - ') || 'N/A'}
                  </TD>
                  <TD>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => abrir(p)}>
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

/** Celda de la ficha: etiqueta arriba, valor abajo. */
function Campo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="min-h-6 text-sm">{children}</div>
    </div>
  );
}

type CampoTexto = keyof ClienteDatos | 'concepto';

/** Registrar (sin `cliente`) o editar (con `cliente`); el código nunca se edita. */
function ClienteFormDialog({
  cliente,
  onClose,
}: {
  cliente?: ClienteCompleto;
  onClose: () => void;
}) {
  const crear = useCrearCliente();
  const actualizar = useActualizarCliente();
  const next = useNextClienteCode();
  const [valores, setValores] = useState<Record<CampoTexto, string>>({
    concepto: cliente?.concepto ?? '',
    nit: cliente?.nit ?? '',
    direccion: cliente?.direccion ?? '',
    telefono: cliente?.telefono ?? '',
    ciudad: cliente?.ciudad ?? '',
    contacto: cliente?.contacto ?? '',
    correo: cliente?.correo ?? '',
    celular: cliente?.celular ?? '',
  });
  const [active, setActive] = useState(cliente?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;

  const set = (k: CampoTexto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValores((prev) => ({ ...prev, [k]: e.target.value }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = Object.fromEntries(
      Object.entries(valores).map(([k, v]) => [k, v.trim()]),
    ) as Record<CampoTexto, string>;
    try {
      if (cliente) await actualizar.mutateAsync({ id: cliente.id, ...datos, active });
      else await crear.mutateAsync(datos);
      onClose();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el cliente.'));
    }
  }

  const texto = (id: CampoTexto, label: string, className?: string, extra?: string) => (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={`cli-${id}`}>{label}</Label>
      <Input
        id={`cli-${id}`}
        className={cn('h-9', extra)}
        value={valores[id]}
        onChange={set(id)}
        maxLength={id === 'direccion' ? 160 : 120}
        data-keep-case={id === 'correo' || undefined}
      />
    </div>
  );

  return (
    <Dialog open onClose={onClose} title={cliente ? 'Editar cliente' : 'Registrar cliente'}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cli-codigo">Código</Label>
            <Input
              id="cli-codigo"
              className="h-9 font-semibold tabular-nums"
              value={cliente ? cliente.code : (next.data?.next ?? '—')}
              disabled
              title={cliente ? 'El código no se puede modificar.' : 'Consecutivo automático: se asigna al guardar.'}
            />
          </div>
          {texto('nit', 'NIT/CC')}
          {texto('concepto', 'Cliente', 'sm:col-span-2', 'uppercase')}
          {texto('direccion', 'Dirección', 'sm:col-span-2')}
          {texto('telefono', 'Teléfono')}
          {texto('ciudad', 'Ciudad')}
          {texto('contacto', 'Contacto', 'sm:col-span-2')}
          {texto('correo', 'Correo', 'sm:col-span-2')}
          {texto('celular', 'Celular')}
          <div className="space-y-1.5">
            <Label htmlFor="cli-estado">Estado</Label>
            <Select
              id="cli-estado"
              className="h-9"
              value={active ? 'activo' : 'inactivo'}
              onChange={(e) => setActive(e.target.value === 'activo')}
              disabled={!cliente}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </Select>
          </div>
        </div>
        {cliente && valores.concepto.trim().toUpperCase() !== cliente.concepto && (
          <p className="text-xs text-muted-foreground">
            Al cambiar el nombre también se actualiza en sus guías, órdenes de beneficio y
            órdenes de proceso.
          </p>
        )}
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-center border-t border-border pt-4">
          <Button
            type="submit"
            size="lg"
            className="h-9 px-8"
            disabled={valores.concepto.trim().length < 2 || guardando}
          >
            <Save className="size-5" />
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

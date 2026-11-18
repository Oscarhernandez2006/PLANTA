import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  LayoutGrid,
  List,
  LoaderCircle,
  Monitor,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProductosCliente, type ProductoAsignado } from '../conservacion/api';
import { useDevice } from '../device/device-context';
import { formatOD } from '../registrar/orden-despacho-api';
import {
  formatOP,
  useOrdenesProduccionActivas,
  usePreparacion,
  useAvanceRotulado,
  type OrdenProduccion,
} from '../registrar/orden-produccion-api';
import { EmbalajeDesposte } from './EmbalajeDesposte';
import { ReporteDesposte } from './ReporteDesposte';
import { ReimpresionDesposte } from './ReimpresionDesposte';
import { Mensaje } from './ui';

type Tab = 'ordenes' | 'rotular' | 'reporte' | 'reimpresion';

function Cargando() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  );
}

/** Solo se desposta si la orden tiene sus canales repartidas entre tiendas. */
function ConPreparacion({ orden, children }: { orden: OrdenProduccion; children: React.ReactNode }) {
  const prep = usePreparacion(orden.id);
  if (prep.isLoading) return <Cargando />;
  if (!prep.data?.tiendas.length) {
    return (
      <Mensaje
        text={`La orden ${formatOP(orden.opNumber)} no tiene tiendas preparadas; no se puede despostar. Prepárala en Informes → Informe de Producción (clip).`}
      />
    );
  }
  return <>{children}</>;
}

/** Productos de la conservación del cliente. */
type Grupo = 'MATERIA PRIMA' | 'SUBPRODUCTO' | 'TERMINADO';

const GRUPOS: { tipo: Grupo; label: string }[] = [
  { tipo: 'MATERIA PRIMA', label: 'Materias primas' },
  { tipo: 'SUBPRODUCTO', label: 'Subproductos' },
  { tipo: 'TERMINADO', label: 'Terminados' },
];

/** Mayúsculas y sin tildes, para buscar. */
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export function ProductosLista({
  ordenId,
  clienteId,
  seleccionado,
  onSelect,
  grupoInicial = 'MATERIA PRIMA',
  soloProductos,
}: {
  /** Orden de producción para colorear el avance; null = sin avance. */
  ordenId: string | null;
  clienteId: string;
  seleccionado: ProductoAsignado | null;
  onSelect: (p: ProductoAsignado) => void;
  grupoInicial?: Grupo | null;
  /** Si viene, solo se muestran estos productos (acondicionamiento inyectado: los del traslado). */
  soloProductos?: string[];
}) {
  const productos = useProductosCliente(clienteId);
  const equipo = useDevice();
  const miEstacion = equipo.mac ?? equipo.hostname ?? '';
  const avance = new Map((useAvanceRotulado(ordenId).data ?? []).map((a) => [a.productId, a]));
  const keyboard = useKeyboard();
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo] = useState<Grupo | null>(grupoInicial);
  const permitidos = soloProductos ? new Set(soloProductos) : null;

  const q = normalizar(busqueda.trim());
  const rows = (productos.data ?? [])
    .filter((p) => p.active)
    .filter((p) => !permitidos || permitidos.has(p.id))
    .filter((p) => !grupo || p.tipo === grupo)
    .filter(
      (p) =>
        !q ||
        normalizar(p.nombre).includes(q) ||
        p.codigo.includes(q) ||
        normalizar(p.refPluSku ?? '').includes(q),
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  if (productos.isLoading) return <Cargando />;
  if (permitidos && !(productos.data ?? []).some((p) => p.active && permitidos.has(p.id))) {
    return <Mensaje text="El traslado de esta orden no tiene productos para inyectar." />;
  }
  if (!productos.data?.some((p) => p.active)) {
    return <Mensaje text="Este cliente no tiene productos en conservación. Asígnalos en Administrativo → Conservación." />;
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* Buscador + grupos */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <KeyboardField>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onDoubleClick={keyboard.open}
              placeholder="Nombre, código o PLU…"
              className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-base font-medium uppercase outline-none focus:border-primary"
            />
          </KeyboardField>
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {GRUPOS.map((g) => (
            <button
              key={g.tipo}
              onClick={() => setGrupo((actual) => (actual === g.tipo ? null : g.tipo))}
              title={grupo === g.tipo ? 'Tocá de nuevo para ver todos' : undefined}
              className={cn(
                'h-9 flex-1 truncate rounded-md px-2 text-xs font-semibold uppercase transition-colors',
                grupo === g.tipo ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Productos en 2 columnas */}
      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        {!rows.length ? (
          <Mensaje
            text={
              q
                ? 'Ningún producto coincide con la búsqueda.'
                : 'No hay productos de este grupo para el cliente.'
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
            {rows.map((p) => {
              const a = avance.get(p.id);
              const otras = a?.estaciones.filter((e) => e.estacionId !== miEstacion) ?? [];
              const enProceso = !!a && !a.completo && (a.iniciado || a.estaciones.length > 0);
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  title={`${p.codigo} · ${p.tipo}${a?.completo ? ' · completo en todas las tiendas' : ''}`}
                  className={cn(
                    'relative flex min-h-12 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left text-sm font-semibold uppercase transition-all active:scale-[0.98]',
                    seleccionado?.id === p.id
                      ? 'border-primary bg-primary text-primary-foreground shadow-md'
                      : a?.completo
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : otras.length
                          ? 'border-orange-300 bg-orange-50'
                          : enProceso
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span>{p.nombre}</span>
                    {a?.completo && <Check className="size-4 shrink-0" />}
                  </span>
                  <span className={cn('text-xs font-normal tabular-nums', seleccionado?.id === p.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {p.codigo}
                  </span>
                  {(otras.length > 0 || (enProceso && a?.tiendaActual)) && (
                    <span className="mt-1 flex w-full flex-wrap items-center gap-x-2 text-[11px] font-semibold normal-case leading-tight">
                      {a?.tiendaActual && !a.completo && (
                        <span className="text-amber-800">Va por: {a.tiendaActual.nombre}</span>
                      )}
                      {otras.map((e) => (
                        <span key={e.estacionId} className="flex items-center gap-1 text-orange-700">
                          <Monitor className="size-3" />
                          {e.estacion}
                          {e.usuario && ` · ${e.usuario.split(' ')[0]}`}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const VISTA_KEY = 'rotuladoDesposte.vistaOrdenes';

/** Lista de órdenes de producción (lista o tarjetas). */
export function OrdenesProduccionLista({
  ordenes,
  loading,
  refrescando,
  onRefresh,
  seleccionadaId,
  onSelect,
  extra,
}: {
  ordenes: OrdenProduccion[];
  loading: boolean;
  refrescando: boolean;
  onRefresh: () => void;
  seleccionadaId: string | null;
  onSelect: (o: OrdenProduccion) => void;
  /** Botones adicionales en la barra (p. ej. Reimpresión). */
  extra?: React.ReactNode;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'lista' | 'tarjetas'>(() =>
    localStorage.getItem(VISTA_KEY) === 'tarjetas' ? 'tarjetas' : 'lista',
  );
  function cambiarVista(v: 'lista' | 'tarjetas') {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }
  const q = normalizar(busqueda.trim());
  const visibles = q
    ? ordenes.filter((o) =>
        normalizar(
          [formatOP(o.opNumber), o.cliente.concepto, o.cliente.nit ?? '', formatOD(o.dispatchOrder.odNumber)].join(' '),
        ).includes(q),
      )
    : ordenes;
  const fecha = (o: OrdenProduccion) => o.processDate.slice(0, 10).split('-').reverse().join('/');

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar OP, cliente u OD"
            className="h-11 pl-10 text-base"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {visibles.length} {visibles.length === 1 ? 'orden activa' : 'órdenes activas'}
        </span>
        {extra}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => cambiarVista('lista')}
            title="Ver en lista"
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'lista' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <List className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => cambiarVista('tarjetas')}
            title="Ver en tarjetas"
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'tarjetas' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <LayoutGrid className="size-5" />
          </button>
        </div>
        <Button variant="outline" className="size-11 p-0" onClick={onRefresh} disabled={refrescando} title="Actualizar">
          <RefreshCw className={cn('size-5', refrescando && 'animate-spin')} />
        </Button>
      </div>

      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        {loading ? (
          <Cargando />
        ) : !visibles.length ? (
          <div className="rounded-xl border border-dashed border-border">
            <Mensaje
              text={
                q
                  ? 'Ninguna orden coincide con la búsqueda.'
                  : 'No hay órdenes de producción activas. Créalas en Administrativo → Órdenes de Producción.'
              }
            />
          </div>
        ) : vista === 'lista' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-4">
                  <th className="w-28">Orden</th>
                  <th>Cliente</th>
                  <th>Despacho</th>
                  <th>Proceso</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => onSelect(o)}
                    className={cn('h-16 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:px-4', o.id === seleccionadaId && 'bg-primary/5')}
                  >
                    <td>
                      <span className="text-lg font-bold tabular-nums text-primary">{formatOP(o.opNumber)}</span>
                    </td>
                    <td className="max-w-96">
                      <div className="truncate text-base font-semibold uppercase">{o.cliente.concepto}</div>
                      {o.cliente.nit && <div className="text-xs text-muted-foreground">NIT {o.cliente.nit}</div>}
                    </td>
                    <td className="text-base font-semibold tabular-nums">{formatOD(o.dispatchOrder.odNumber)}</td>
                    <td className="tabular-nums">{fecha(o)}</td>
                    <td className="text-muted-foreground">
                      <ChevronRight className="size-5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {visibles.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => onSelect(o)}
                  className={cn(
                    'group flex w-full items-center gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md',
                    o.id === seleccionadaId ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                  )}
                >
                  <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">
                    {formatOP(o.opNumber)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold uppercase">{o.cliente.concepto}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatOD(o.dispatchOrder.odNumber)} · Proceso {fecha(o)}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-primary-foreground group-hover:bg-primary/90">
                    Abrir
                    <ChevronRight className="size-5" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function RotuladoDespostePage() {
  const [tab, setTab] = useState<Tab>('ordenes');
  const [orden, setOrden] = useState<OrdenProduccion | null>(null);
  const [producto, setProducto] = useState<ProductoAsignado | null>(null);
  const ordenes = useOrdenesProduccionActivas();
  const prefijo = orden?.cliente.nit ?? '';

  function elegirOrden(o: OrdenProduccion) {
    if (o.id !== orden?.id) setProducto(null);
    setOrden(o);
    setTab('rotular');
  }

  if (tab === 'ordenes') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <OrdenesProduccionLista
          ordenes={ordenes.data ?? []}
          loading={ordenes.isLoading}
          refrescando={ordenes.isFetching}
          onRefresh={() => void ordenes.refetch()}
          seleccionadaId={orden?.id ?? null}
          onSelect={elegirOrden}
          extra={
            <Button variant="outline" className="h-11" onClick={() => setTab('reimpresion')}>
              <Printer className="size-4" />
              Reimpresión
            </Button>
          }
        />
      </div>
    );
  }

  const vistas: { key: Tab; label: string; requiereOrden: boolean }[] = [
    { key: 'rotular', label: 'Rotular', requiereOrden: true },
    { key: 'reporte', label: 'Reporte', requiereOrden: true },
    { key: 'reimpresion', label: 'Reimpresión', requiereOrden: false },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Encabezado */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setTab('ordenes')}>
          <ArrowLeft className="size-5" />
          Órdenes
        </Button>
        {orden ? (
          <>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">
              {formatOP(orden.opNumber)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold uppercase">{orden.cliente.concepto}</div>
              <div className="text-sm text-muted-foreground">
                {formatOD(orden.dispatchOrder.odNumber)} · Proceso{' '}
                {orden.processDate.slice(0, 10).split('-').reverse().join('/')}
                {producto && tab === 'rotular' && (
                  <>
                    {' · '}
                    <b className="text-foreground">{producto.nombre}</b>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1 text-lg font-semibold">Reimpresión de etiquetas</div>
        )}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {vistas
            .filter((v) => !v.requiereOrden || orden)
            .map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setTab(v.key)}
                className={cn(
                  'flex h-10 items-center rounded-md px-4 text-sm font-semibold transition-colors',
                  tab === v.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.label}
              </button>
            ))}
        </div>
      </div>

      {tab === 'reimpresion' ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
          <ReimpresionDesposte />
        </div>
      ) : !orden ? (
        <Mensaje text="Selecciona una orden." />
      ) : tab === 'rotular' ? (
        <ConPreparacion orden={orden}>
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <ProductosLista
                ordenId={orden.id}
                clienteId={orden.cliente.id}
                seleccionado={producto}
                onSelect={setProducto}
              />
            </div>
            <div className="min-h-0">
              {producto ? (
                <EmbalajeDesposte
                  key={`${orden.id}:${producto.id}`}
                  orden={orden}
                  producto={producto}
                  prefijo={prefijo}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border">
                  <Mensaje text="Elegí un producto de la lista para empezar a rotular." />
                </div>
              )}
            </div>
          </div>
        </ConPreparacion>
      ) : (
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <ReporteDesposte
            orden={orden}
            prefijo={prefijo}
            onCerrada={() => {
              setOrden(null);
              setProducto(null);
              setTab('ordenes');
            }}
          />
        </div>
      )}
    </div>
  );
}

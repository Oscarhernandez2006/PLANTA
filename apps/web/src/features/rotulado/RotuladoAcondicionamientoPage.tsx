import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, LayoutGrid, List, LoaderCircle, Printer, RefreshCw, Search, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTiendas, type Tienda } from '../clientes/api';
import type { ProductoAsignado } from '../conservacion/api';
import { formatOT } from '../registrar/orden-traslado-api';
import {
  formatOC,
  useOrdenesAcondicionamientoActivas,
  useResumenAcondicionamiento,
  type OrdenAcondicionamiento,
} from '../registrar/orden-acondicionamiento-api';
import { EmbalajeAcondicionamiento } from './EmbalajeAcondicionamiento';
import { ReimpresionAcondicionamiento } from './ReimpresionAcondicionamiento';
import { ReporteAcondicionamiento } from './ReporteAcondicionamiento';
import { ProductosLista } from './RotuladoDespostePage';
import { Mensaje } from './ui';

type Tab = 'ordenes' | 'rotular' | 'reporte' | 'reimpresion';

const VISTA_KEY = 'rotuladoAcond.vistaOrdenes';
const fechaDe = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

function Cargando() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  );
}

function ProcesoChip({ proceso }: { proceso: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-bold uppercase',
        proceso === 'inyectado' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800',
      )}
    >
      {proceso}
    </span>
  );
}

/** Tiendas del cliente como fichas táctiles; si solo hay una, queda elegida. */
function TiendasSelector({
  orden,
  seleccionada,
  onSelect,
}: {
  orden: OrdenAcondicionamiento;
  seleccionada: Tienda | null;
  onSelect: (t: Tienda) => void;
}) {
  const tiendas = useTiendas(orden.cliente.id);
  const activas = (tiendas.data ?? [])
    .filter((t) => t.active)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const unica = activas.length === 1 ? activas[0] : null;
  useEffect(() => {
    if (unica && seleccionada?.id !== unica.id) onSelect(unica);
  }, [unica, seleccionada, onSelect]);

  if (tiendas.isLoading) return <LoaderCircle className="mx-auto my-3 size-5 animate-spin text-muted-foreground" />;
  if (!activas.length) {
    return <p className="p-3 text-sm text-muted-foreground">El cliente no tiene tiendas activas (Administrativo → Clientes → Tiendas).</p>;
  }
  const prefijo = orden.cliente.nit ?? '';
  return (
    <div className="space-y-1.5 border-b border-border p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tienda</span>
      <div className="scrollbar-app flex max-h-32 flex-col gap-1 overflow-auto">
        {activas.map((t) => {
          const sel = seleccionada?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              className={cn(
                'flex h-10 items-center gap-2 rounded-lg border px-3 text-left text-sm font-semibold uppercase transition-colors',
                sel ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40',
              )}
            >
              {sel ? <Check className="size-4 shrink-0" /> : <Store className="size-4 shrink-0 text-muted-foreground" />}
              <span className="tabular-nums">{prefijo ? `${prefijo}-${t.codigo}` : t.codigo}</span>
              <span className="truncate">{t.nombre}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OrdenesAcondLista({
  ordenes,
  loading,
  refrescando,
  onRefresh,
  seleccionadaId,
  onSelect,
  onReimpresion,
}: {
  ordenes: OrdenAcondicionamiento[];
  loading: boolean;
  refrescando: boolean;
  onRefresh: () => void;
  seleccionadaId: string | null;
  onSelect: (o: OrdenAcondicionamiento) => void;
  onReimpresion: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'lista' | 'tarjetas'>(() => (localStorage.getItem(VISTA_KEY) === 'tarjetas' ? 'tarjetas' : 'lista'));
  function cambiarVista(v: 'lista' | 'tarjetas') {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }
  const q = normalizar(busqueda.trim());
  const visibles = q
    ? ordenes.filter((o) =>
        normalizar([formatOC(o.ocNumber), o.cliente.concepto, o.cliente.nit ?? '', formatOT(o.transferOrder.otNumber), o.proceso].join(' ')).includes(q),
      )
    : ordenes;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar OC, cliente, OT o proceso" className="h-11 pl-10 text-base" />
        </div>
        <span className="text-sm text-muted-foreground">
          {visibles.length} {visibles.length === 1 ? 'orden activa' : 'órdenes activas'}
        </span>
        <Button variant="outline" className="h-11" onClick={onReimpresion}>
          <Printer className="size-4" />
          Reimpresión
        </Button>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ['lista', List, 'Ver en lista'],
              ['tarjetas', LayoutGrid, 'Ver en tarjetas'],
            ] as const
          ).map(([v, Icon, t]) => (
            <button
              key={v}
              type="button"
              onClick={() => cambiarVista(v)}
              title={t}
              className={cn('flex size-9 items-center justify-center rounded-md', vista === v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className="size-5" />
            </button>
          ))}
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
                  : 'No hay órdenes de acondicionamiento activas. Créalas en Administrativo → Órdenes de Acondicionamiento.'
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
                  <th>Traslado</th>
                  <th>Proceso</th>
                  <th>Fecha</th>
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
                      <span className="text-lg font-bold tabular-nums text-primary">{formatOC(o.ocNumber)}</span>
                    </td>
                    <td className="max-w-96">
                      <div className="truncate text-base font-semibold uppercase">{o.cliente.concepto}</div>
                      {o.cliente.nit && <div className="text-xs text-muted-foreground">NIT {o.cliente.nit}</div>}
                    </td>
                    <td className="text-base font-semibold tabular-nums">{formatOT(o.transferOrder.otNumber)}</td>
                    <td>
                      <ProcesoChip proceso={o.proceso} />
                    </td>
                    <td className="tabular-nums">{fechaDe(o.processDate)}</td>
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
                  <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">{formatOC(o.ocNumber)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold uppercase">{o.cliente.concepto}</div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {formatOT(o.transferOrder.otNumber)} · Proceso {fechaDe(o.processDate)}
                      <ProcesoChip proceso={o.proceso} />
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

export function RotuladoAcondicionamientoPage() {
  const [tab, setTab] = useState<Tab>('ordenes');
  const [orden, setOrden] = useState<OrdenAcondicionamiento | null>(null);
  const [tienda, setTienda] = useState<Tienda | null>(null);
  const [producto, setProducto] = useState<ProductoAsignado | null>(null);
  const ordenes = useOrdenesAcondicionamientoActivas();
  // Para Inyectado: productos del traslado, para no elegir de todo el catálogo.
  const resumen = useResumenAcondicionamiento(orden?.id ?? '');
  const productosInyectado = orden?.proceso === 'inyectado' ? (resumen.data?.recibido ?? []).map((r) => r.productId) : undefined;

  function elegirOrden(o: OrdenAcondicionamiento) {
    if (o.id !== orden?.id) {
      setTienda(null);
      setProducto(null);
    }
    setOrden(o);
    setTab('rotular');
  }

  if (tab === 'ordenes') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <OrdenesAcondLista
          ordenes={ordenes.data ?? []}
          loading={ordenes.isLoading}
          refrescando={ordenes.isFetching}
          onRefresh={() => void ordenes.refetch()}
          seleccionadaId={orden?.id ?? null}
          onSelect={elegirOrden}
          onReimpresion={() => setTab('reimpresion')}
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
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setTab('ordenes')}>
          <ArrowLeft className="size-5" />
          Órdenes
        </Button>
        {orden ? (
          <>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">{formatOC(orden.ocNumber)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold uppercase">{orden.cliente.concepto}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {formatOT(orden.transferOrder.otNumber)} · Proceso {fechaDe(orden.processDate)}
                <ProcesoChip proceso={orden.proceso} />
                {producto && tab === 'rotular' && <b className="text-foreground">{producto.nombre}</b>}
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
          <ReimpresionAcondicionamiento />
        </div>
      ) : !orden ? (
        <Mensaje text="Selecciona una orden." />
      ) : tab === 'rotular' ? (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <TiendasSelector orden={orden} seleccionada={tienda} onSelect={setTienda} />
            <div className="min-h-0 flex-1">
              <ProductosLista
                ordenId={null}
                clienteId={orden.cliente.id}
                seleccionado={producto}
                grupoInicial={null}
                soloProductos={productosInyectado}
                onSelect={setProducto}
              />
            </div>
          </div>
          <div className="min-h-0">
            {tienda && producto ? (
              <EmbalajeAcondicionamiento key={`${orden.id}:${tienda.id}:${producto.id}`} orden={orden} tienda={tienda} producto={producto} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border">
                <Mensaje text={!tienda ? 'Elegí la tienda para empezar a rotular.' : 'Elegí un producto de la lista para empezar a rotular.'} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <ReporteAcondicionamiento
            orden={orden}
            onCerrada={() => {
              setOrden(null);
              setTienda(null);
              setProducto(null);
              setTab('ordenes');
            }}
          />
        </div>
      )}
    </div>
  );
}

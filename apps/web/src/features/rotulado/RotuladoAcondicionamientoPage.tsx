import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, Store } from 'lucide-react';
import { RotuladoAcondicionamientoIcon } from '@/components/icons/RotuladoAcondicionamientoIcon';
import { cn, plantToday as today } from '@/lib/utils';
import { useTiendas, type Tienda } from '../clientes/api';
import type { ProductoAsignado } from '../conservacion/api';
import { formatOT } from '../registrar/orden-traslado-api';
import {
  formatOC,
  useOrdenesAcondicionamientoActivas,
  type OrdenAcondicionamiento,
} from '../registrar/orden-acondicionamiento-api';
import { EmbalajeAcondicionamiento } from './EmbalajeAcondicionamiento';
import { ReimpresionAcondicionamiento } from './ReimpresionAcondicionamiento';
import { ReporteAcondicionamiento } from './ReporteAcondicionamiento';
import { ProductosLista } from './RotuladoDespostePage';
import { FieldBox, Mensaje } from './ui';

type Tab = 'ordenes' | 'tiendas' | 'productos' | 'rotulado' | 'reporte' | 'reimpresion';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'Órdenes' },
  { key: 'tiendas', label: 'Tiendas' },
  { key: 'productos', label: 'Productos' },
  { key: 'rotulado', label: 'Rotulado' },
  { key: 'reporte', label: 'Reporte' },
  { key: 'reimpresion', label: 'Reimpresión' },
];

const filaClase = (activa: boolean) =>
  cn(
    'w-full rounded-sm border-2 px-4 py-3 text-left text-lg font-medium transition-colors',
    activa ? 'border-sky-600 bg-sky-100' : 'border-border bg-card hover:bg-muted/50',
  );

function Cargando() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  );
}

function TiendasLista({
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
  if (tiendas.isLoading) return <Cargando />;
  if (!activas.length) {
    return <Mensaje text="El cliente no tiene tiendas activas. Créalas en Administrativo → Clientes → Tiendas." />;
  }
  const prefijo = orden.cliente.nit ?? '';
  return (
    <ul className="flex flex-col gap-2 p-2">
      {activas.map((t) => (
        <li key={t.id}>
          <button onClick={() => onSelect(t)} className={filaClase(seleccionada?.id === t.id)}>
            <Store className="mr-2 inline size-5 text-muted-foreground" />
            <span className="font-bold tabular-nums">{prefijo ? `${prefijo}-${t.codigo}` : t.codigo}</span>
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="uppercase">{t.nombre}</span>
            {t.ciudad && <span className="ml-3 text-sm font-normal text-muted-foreground">{t.ciudad}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RotuladoAcondicionamientoPage() {
  const fecha = today();
  const [tab, setTab] = useState<Tab>('ordenes');
  const [orden, setOrden] = useState<OrdenAcondicionamiento | null>(null);
  const [tienda, setTienda] = useState<Tienda | null>(null);
  const [producto, setProducto] = useState<ProductoAsignado | null>(null);
  const ordenes = useOrdenesAcondicionamientoActivas();
  const scrollRef = useRef<HTMLDivElement>(null);
  const propioScroll =
    (tab === 'productos' && !!orden) ||
    (tab === 'rotulado' && !!tienda && !!producto) ||
    (tab === 'reporte' && !!orden) ||
    tab === 'reimpresion';

  function irA(t: Tab) {
    setTab(t);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function elegirOrden(o: OrdenAcondicionamiento) {
    if (o.id !== orden?.id) {
      setTienda(null);
      setProducto(null);
    }
    setOrden(o);
    irA('tiendas');
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col gap-2 p-2">
      <div className="flex items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <RotuladoAcondicionamientoIcon className="size-10 text-foreground" />
        </div>
        <FieldBox label="Fecha:" className="w-56">
          <div className="flex h-9 items-center text-xl font-medium tabular-nums">
            {fecha.split('-').reverse().join('/')}
          </div>
        </FieldBox>
        <FieldBox label="Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {orden ? `${orden.cliente.nit ? `${orden.cliente.nit} - ` : ''}${orden.cliente.concepto}` : ''}
          </div>
        </FieldBox>
      </div>

      <div className="flex overflow-hidden rounded-sm border-2 border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => irA(t.key)}
            className={cn(
              'flex-1 border-r-2 border-border px-3 py-3 text-center text-sm font-semibold uppercase tracking-wide transition-colors last:border-r-0',
              tab === t.key
                ? 'bg-background text-foreground shadow-[inset_0_-3px_0_0] shadow-emerald-600'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1 rounded-sm border-2 border-border bg-card',
          propioScroll ? 'overflow-hidden' : 'overflow-auto',
        )}
      >
        {tab === 'ordenes' ? (
          ordenes.isLoading ? (
            <Cargando />
          ) : !ordenes.data?.length ? (
            <Mensaje text="No hay órdenes de acondicionamiento activas. Créalas en Administrativo → Órdenes de Acondicionamiento." />
          ) : (
            <ul className="flex flex-col gap-2 p-2">
              {ordenes.data.map((o) => (
                <li key={o.id}>
                  <button onClick={() => elegirOrden(o)} className={filaClase(orden?.id === o.id)}>
                    <span className="font-bold tabular-nums">{formatOC(o.ocNumber)}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    {o.cliente.nit ? `${o.cliente.nit} - ` : ''}
                    {o.cliente.concepto}
                    <span className="mx-2 text-muted-foreground">|</span>
                    <span className="tabular-nums">{formatOT(o.transferOrder.otNumber)}</span>
                    <span className="ml-3 text-sm font-normal text-muted-foreground">
                      Proceso: {o.processDate.slice(0, 10).split('-').reverse().join('/')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'reimpresion' ? (
          <ReimpresionAcondicionamiento />
        ) : !orden ? (
          <Mensaje text="Selecciona una orden en la pestaña ÓRDENES." />
        ) : tab === 'tiendas' ? (
          <TiendasLista
            orden={orden}
            seleccionada={tienda}
            onSelect={(t) => {
              setTienda(t);
              irA('productos');
            }}
          />
        ) : tab === 'productos' ? (
          <ProductosLista
            ordenId={null}
            clienteId={orden.cliente.id}
            seleccionado={producto}
            grupoInicial={null}
            onSelect={(p) => {
              setProducto(p);
              irA(tienda ? 'rotulado' : 'tiendas');
            }}
          />
        ) : tab === 'rotulado' ? (
          !tienda ? (
            <Mensaje text="Selecciona una tienda en la pestaña TIENDAS." />
          ) : !producto ? (
            <Mensaje text="Selecciona un producto en la pestaña PRODUCTOS." />
          ) : (
            <EmbalajeAcondicionamiento
              key={`${orden.id}:${tienda.id}:${producto.id}`}
              orden={orden}
              tienda={tienda}
              producto={producto}
            />
          )
        ) : (
          <ReporteAcondicionamiento
            orden={orden}
            onCerrada={() => {
              setOrden(null);
              setTienda(null);
              setProducto(null);
              irA('ordenes');
            }}
          />
        )}
      </div>

      <div className={cn('grid grid-cols-2 gap-2', propioScroll && 'hidden')}>
        <button
          onClick={() => scrollList(-1)}
          className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
          aria-label="Subir"
        >
          <ChevronUp className="size-7" />
        </button>
        <button
          onClick={() => scrollList(1)}
          className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
          aria-label="Bajar"
        >
          <ChevronDown className="size-7" />
        </button>
      </div>
    </div>
  );
}

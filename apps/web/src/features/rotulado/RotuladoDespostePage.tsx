import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, Monitor, X } from 'lucide-react';
import { RotuladoDesposteIcon } from '@/components/icons/RotuladoDesposteIcon';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn, plantToday as today } from '@/lib/utils';
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
import { FieldBox, Mensaje } from './ui';

type Tab = 'ordenes' | 'productos' | 'embalaje' | 'reporte' | 'reimpresion';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'Órdenes' },
  { key: 'productos', label: 'Productos' },
  { key: 'embalaje', label: 'Embalaje' },
  { key: 'reporte', label: 'Reporte' },
  { key: 'reimpresion', label: 'Reimpresión' },
];

function Cargando() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  );
}

const filaClase = (activa: boolean) =>
  cn(
    'w-full rounded-sm border-2 px-4 py-3 text-left text-lg font-medium transition-colors',
    activa ? 'border-sky-600 bg-sky-100' : 'border-border bg-card hover:bg-muted/50',
  );

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
function ProductosLista({
  ordenId,
  clienteId,
  seleccionado,
  onSelect,
}: {
  ordenId: string;
  clienteId: string;
  seleccionado: ProductoAsignado | null;
  onSelect: (p: ProductoAsignado) => void;
}) {
  const productos = useProductosCliente(clienteId);
  const equipo = useDevice();
  const miEstacion = equipo.mac ?? equipo.hostname ?? '';
  const avance = new Map((useAvanceRotulado(ordenId).data ?? []).map((a) => [a.productId, a]));
  const keyboard = useKeyboard();
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo] = useState<Grupo | null>('MATERIA PRIMA');

  const q = normalizar(busqueda.trim());
  const rows = (productos.data ?? [])
    .filter((p) => p.active)
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
  if (!productos.data?.some((p) => p.active)) {
    return <Mensaje text="Este cliente no tiene productos en conservación. Asígnalos en Administrativo → Conservación." />;
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Buscador + grupos */}
      <div className="flex flex-wrap items-end gap-2 pt-2">
        <FieldBox label="Buscar producto:" className="min-w-64 flex-1">
          <KeyboardField>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onDoubleClick={keyboard.open}
              placeholder="Nombre, código o PLU…"
              className="h-9 w-full bg-transparent pr-10 text-lg font-medium uppercase outline-none"
            />
          </KeyboardField>
        </FieldBox>
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            title="Limpiar búsqueda"
            className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        )}
        {GRUPOS.map((g) => (
          <button
            key={g.tipo}
            onClick={() => setGrupo((actual) => (actual === g.tipo ? null : g.tipo))}
            title={grupo === g.tipo ? 'Clic para ver todos' : undefined}
            className={cn(
              'h-12 rounded-sm border-2 px-4 text-sm font-semibold uppercase tracking-wide transition-colors',
              grupo === g.tipo
                ? 'border-sky-700 bg-sky-600 text-white'
                : 'border-border bg-card hover:bg-muted',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Productos en 2 columnas */}
      <div className="min-h-0 flex-1 overflow-auto">
        {!rows.length ? (
          <Mensaje
            text={
              q
                ? 'Ningún producto coincide con la búsqueda.'
                : 'No hay productos de este grupo para el cliente.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                    'relative flex min-h-12 flex-col items-center justify-center rounded-sm border-2 px-3 py-2 text-center text-base font-medium uppercase transition-colors',
                    seleccionado?.id === p.id
                      ? 'border-sky-600 bg-sky-100'
                      : a?.completo
                        ? 'border-emerald-600 bg-emerald-100 text-emerald-900'
                        : otras.length
                          ? 'border-orange-500 bg-orange-100'
                          : enProceso
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-border bg-card hover:bg-muted/50',
                  )}
                >
                  {p.nombre}
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {p.codigo}
                  </span>
                  {(otras.length > 0 || (enProceso && a?.tiendaActual)) && (
                    <span className="mt-1 flex w-full flex-wrap items-center justify-end gap-x-2 text-right text-[11px] font-semibold normal-case leading-tight">
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

export function RotuladoDespostePage() {
  const fecha = today();
  const [tab, setTab] = useState<Tab>('ordenes');
  const [orden, setOrden] = useState<OrdenProduccion | null>(null);
  const [producto, setProducto] = useState<ProductoAsignado | null>(null);
  const ordenes = useOrdenesProduccionActivas();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefijo = orden?.cliente.nit ?? '';
  // PRODUCTOS tiene su propio scroll.
  const enProductos = tab === 'productos' && !!orden;
  const enEmbalaje = tab === 'embalaje' && !!producto;

  function irA(t: Tab) {
    setTab(t);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function elegirOrden(o: OrdenProduccion) {
    setOrden(o);
    setProducto(null);
    irA('productos');
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col gap-2 p-2">
      {/* Encabezado: icono, fecha y cliente */}
      <div className="flex items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <RotuladoDesposteIcon className="size-10 text-foreground" />
        </div>
        <FieldBox label="Fecha:" className="w-56">
          <div className="flex h-9 items-center text-xl font-medium tabular-nums">
            {fecha.split('-').reverse().join('/')}
          </div>
        </FieldBox>
        <FieldBox label="Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {orden ? orden.cliente.concepto : ''}
          </div>
        </FieldBox>
      </div>

      {/* Pestañas */}
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

      {/* Contenido */}
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1 rounded-sm border-2 border-border bg-card',
          enProductos || enEmbalaje ? 'overflow-hidden' : 'overflow-auto',
        )}
      >
        {tab === 'ordenes' ? (
          ordenes.isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : !ordenes.data?.length ? (
            <Mensaje text="No hay órdenes de producción activas. Créalas en Administrativo → Órdenes de Producción." />
          ) : (
            <ul className="flex flex-col gap-2 p-2">
              {ordenes.data.map((o) => (
                <li key={o.id}>
                  <button onClick={() => elegirOrden(o)} className={filaClase(orden?.id === o.id)}>
                    <span className="font-bold tabular-nums">{formatOP(o.opNumber)}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    {o.cliente.nit ? `${o.cliente.nit} - ` : ''}
                    {o.cliente.concepto}
                    <span className="mx-2 text-muted-foreground">|</span>
                    <span className="tabular-nums">{formatOD(o.dispatchOrder.odNumber)}</span>
                    <span className="ml-3 text-sm font-normal text-muted-foreground">
                      Proceso: {o.processDate.slice(0, 10).split('-').reverse().join('/')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : !orden ? (
          <Mensaje text="Selecciona una orden en la pestaña ÓRDENES." />
        ) : tab === 'productos' ? (
          <ConPreparacion orden={orden}>
            <ProductosLista
              ordenId={orden.id}
              clienteId={orden.cliente.id}
              seleccionado={producto}
              onSelect={(p) => {
                setProducto(p);
                irA('embalaje');
              }}
            />
          </ConPreparacion>
        ) : tab === 'embalaje' ? (
          producto ? (
            <ConPreparacion orden={orden}>
              <EmbalajeDesposte
                key={`${orden.id}:${producto.id}`}
                orden={orden}
                producto={producto}
                prefijo={prefijo}
              />
            </ConPreparacion>
          ) : (
            <Mensaje text="Selecciona un producto en la pestaña PRODUCTOS." />
          )
        ) : (
          <Mensaje text="Pestaña en construcción." />
        )}
      </div>

      {/* Botones de desplazamiento */}
      <div className={cn('grid grid-cols-2 gap-2', (enProductos || enEmbalaje) && 'hidden')}>
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

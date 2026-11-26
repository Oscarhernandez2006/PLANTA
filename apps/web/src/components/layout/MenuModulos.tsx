import { useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { tieneModulo } from '@/lib/permisos';
import { navGroups, type NavGroup, type NavItem } from './nav-config';

/** Qué se hace en cada módulo, para ubicarlo sin conocer el nombre exacto. */
const DESCRIPCION: Record<string, string> = {
  '/peso-en-camion': 'Pesaje de entrada y salida del camión con los animales',
  '/peso-en-pie': 'Peso de cada animal vivo y repesajes en corral',
  '/recibo-de-canales': 'Recibo de canales que llegan de otras plantas',
  '/recibo-en-posta': 'Recibo de producto en posta',
  '/sacrificio': 'Registro del sacrificio animal por animal',
  '/pieles': 'Peso de las pieles por animal',
  '/subproductos': 'Vísceras, retomas y su cava',
  '/canal-caliente': 'Peso de la canal e impresión del presinto',
  '/rotulado-desposte': 'Etiquetas de los cortes del desposte',
  '/rotulado-acondicionamiento': 'Etiquetas de producto acondicionado',
  '/inventarios': 'Qué hay en cavas y bodegas, y su trazabilidad',
  '/productos': 'Maestro de productos y cortes',
  '/conservacion': 'Días de vida útil por producto',
  '/canal-fria': 'Peso en frío y traslado entre cavas',
  '/traslado': 'Traslado de producto a acondicionamiento',
  '/despacho-caliente': 'Despacho de canales en caliente',
  '/despacho-frio': 'Despacho de canales y productos en frío',
  '/despacho-posta': 'Despacho de producto de posta',
  '/guias-transporte': 'Guías de transporte y remisiones de despacho',
  '/orden-beneficio': 'Crear y seguir las órdenes de beneficio',
  '/orden-despacho': 'Canales que pasan a desposte',
  '/despacho-canales': 'Órdenes de despacho de canales a clientes',
  '/orden-traslado': 'Órdenes de traslado a proceso',
  '/orden-produccion': 'Órdenes de producción del desposte',
  '/orden-acondicionamiento': 'Órdenes de acondicionamiento',
  '/recibo-canal': 'Órdenes para recibir canales externas',
  '/recibo-posta': 'Órdenes para recibir en posta',
  '/clientes': 'Clientes, tiendas, bodegas y puntos de envío',
  '/informes': 'Informes de sacrificio, despacho y producción',
  '/talleres/desposte': 'Rendimiento y resultado del desposte',
  '/talleres/acondicionamiento': 'Rendimiento del acondicionamiento',
  '/talleres/resultados': 'Utilidad y resultados del mes',
  '/talleres/precios': 'Precios de venta por producto',
  '/talleres/tarifas': 'Tarifas de proceso por cliente',
  '/talleres/costo-ganado': 'Costo del ganado por lote',
  '/talleres/historial': 'Talleres de meses anteriores',
  '/historico-sacrificio/dashboard': 'Resumen histórico de beneficio',
  '/historico-sacrificio/beneficio': 'Registro histórico de beneficio',
  '/historico-sacrificio/retomas': 'Registro histórico de retomas',
  '/historico-sacrificio/consolidados': 'Consolidados por periodo',
  '/historico-sacrificio/consolidados-retomas': 'Consolidados de retomas',
  '/historico-sacrificio/tarifa': 'Tarifa de sacrificio vigente',
  '/historico-sacrificio/datos': 'Datos maestros del histórico',
  '/configuracion/parametros-estacion': 'Impresoras, básculas y ajustes de este equipo',
  '/configuracion/usuarios': 'Usuarios, cédulas y PIN',
  '/configuracion/permisos': 'Qué módulos ve cada usuario',
};

/** Grupos del menú con solo los módulos que el usuario tiene permitidos. */
export function useModulosPermitidos(): NavGroup[] {
  const { user } = useAuth();
  return useMemo(
    () =>
      navGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => tieneModulo(user, i.to)) }))
        .filter((g) => g.items.length > 0),
    [user],
  );
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Lanzador de módulos en dos pasos, pensado para pantallas táctiles:
 * a la izquierda el área de trabajo, a la derecha sus módulos con lo que hace cada uno.
 */
export function MenuModulos({ onElegir, actual }: { onElegir: (ruta: string) => void; actual?: string | null }) {
  const grupos = useModulosPermitidos();
  const [texto, setTexto] = useState('');

  const todos = grupos.flatMap((g) => g.items.map((i) => ({ ...i, grupo: g.title })));

  const [seccion, setSeccion] = useState<string>(
    () => grupos.find((g) => g.items.some((i) => i.to === actual))?.title ?? grupos[0]?.title ?? '',
  );

  const q = normalizar(texto.trim());
  const visibles = q
    ? todos.filter((i) => normalizar(`${i.label} ${i.grupo} ${DESCRIPCION[i.to] ?? ''}`).includes(q))
    : (grupos.find((g) => g.title === seccion)?.items.map((i) => ({ ...i, grupo: seccion })) ?? []);

  const secciones = grupos.map((g) => ({ title: g.title, icon: g.items[0].icon, total: g.items.length }));

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
      <div className="relative mb-4 shrink-0">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar módulo por nombre o por lo que hace…"
          className="h-14 w-full rounded-xl border border-border bg-card pl-12 pr-12 text-lg shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {texto && (
          <button
            type="button"
            onClick={() => setTexto('')}
            aria-label="Borrar búsqueda"
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Áreas de trabajo */}
        <nav className={cn('scrollbar-app w-64 shrink-0 space-y-1 overflow-y-auto pr-1', q && 'opacity-40')}>
          {secciones.map((s) => {
            const activa = !q && s.title === seccion;
            const Icono = s.icon;
            return (
              <button
                key={s.title}
                type="button"
                onClick={() => {
                  setTexto('');
                  setSeccion(s.title);
                }}
                className={cn(
                  'flex h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] font-semibold transition-colors',
                  activa ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-accent',
                )}
              >
                <Icono className={cn('size-5 shrink-0', !activa && 'text-muted-foreground')} />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span
                  className={cn(
                    'rounded-full px-2 text-xs tabular-nums',
                    activa ? 'bg-white/20' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {s.total}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Módulos del área */}
        <div className="scrollbar-app min-w-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-3">
          <p className="px-2 pb-2 pt-1 text-sm font-semibold text-muted-foreground">
            {q ? `${visibles.length} resultado(s) para “${texto.trim()}”` : seccion}
          </p>
          {visibles.length ? (
            <div className="grid gap-2 xl:grid-cols-2">
              {visibles.map((i) => (
                <Fila
                  key={i.to}
                  item={i}
                  grupo={q ? i.grupo : null}
                  activo={i.to === actual}
                  onClick={() => onElegir(i.to)}
                />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">Ningún módulo coincide con la búsqueda.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Fila({
  item,
  grupo,
  activo,
  onClick,
}: {
  item: NavItem;
  grupo: string | null;
  activo: boolean;
  onClick: () => void;
}) {
  const Icono = item.icon;
  return (
    <button
      type="button"
      onClick={item.proximamente ? undefined : onClick}
      disabled={item.proximamente}
      title={item.proximamente ? 'Módulo en construcción: próximamente' : undefined}
      className={cn(
        'group flex min-h-20 w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors',
        item.proximamente
          ? 'cursor-not-allowed border-dashed border-border bg-muted/20 opacity-70'
          : 'hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10',
        !item.proximamente && (activo ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/40'),
      )}
    >
      <Icono className="size-7 shrink-0 text-foreground/80" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-tight">{item.label}</span>
        {DESCRIPCION[item.to] && (
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{DESCRIPCION[item.to]}</span>
        )}
        {grupo && <span className="mt-1 block text-xs font-medium text-primary/80">{grupo}</span>}
      </span>
      {item.proximamente ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Próximamente</span>
      ) : activo ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Abierto</span>
      ) : (
        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

import { useState } from 'react';
import {
  AlertTriangle,
  Beef,
  Boxes,
  CalendarClock,
  ClipboardList,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Snowflake,
  Thermometer,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrazabilidadCanalDialog } from './TrazabilidadCanalDialog';
import { TrazabilidadReciboDialog } from './TrazabilidadReciboDialog';
import { CAVAS, CAVAS_SUBPRODUCTO, useResumenInventario, type DestinoProducto, type ResumenInventario } from './api';

type Cava = ResumenInventario['cavas'][number];

const kg = (n: number, dec = 0) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const nombreSub = (c: string) => (c === '3' ? 'SUBPRODUCTO DESPACHO' : `SUBPRODUCTO ${c}`);

/** Semáforo de antigüedad: verde 0–1 días, ámbar 2–3, rojo desde el umbral de alerta. */
function tonoDias(dias: number | null, umbral: number) {
  if (dias == null) return 'bg-muted text-muted-foreground';
  if (dias >= umbral) return 'bg-red-100 text-red-700';
  if (dias >= 2) return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-700';
}

const textoDias = (d: number) => (d === 0 ? 'hoy' : d === 1 ? '1 día' : `${d} días`);

export function TableroInventario({
  onAbrirCava,
  onAbrirProducto,
}: {
  onAbrirCava: (tipo: 'canal' | 'subproducto', cava: string) => void;
  onAbrirProducto: (destino: DestinoProducto) => void;
}) {
  const { data, isLoading, isFetching, refetch } = useResumenInventario();
  const [alerta, setAlerta] = useState<'canales' | 'vencer'>('canales');
  const [trazaId, setTrazaId] = useState<string | null>(null);
  const [reciboId, setReciboId] = useState<string | null>(null);

  if (isLoading || !data)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );

  const { canales, productos, subproductos, ordenesAbiertas, umbrales, alertas } = data;
  const porCava = new Map(data.cavas.map((c) => [`${c.tipo}|${c.cava}`, c]));
  const vacia = (tipo: Cava['tipo'], cava: string): Cava => ({
    cava, tipo, unds: 0, kg: 0, disponibles: 0, enOrden: 0, enDespacho: 0, clientes: 0, masAntiguaDias: null,
  });
  // Cavas conocidas en su orden, más cualquier otra que aparezca en los datos.
  const cavasCanal = [
    ...CAVAS.map((c) => porCava.get(`canal|${c}`) ?? vacia('canal', c)),
    ...data.cavas.filter((c) => c.tipo === 'canal' && !CAVAS.includes(c.cava)),
  ];
  const cavasSub = [
    ...CAVAS_SUBPRODUCTO.map((c) => porCava.get(`subproducto|${c}`) ?? vacia('subproducto', c)),
    ...data.cavas.filter((c) => c.tipo === 'subproducto' && !CAVAS_SUBPRODUCTO.includes(c.cava)),
  ];
  const maxKgCava = Math.max(1, ...data.cavas.map((c) => c.kg));
  const nAlertas = alertas.canalesAntiguas.length + alertas.productosPorVencer.length + (canales.sinCava ? 1 : 0);
  const totalCliente = (c: ResumenInventario['clientes'][number]) => c.canalesKg + c.productosKg + c.subproductosKg;
  const maxCliente = Math.max(1, ...data.clientes.map(totalCliente));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Indicadores */}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi icon={Beef} titulo="Canales en cava" valor={`${kg(canales.kg)} kg`} sub={`${canales.unds} piezas`}>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Chip className="bg-emerald-100 text-emerald-800">{canales.disponibles} disponibles</Chip>
            {canales.enOrden > 0 && <Chip className="bg-amber-100 text-amber-800">{canales.enOrden} a proceso</Chip>}
            {canales.enDespacho > 0 && <Chip className="bg-sky-100 text-sky-800">{canales.enDespacho} en despacho</Chip>}
          </div>
        </Kpi>
        <Kpi icon={Boxes} titulo="Producto empacado" valor={`${kg(productos.kg)} kg`} sub={`${productos.unds} etiquetas`}>
          <BarraConservacion refrigerado={productos.refrigeradoKg} congelado={productos.congeladoKg} />
        </Kpi>
        <Kpi icon={ClipboardList} titulo="Subproductos" valor={`${kg(subproductos.kg)} kg`} sub={`${subproductos.unds} unidades`} />
        <Kpi icon={Truck} titulo="Órdenes abiertas" valor={`${ordenesAbiertas.od + ordenesAbiertas.dc}`} sub="comprometen inventario">
          <div className="flex gap-1.5 text-xs">
            <Chip className="bg-amber-100 text-amber-800">{ordenesAbiertas.od} OD a proceso</Chip>
            <Chip className="bg-sky-100 text-sky-800">{ordenesAbiertas.dc} DC despacho</Chip>
          </div>
        </Kpi>
        <Kpi
          icon={AlertTriangle}
          titulo="Alertas"
          valor={`${nAlertas}`}
          sub={nAlertas ? 'requieren atención' : 'todo en orden'}
          alerta={nAlertas > 0}
        >
          <div className="flex flex-wrap gap-1.5 text-xs">
            {productos.vencidos > 0 && <Chip className="bg-red-100 text-red-700">{productos.vencidos} vencidas</Chip>}
            {canales.sinCava > 0 && <Chip className="bg-red-100 text-red-700">{canales.sinCava} sin cava</Chip>}
          </div>
        </Kpi>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="flex min-h-0 flex-col gap-3">
          {/* Mapa de cavas */}
          <section className="shrink-0 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mapa de cavas</h2>
              <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <Leyenda className="bg-emerald-500">Disponible</Leyenda>
                <Leyenda className="bg-amber-500">A proceso</Leyenda>
                <Leyenda className="bg-sky-500">En despacho</Leyenda>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  title="Actualizar"
                  className="flex size-8 items-center justify-center rounded-md hover:bg-muted"
                >
                  <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 2xl:grid-cols-7">
              {cavasCanal.map((c) => (
                <TarjetaCava key={c.cava} c={c} nombre={c.cava} maxKg={maxKgCava} umbral={umbrales.diasCanal} onClick={() => onAbrirCava('canal', c.cava)} />
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2.5">
              {cavasSub.map((c) => (
                <TarjetaCava key={c.cava} c={c} nombre={nombreSub(c.cava)} maxKg={maxKgCava} umbral={umbrales.diasCanal} subproducto onClick={() => onAbrirCava('subproducto', c.cava)} />
              ))}
            </div>
          </section>

          {/* Existencias por cliente */}
          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Existencias por cliente (kg)</h2>
              <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <Leyenda className="bg-primary">Canal</Leyenda>
                <Leyenda className="bg-teal-400">Producto</Leyenda>
                <Leyenda className="bg-orange-400">Subproducto</Leyenda>
              </div>
            </div>
            {!data.clientes.length ? (
              <Vacio texto="No hay existencias en planta." />
            ) : (
              <ul className="scrollbar-app min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                {data.clientes.map((c) => {
                  const total = totalCliente(c);
                  const pct = (n: number) => `${(n / maxCliente) * 100}%`;
                  return (
                    <li key={c.cliente} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem] items-center gap-3">
                      <span className="truncate text-sm font-semibold uppercase" title={c.cliente}>
                        {c.cliente}
                      </span>
                      <div
                        className="flex h-5 overflow-hidden rounded-full bg-muted"
                        title={`Canal ${kg(c.canalesKg)} kg (${c.canales}) · Producto ${kg(c.productosKg)} kg (${c.productos}) · Subproducto ${kg(c.subproductosKg)} kg`}
                      >
                        <div className="bg-primary" style={{ width: pct(c.canalesKg) }} />
                        <div className="bg-teal-400" style={{ width: pct(c.productosKg) }} />
                        <div className="bg-orange-400" style={{ width: pct(c.subproductosKg) }} />
                      </div>
                      <span className="text-right text-sm font-bold tabular-nums">{kg(total)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Alertas */}
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-1 border-b border-border p-2">
            {(
              [
                { k: 'canales', t: `Canales +${umbrales.diasCanal} días`, n: alertas.canalesAntiguas.length },
                { k: 'vencer', t: 'Por vencer', n: alertas.productosPorVencer.length },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setAlerta(o.k)}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                  alerta === o.k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {o.t}
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', o.n ? 'bg-red-600 text-white' : 'bg-muted')}>{o.n}</span>
              </button>
            ))}
          </div>
          {canales.sinCava > 0 && (
            <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {canales.sinCava} {canales.sinCava === 1 ? 'pieza de canal está' : 'piezas de canal están'} en inventario sin cava asignada.
            </p>
          )}
          <div className="scrollbar-app min-h-0 flex-1 overflow-auto p-3">
            {alerta === 'canales' ? (
              !alertas.canalesAntiguas.length ? (
                <Vacio texto={`Ninguna canal disponible lleva ${umbrales.diasCanal} días o más en cava.`} />
              ) : (
                <ul className="space-y-2">
                  {alertas.canalesAntiguas.map((a) => (
                    <li key={a.piezaId}>
                      <button
                        type="button"
                        onClick={() => (a.origen === 'recibo' ? setReciboId(a.piezaId) : setTrazaId(a.piezaId))}
                        title="Ver trazabilidad"
                        className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left hover:border-primary/40 hover:bg-muted/40"
                      >
                        <span className={cn('rounded-md px-2 py-1 text-xs font-bold tabular-nums', tonoDias(a.dias, umbrales.diasCanal))}>
                          {textoDias(a.dias)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold uppercase">{a.cliente}</span>
                          <span className="block text-xs text-muted-foreground">
                            {a.origen === 'recibo'
                              ? `RC${a.reference}-${String(a.sequence).padStart(2, '0')} · RECIBIDA · ${a.cava}`
                              : `OB${a.reference} · A${String(a.sequence).padStart(2, '0')} · ${a.pieza.toUpperCase()} · ${a.cava}`}
                          </span>
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{kg(a.pesoKg, 1)} kg</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : !alertas.productosPorVencer.length ? (
              <Vacio texto={`Ningún producto vence en los próximos ${umbrales.diasVence} días.`} />
            ) : (
              <ul className="space-y-2">
                {alertas.productosPorVencer.map((p) => (
                  <li key={JSON.stringify([p.codigo, p.bodegaId ?? [p.cliente, p.bodega], p.vence])}>
                    <button
                      type="button"
                      onClick={() => onAbrirProducto(p)}
                      title="Ver producto en el inventario del cliente"
                      className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left hover:border-primary/40 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span
                        className={cn(
                          'flex w-16 shrink-0 flex-col items-center rounded-md px-1 py-1 text-xs font-bold',
                          p.dias < 0 ? 'bg-red-600 text-white' : p.dias <= 1 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        <CalendarClock className="size-3.5" />
                        {p.dias < 0 ? 'vencido' : p.dias === 0 ? 'hoy' : `${p.dias} d`}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold uppercase">
                          {p.codigo} · {p.producto}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.cliente} · {p.bodega} · vence {p.vence.split('-').reverse().join('/')}
                        </span>
                      </span>
                      <span className="text-right text-sm tabular-nums">
                        <b>{kg(p.kg, 1)}</b> kg
                        <span className="block text-xs text-muted-foreground">{p.unds} und</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Actualizado {new Date(data.generadoAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </section>
      </div>

      {trazaId && <TrazabilidadCanalDialog piezaId={trazaId} onClose={() => setTrazaId(null)} />}
      {reciboId && <TrazabilidadReciboDialog tipo="canal" id={reciboId} onClose={() => setReciboId(null)} />}
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
  sub: string;
  alerta?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 shadow-sm', alerta ? 'border-red-200' : 'border-border')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('size-4', alerta ? 'text-red-600' : 'text-primary')} />
        {titulo}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold tabular-nums', alerta && 'text-red-600')}>{valor}</span>
        <span className="text-sm text-muted-foreground">{sub}</span>
      </div>
      {children}
    </div>
  );
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('rounded-full px-2 py-0.5 font-semibold tabular-nums', className)}>{children}</span>;
}

function Leyenda({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-full', className)} />
      {children}
    </span>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      <Inbox className="size-7 opacity-60" />
      {texto}
    </div>
  );
}

function BarraConservacion({ refrigerado, congelado }: { refrigerado: number; congelado: number }) {
  const total = refrigerado + congelado;
  if (!total) return null;
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="bg-teal-400" style={{ width: `${(refrigerado / total) * 100}%` }} />
        <div className="bg-sky-500" style={{ width: `${(congelado / total) * 100}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Thermometer className="size-3" /> {kg(refrigerado)} kg
        </span>
        <span className="flex items-center gap-1">
          <Snowflake className="size-3" /> {kg(congelado)} kg
        </span>
      </div>
    </div>
  );
}

function TarjetaCava({
  c,
  nombre,
  maxKg,
  umbral,
  subproducto,
  onClick,
}: {
  c: Cava;
  nombre: string;
  maxKg: number;
  umbral: number;
  subproducto?: boolean;
  onClick: () => void;
}) {
  const vacia = c.unds === 0 && c.kg === 0;
  const seg = (n: number) => `${c.unds ? (n / c.unds) * 100 : 0}%`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3 text-left transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]',
        vacia ? 'border-dashed border-border bg-muted/20' : 'border-border bg-card',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold uppercase leading-tight">{nombre}</span>
        {!vacia && (
          <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold', tonoDias(c.masAntiguaDias, umbral))} title="Antigüedad de lo más viejo">
            {c.masAntiguaDias == null ? '—' : textoDias(c.masAntiguaDias)}
          </span>
        )}
      </div>
      {vacia ? (
        <span className="text-sm text-muted-foreground">Vacía</span>
      ) : (
        <>
          <div>
            <div className="text-xl font-bold tabular-nums leading-none">
              {kg(c.kg)} <span className="text-xs font-semibold text-muted-foreground">kg</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {c.unds} {subproducto ? 'und' : 'piezas'} · {c.clientes} {c.clientes === 1 ? 'cliente' : 'clientes'}
            </div>
          </div>
          {subproducto ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-orange-400" style={{ width: `${(c.kg / maxKg) * 100}%` }} />
            </div>
          ) : (
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" title={`${c.disponibles} disponibles · ${c.enOrden} a proceso · ${c.enDespacho} en despacho`}>
              <div className="bg-emerald-500" style={{ width: seg(c.disponibles) }} />
              <div className="bg-amber-500" style={{ width: seg(c.enOrden) }} />
              <div className="bg-sky-500" style={{ width: seg(c.enDespacho) }} />
            </div>
          )}
        </>
      )}
    </button>
  );
}

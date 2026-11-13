import { Fragment, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Beef, ChevronDown, ChevronRight, CircleDollarSign, Factory, Gauge, Package, Percent, Receipt, Scale, TrendingUp, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { cn, plantToday } from '@/lib/utils';
import { indicadoresLote, mediana, pct, useTallerDesposte, type LoteDesposte } from './api';
import { ComparativoDesposte, ConsolidadoDesposte } from './desposte-mensual';
import { BotonFacturacion, GastosProceso, millones, Pendientes, Utilidad } from './finanzas-ui';
import { pesos, pesosDec } from './maestros-api';
import {
  AZUL,
  Encabezado,
  etiquetaDia,
  Filtros,
  GRIS,
  Grafica,
  kg,
  Kpi,
  num,
  PanelAlertas,
  porc,
  rangoDeMes,
  ROJO,
  SelectorAnio,
  SelectorMes,
  SinDatos,
  tooltipStyle,
  usePeriodo,
  VERDE,
  VERDE_CLARO,
  VERDE_MEDIO,
  clientesDe,
  type Alerta,
} from './ui';

const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'lotes', label: 'Lotes' },
  { value: 'cortes', label: 'Rendimiento por corte' },
  { value: 'comparativo', label: 'Comparativo mensual' },
  { value: 'consolidado', label: 'Consolidado mensual' },
];

export const op = (n: number) => `OP ${n}`;
/** Diferencia (puntos porcentuales) a partir de la cual un corte se marca en la matriz. */
const UMBRAL_PP = 1;

export function TallerDespostePage() {
  const periodo = usePeriodo();
  const [cliente, setCliente] = useState('');
  const [tab, setTab] = useState('resumen');
  const [anio, setAnio] = useState(() => plantToday().slice(0, 4));
  const [mes, setMes] = useState(() => plantToday().slice(0, 7));
  const rango =
    tab === 'comparativo'
      ? { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
      : tab === 'consolidado'
        ? rangoDeMes(mes)
        : periodo;
  const q = useTallerDesposte(rango.desde, rango.hasta);

  const lotes = useMemo(
    () => (q.data ?? []).filter((l) => !cliente || l.clienteId === cliente),
    [q.data, cliente],
  );
  const d = useMemo(() => resumir(lotes), [lotes]);
  const periodoAlterno =
    tab === 'comparativo' ? <SelectorAnio anio={anio} setAnio={setAnio} /> : tab === 'consolidado' ? <SelectorMes mes={mes} setMes={setMes} /> : undefined;

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Encabezado
        titulo="Taller de desposte"
        descripcion="Rendimiento de canales a cortes por orden de producción, con datos de Canal Fría y Rotulado Desposte."
        cargando={q.isFetching}
        onRefrescar={() => q.refetch()}
      />
      <Filtros
        periodo={periodo}
        cliente={cliente}
        setCliente={setCliente}
        clientes={clientesDe(q.data)}
        cargando={q.isLoading}
        periodoAlterno={periodoAlterno}
      />

      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Factory} label="Lotes despostados" value={num(d.lotes.length)} detalle={d.enProceso ? `${d.enProceso} en proceso` : 'Todos con etiquetas'} />
        <Kpi icon={Beef} label="Canales" value={num(d.canales, d.canales % 1 ? 1 : 0)} detalle={d.kgCanal ? `${kg(d.kgCanal)} frío por canal` : undefined} />
        <Kpi icon={Scale} label="Materia prima (frío)" value={kg(d.kgFrio, 0)} detalle={`Oreo ${porc(d.oreo)} sobre ${kg(d.kgCaliente, 0)} caliente`} />
        <Kpi icon={Package} label="Producción etiquetada" value={kg(d.kgProducido, 0)} detalle={`${num(d.etiquetas)} etiquetas · ${num(d.canastillas)} canastillas`} />
        <Kpi icon={Gauge} label="Rendimiento" tone="text-[#156F21]" value={porc(d.rendimiento)} detalle={`Merma ${kg(d.mermaKg)} (${porc(d.mermaPct)})`} />
        <Kpi icon={Percent} label="TCA ponderado" value={porc(d.tca)} detalle={`Retoma ${kg(d.kgRetoma)}`} />
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={Receipt} label="Venta" value={millones(d.fin.venta)} detalle={d.fin.kgProducido ? `${pesosDec(d.fin.venta / d.fin.kgProducido)} por kg` : undefined} />
        <Kpi icon={Beef} label="Costo de ganado" value={millones(d.fin.costoGanado)} detalle={d.fin.kgFrio ? `${pesosDec(d.fin.costoGanado / d.fin.kgFrio)} por kg frío` : undefined} />
        <Kpi icon={Wrench} label="Gastos de proceso" value={millones(d.fin.gastos)} detalle={d.fin.kgFrio ? `${pesosDec(d.fin.gastos / d.fin.kgFrio)} por kg frío` : undefined} />
        <Kpi
          icon={TrendingUp}
          label="Utilidad"
          tone={d.fin.utilidad >= 0 ? 'text-[#156F21]' : 'text-red-700'}
          value={millones(d.fin.utilidad)}
          detalle={d.fin.venta ? `Margen ${porc((d.fin.utilidad * 100) / d.fin.venta, 1)}` : 'Sin venta: carga la lista de precios'}
        />
        <Kpi
          icon={CircleDollarSign}
          label="Costo por kg producido"
          value={d.fin.kgProducido ? pesosDec((d.fin.costoGanado + d.fin.gastos) / d.fin.kgProducido) : '—'}
          detalle={d.fin.parciales ? `${d.fin.parciales} lote(s) con datos incompletos` : 'Todos los lotes completos'}
          tone={d.fin.parciales ? 'text-amber-700' : undefined}
        />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="shrink-0" />

      {tab === 'resumen' && <Resumen d={d} />}
      {tab === 'lotes' && <TablaLotes d={d} />}
      {tab === 'cortes' && <MatrizCortes d={d} />}
      {tab === 'comparativo' && <ComparativoDesposte lotes={d.lotes} anio={anio} />}
      {tab === 'consolidado' && (
        <ConsolidadoDesposte d={d} mes={mes} cliente={clientesDe(q.data).find((c) => c.id === cliente)?.nombre ?? null} />
      )}
    </div>
  );
}

export type Resumen = ReturnType<typeof resumir>;

export function resumir(lotes: LoteDesposte[]) {
  const filas = lotes.map((l) => ({ ...l, ...indicadoresLote(l) }));
  // Los indicadores de rendimiento solo cuentan lotes que ya tienen etiquetas.
  const cerrados = filas.filter((l) => !l.enProceso);
  const sum = (xs: typeof filas, f: (l: (typeof filas)[number]) => number) => xs.reduce((s, l) => s + f(l), 0);
  const kgFrioC = sum(cerrados, (l) => l.kgFrio);
  const kgProdC = sum(cerrados, (l) => l.kgProducido);
  const kgRetC = sum(cerrados, (l) => l.kgRetoma);
  const canales = sum(filas, (l) => l.canales);
  const kgFrio = sum(filas, (l) => l.kgFrio);
  const kgCaliente = sum(filas, (l) => l.kgCaliente);
  const rendimiento = pct(kgProdC, kgFrioC);
  const kgCanal = canales > 0 ? kgFrio / canales : null;

  const porDia = new Map<string, { fecha: string; canales: number; kgFrio: number; kgProducido: number }>();
  for (const l of filas) {
    const v = porDia.get(l.fecha) ?? { fecha: l.fecha, canales: 0, kgFrio: 0, kgProducido: 0 };
    v.canales += l.canales;
    v.kgFrio += l.kgFrio;
    v.kgProducido += l.kgProducido;
    porDia.set(l.fecha, v);
  }

  const productos = new Map<string, { codigo: string; nombre: string; kg: number; unds: number }>();
  for (const l of cerrados) {
    for (const p of l.productos) {
      const v = productos.get(p.codigo) ?? { codigo: p.codigo, nombre: p.nombre, kg: 0, unds: 0 };
      v.kg += p.kg;
      v.unds += p.unds;
      productos.set(p.codigo, v);
    }
  }
  const ranking = [...productos.values()].sort((a, b) => b.kg - a.kg);

  // Resultado económico: solo lotes con etiquetas y finanzas calculadas.
  const conFin = cerrados.filter((l) => l.finanzas);
  const fin = {
    venta: sum(conFin, (l) => l.finanzas!.venta),
    costoGanado: sum(conFin, (l) => l.finanzas!.costoGanado),
    gastos: sum(conFin, (l) => l.finanzas!.totalGastos),
    utilidad: sum(conFin, (l) => l.finanzas!.utilidad),
    kgFrio: sum(conFin, (l) => l.kgFrio),
    kgProducido: sum(conFin, (l) => l.kgProducido),
    parciales: conFin.filter((l) => l.finanzas!.pendientes.length).length,
  };

  const alertas: Alerta[] = [];
  for (const l of filas) {
    if (l.enProceso) {
      alertas.push({ nivel: 'media', texto: `${op(l.opNumber)} (${l.cliente}) aún no tiene etiquetas: no entra en los rendimientos.` });
      continue;
    }
    if (l.kgProducido > l.kgFrio) {
      alertas.push({ nivel: 'alta', texto: `${op(l.opNumber)}: la producción supera la materia prima en ${kg(l.kgProducido - l.kgFrio)}. Revisar pesajes.` });
    } else if (rendimiento != null && l.rendimiento != null && l.rendimiento < rendimiento - 2) {
      alertas.push({
        nivel: l.rendimiento < rendimiento - 4 ? 'alta' : 'media',
        texto: `${op(l.opNumber)} rinde ${porc(l.rendimiento)}, ${porc(rendimiento - l.rendimiento)} por debajo del promedio.`,
      });
    }
    if (l.canalesSinFrio) {
      alertas.push({ nivel: 'media', texto: `${op(l.opNumber)}: ${l.canalesSinFrio} canal(es) sin peso en frío; se tomó el peso caliente.` });
    }
    if (kgCanal && l.kgCanal && Math.abs(l.kgCanal / kgCanal - 1) > 0.15) {
      alertas.push({ nivel: 'media', texto: `${op(l.opNumber)}: ${kg(l.kgCanal)} por canal frente a ${kg(kgCanal)} de promedio.` });
    }
  }

  return {
    lotes: filas,
    cerrados,
    enProceso: filas.length - cerrados.length,
    canales,
    kgFrio,
    kgCaliente,
    kgCanal,
    oreo: pct(kgCaliente - kgFrio, kgCaliente),
    kgProducido: sum(filas, (l) => l.kgProducido),
    etiquetas: sum(filas, (l) => l.etiquetas),
    canastillas: sum(filas, (l) => l.canastillas),
    rendimiento,
    mermaKg: kgFrioC - kgProdC,
    mermaPct: pct(kgFrioC - kgProdC, kgFrioC),
    tca: pct(kgFrioC - kgRetC, kgFrioC),
    kgRetoma: kgRetC,
    kgProducidoCerrados: kgProdC,
    kgFrioCerrados: kgFrioC,
    dias: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    ranking,
    alertas,
    fin,
  };
}

function Resumen({ d }: { d: Resumen }) {
  const resultado = d.cerrados
    .filter((l) => l.finanzas)
    .map((l) => ({ lote: op(l.opNumber), venta: l.finanzas!.venta, costo: l.finanzas!.costoTotal, margen: l.finanzas!.margen }));
  const porLote = d.cerrados.map((l) => ({
    lote: op(l.opNumber),
    rendimiento: l.rendimiento ?? 0,
    tca: l.tca ?? 0,
    kgCanal: l.kgCanal ?? 0,
  }));
  const top = d.ranking.slice(0, 12).map((p) => ({
    ...p,
    corto: p.nombre.length > 26 ? `${p.nombre.slice(0, 25)}…` : p.nombre,
    part: d.kgProducidoCerrados ? (p.kg * 100) / d.kgProducidoCerrados : 0,
  }));
  const alto = 'h-72';

  return (
    <div className="grid shrink-0 grid-cols-1 gap-4 pb-2 xl:grid-cols-2">
      <Grafica titulo="Rendimiento y TCA por lote" subtitulo="Barras en rojo: por debajo del rendimiento promedio">
        <div className={alto}>
          {porLote.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={porLote} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lote" fontSize={11} />
                <YAxis fontSize={11} width={44} domain={[(min: number) => Math.max(0, Math.floor(min - 5)), 100]} unit="%" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [porc(v), n === 'tca' ? 'TCA' : 'Rendimiento']} />
                <Legend formatter={(v) => (v === 'tca' ? 'TCA' : 'Rendimiento')} wrapperStyle={{ fontSize: 12 }} />
                {d.rendimiento != null && <ReferenceLine y={d.rendimiento} stroke={GRIS} strokeDasharray="4 4" />}
                <Bar dataKey="rendimiento" radius={[3, 3, 0, 0]} maxBarSize={56}>
                  {porLote.map((l) => (
                    <Cell key={l.lote} fill={d.rendimiento != null && l.rendimiento < d.rendimiento - 1 ? ROJO : VERDE_MEDIO} />
                  ))}
                  <LabelList dataKey="rendimiento" position="top" fontSize={10} formatter={(v: number) => v.toFixed(1)} />
                </Bar>
                <Line type="monotone" dataKey="tca" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <PanelAlertas alertas={d.alertas} />

      <Grafica titulo="Resultado económico por lote" subtitulo="Venta frente a costo total (ganado + proceso) · Línea: margen" className="xl:col-span-2">
        <div className={alto}>
          {resultado.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={resultado} margin={{ top: 20, right: 8, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lote" fontSize={11} />
                <YAxis yAxisId="cop" fontSize={11} width={70} tickFormatter={millones} />
                <YAxis yAxisId="pct" orientation="right" fontSize={11} width={44} unit="%" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, n) => (n === 'margen' ? [porc(v, 1), 'Margen'] : [pesos(v), n === 'venta' ? 'Venta' : 'Costo total'])}
                />
                <Legend formatter={(v: string) => ({ venta: 'Venta', costo: 'Costo total', margen: 'Margen' } as Record<string, string>)[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="cop" dataKey="venta" fill={VERDE_CLARO} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="cop" dataKey="costo" fill={GRIS} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Line yAxisId="pct" type="monotone" dataKey="margen" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos texto="Sin lotes valorizados en el periodo" />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Producción diaria" subtitulo="Kg etiquetados y canales despostadas por día">
        <div className={alto}>
          {d.dias.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.dias} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha" tickFormatter={etiquetaDia} fontSize={11} />
                <YAxis yAxisId="kg" fontSize={11} width={56} tickFormatter={(v: number) => num(v)} />
                <YAxis yAxisId="canales" orientation="right" fontSize={11} width={32} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v) => etiquetaDia(String(v))}
                  formatter={(v: number, n) => (n === 'canales' ? [num(v, 1), 'Canales'] : [kg(v), n === 'kgFrio' ? 'Materia prima' : 'Producción'])}
                />
                <Legend formatter={(v: string) => ({ kgFrio: 'Materia prima (kg)', kgProducido: 'Producción (kg)', canales: 'Canales' } as Record<string, string>)[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="kg" dataKey="kgFrio" fill={GRIS} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="kg" dataKey="kgProducido" fill={VERDE_CLARO} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Line yAxisId="canales" type="monotone" dataKey="canales" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Kg frío por canal" subtitulo="Línea punteada: promedio del periodo">
        <div className={alto}>
          {porLote.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porLote} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lote" fontSize={11} />
                <YAxis fontSize={11} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [kg(v), 'Kg por canal']} />
                {d.kgCanal && <ReferenceLine y={d.kgCanal} stroke={GRIS} strokeDasharray="4 4" />}
                <Bar dataKey="kgCanal" fill={AZUL} radius={[3, 3, 0, 0]} maxBarSize={56}>
                  <LabelList dataKey="kgCanal" position="top" fontSize={10} formatter={(v: number) => v.toFixed(1)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Composición de la producción" subtitulo="Cortes con más kilos y su participación" className="xl:col-span-2">        <div className="h-96">
          {top.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 0, right: 110, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} tickFormatter={(v: number) => num(v)} />
                <YAxis type="category" dataKey="corto" fontSize={11} width={190} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, _n, item) => [`${kg(v)} · ${porc((item.payload as { part: number }).part)}`, 'Producción']}
                  labelFormatter={(_l, p) => (p?.[0]?.payload as { codigo: string; nombre: string } | undefined)?.nombre ?? ''}
                />
                <Bar dataKey="kg" fill={VERDE} radius={[0, 3, 3, 0]} maxBarSize={22}>
                  <LabelList
                    dataKey="part"
                    position="right"
                    fontSize={10}
                    formatter={(v: number) => `${v.toFixed(1)} %`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>
    </div>
  );
}

const ESTADO: Record<LoteDesposte['status'], { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  activo: { label: 'Activa', tone: 'info' },
  facturado: { label: 'Cerrada', tone: 'success' },
  inactivo: { label: 'Inactiva', tone: 'neutral' },
};

function TablaLotes({ d }: { d: Resumen }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const th = 'border-b border-border bg-muted px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-2 py-2 text-right tabular-nums';
  if (!d.lotes.length) return <Card className="p-6"><SinDatos /></Card>;

  return (
    <Card className="shrink-0 overflow-hidden">
      <div className="scrollbar-app overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'text-left')}>Lote</th>
              <th className={cn(th, 'text-left')}>Fecha</th>
              <th className={cn(th, 'text-left')}>Cliente</th>
              <th className={th}>Canales</th>
              <th className={th}>Caliente</th>
              <th className={th}>Frío</th>
              <th className={th}>Oreo</th>
              <th className={th}>Producción</th>
              <th className={th}>Rendimiento</th>
              <th className={th}>Merma</th>
              <th className={th}>TCA</th>
              <th className={th}>Venta</th>
              <th className={th}>Utilidad</th>
              <th className={th}>Etiquetas</th>
              <th className={cn(th, 'text-center')}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {d.lotes.map((l) => {
              const abierto = abiertos.has(l.id);
              const bajo = d.rendimiento != null && l.rendimiento != null && l.rendimiento < d.rendimiento - 1;
              return (
                <Fragment key={l.id}>
                  <tr
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() =>
                      setAbiertos((prev) => {
                        const next = new Set(prev);
                        if (next.has(l.id)) next.delete(l.id);
                        else next.add(l.id);
                        return next;
                      })
                    }
                  >
                    <td className={cn(td, 'text-left font-semibold')}>
                      <span className="inline-flex items-center gap-1">
                        {abierto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        {op(l.opNumber)}
                        <span className="text-xs font-normal text-muted-foreground">· OD {l.odNumber}</span>
                      </span>
                    </td>
                    <td className={cn(td, 'text-left')}>
                      {etiquetaDia(l.fecha)}
                      {l.fechaSacrificio && <span className="block text-xs text-muted-foreground">Sacr. {etiquetaDia(l.fechaSacrificio)}</span>}
                    </td>
                    <td className={cn(td, 'max-w-52 truncate text-left')} title={l.cliente}>{l.cliente}</td>
                    <td className={td}>{num(l.canales, l.canales % 1 ? 1 : 0)}</td>
                    <td className={td}>{kg(l.kgCaliente)}</td>
                    <td className={td}>
                      {kg(l.kgFrio)}
                      {l.canalesSinFrio > 0 && <span className="block text-xs text-amber-700">{l.canalesSinFrio} sin frío</span>}
                    </td>
                    <td className={td}>{porc(l.oreoPct)}</td>
                    <td className={td}>{l.enProceso ? '—' : kg(l.kgProducido)}</td>
                    <td className={cn(td, 'font-semibold', bajo ? 'text-red-700' : 'text-[#156F21]')}>{l.enProceso ? '—' : porc(l.rendimiento)}</td>
                    <td className={td}>{l.enProceso ? '—' : `${kg(l.mermaKg)} · ${porc(l.mermaPct, 1)}`}</td>
                    <td className={td}>{l.enProceso ? '—' : porc(l.tca)}</td>
                    <td className={td}>{l.finanzas && !l.enProceso ? pesos(l.finanzas.venta) : '—'}</td>
                    <td className={td}>
                      {l.finanzas && !l.enProceso ? (
                        <Utilidad valor={l.finanzas.utilidad} margen={l.finanzas.margen} parcial={l.finanzas.pendientes.length > 0} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={td}>{num(l.etiquetas)}</td>
                    <td className={cn(td, 'text-center')}>
                      {l.enProceso ? <Badge tone="warning">En proceso</Badge> : <Badge tone={ESTADO[l.status].tone}>{ESTADO[l.status].label}</Badge>}
                    </td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={15} className="border-b border-border bg-muted/20 px-6 py-3">
                        <DetalleLote lote={l} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60 font-semibold">
              <td className={cn(td, 'text-left')} colSpan={3}>Total del periodo</td>
              <td className={td}>{num(d.canales, d.canales % 1 ? 1 : 0)}</td>
              <td className={td}>{kg(d.kgCaliente)}</td>
              <td className={td}>{kg(d.kgFrio)}</td>
              <td className={td}>{porc(d.oreo)}</td>
              <td className={td}>{kg(d.kgProducido)}</td>
              <td className={cn(td, 'text-[#156F21]')}>{porc(d.rendimiento)}</td>
              <td className={td}>{`${kg(d.mermaKg)} · ${porc(d.mermaPct, 1)}`}</td>
              <td className={td}>{porc(d.tca)}</td>
              <td className={td}>{pesos(d.fin.venta)}</td>
              <td className={td}>
                <Utilidad valor={d.fin.utilidad} margen={d.fin.venta ? (d.fin.utilidad * 100) / d.fin.venta : null} parcial={d.fin.parciales > 0} />
              </td>
              <td className={td}>{num(d.etiquetas)}</td>
              <td className={td} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function DetalleLote({ lote }: { lote: Resumen['lotes'][number] }) {
  const animales = Object.entries(lote.animales)
    .map(([t, n]) => `${n} ${t.replace('_', ' ')}`)
    .join(' · ');
  const td = 'px-2 py-1.5 text-right tabular-nums';
  const f = lote.finanzas;
  const fc = new Map((f?.cortes ?? []).map((c) => [c.codigo, c]));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Animales: {animales || '—'} · Canastillas: {num(lote.canastillas)} · Kg frío por canal: {lote.kgCanal ? kg(lote.kgCanal) : '—'}
      </p>
      {f && lote.productos.length > 0 && (
        <BotonFacturacion
          documento={{
            taller: 'DESPOSTE',
            numero: op(lote.opNumber),
            fecha: lote.fecha,
            cliente: lote.cliente,
            referencia: `Traslado OD ${lote.odNumber} · ${num(lote.canales, lote.canales % 1 ? 1 : 0)} canales · ${kg(lote.kgFrio)} frío`,
            productos: [...lote.productos]
              .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
              .map((p) => {
                const c = fc.get(p.codigo);
                return { codigo: p.codigo, nombre: p.nombre, unds: p.unds, kg: p.kg, precioKg: c?.precioKg ?? 0, valor: c?.venta ?? 0 };
              }),
            servicios: f.gastos,
          }}
        />
      )}
      {f && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ['Venta', pesos(f.venta)],
            ['Costo de ganado', pesos(f.costoGanado)],
            ['Gastos de proceso', pesos(f.totalGastos)],
            ['Costo total', pesos(f.costoTotal)],
          ].map(([t, v]) => (
            <div key={t} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[11px] uppercase text-muted-foreground">{t}</p>
              <p className="font-semibold tabular-nums">{v}</p>
            </div>
          ))}
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">Utilidad</p>
            <Utilidad valor={f.utilidad} margen={f.margen} parcial={f.pendientes.length > 0} />
          </div>
        </div>
      )}
      {f && <Pendientes items={f.pendientes} />}
      {lote.productos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay cortes etiquetados.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="px-2 py-1 text-left">Código</th>
              <th className="px-2 py-1 text-left">Corte</th>
              <th className="px-2 py-1 text-right">Unds</th>
              <th className="px-2 py-1 text-right">Kg</th>
              <th className="px-2 py-1 text-right">Rendimiento</th>
              <th className="px-2 py-1 text-right">Kg / canal</th>
              <th className="px-2 py-1 text-right">Precio / kg</th>
              <th className="px-2 py-1 text-right">Venta</th>
              <th className="px-2 py-1 text-right">Part. venta</th>
              <th className="px-2 py-1 text-right">Costo / kg</th>
            </tr>
          </thead>
          <tbody>
            {[...lote.productos]
              .sort((a, b) => b.kg - a.kg)
              .map((p) => {
                const c = fc.get(p.codigo);
                return (
                  <tr key={p.codigo} className="border-t border-border/60">
                    <td className="px-2 py-1.5 tabular-nums">{p.codigo}</td>
                    <td className="px-2 py-1.5">{p.nombre}</td>
                    <td className={td}>{num(p.unds)}</td>
                    <td className={td}>{kg(p.kg, 2)}</td>
                    <td className={td}>{porc(pct(p.kg, lote.kgFrio))}</td>
                    <td className={td}>{lote.canales ? kg(p.kg / lote.canales, 2) : '—'}</td>
                    <td className={cn(td, c && c.precioKg <= 0 && 'text-amber-700')}>{c ? (c.precioKg > 0 ? pesosDec(c.precioKg) : 'Sin precio') : '—'}</td>
                    <td className={td}>{c ? pesos(c.venta) : '—'}</td>
                    <td className={td}>{porc(c?.participacionVenta ?? null, 1)}</td>
                    <td className={cn(td, 'font-medium')}>{c?.costoKg != null ? pesosDec(c.costoKg) : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
      {f && (
        <div className="max-w-3xl">
          <GastosProceso gastos={f.gastos} refServicios={{ productionOrderId: lote.id }} clienteId={lote.clienteId} tipo="desposte" />
        </div>
      )}
    </div>
  );
}

function MatrizCortes({ d }: { d: Resumen }) {
  const [modo, setModo] = useState<'pct' | 'kg'>('pct');
  const lotes = d.cerrados;
  const filas = useMemo(() => {
    return d.ranking.map((p) => {
      const valores = lotes.map((l) => {
        const kgL = l.productos.find((x) => x.codigo === p.codigo)?.kg ?? 0;
        return { kg: kgL, pct: pct(kgL, l.kgFrio) };
      });
      // Desviación de cada lote frente a la mediana de los demás lotes con ese corte.
      const marcas = valores.map((v, i) => {
        if (v.pct == null || lotes.length < 3) return 0;
        const otros = valores.filter((o, j) => j !== i && o.kg > 0 && o.pct != null).map((o) => o.pct as number);
        const m = mediana(otros);
        if (m == null) return 0;
        const dif = v.pct - m;
        return Math.abs(dif) >= UMBRAL_PP ? dif : 0;
      });
      return { ...p, valores, marcas, pctTotal: pct(p.kg, d.kgFrioCerrados) };
    });
  }, [d, lotes]);

  if (!lotes.length) return <Card className="p-6"><SinDatos /></Card>;
  const th = 'border-b border-border bg-muted px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-2 py-1.5 text-right tabular-nums';

  return (
    <Card className="flex shrink-0 flex-col gap-3 overflow-hidden p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Rendimiento de cada corte sobre el peso frío del lote. Se resaltan las diferencias de {UMBRAL_PP} punto o más frente a la mediana de los demás lotes.
        </p>
        <div className="flex rounded-md border border-border p-0.5">
          {(['pct', 'kg'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={cn('rounded px-3 py-1 text-xs font-medium', modo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {m === 'pct' ? '% sobre frío' : 'Kilos'}
            </button>
          ))}
        </div>
      </div>
      <div className="scrollbar-app max-h-[60vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={cn(th, 'sticky left-0 z-20 min-w-64 text-left')}>Corte</th>
              {lotes.map((l) => (
                <th key={l.id} className={cn(th, 'min-w-24')} title={`${l.cliente} · ${l.fecha}`}>
                  {op(l.opNumber)}
                </th>
              ))}
              <th className={cn(th, 'min-w-28')}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.codigo} className="hover:bg-muted/30">
                <td className={cn(td, 'sticky left-0 bg-card text-left')}>
                  <span className="mr-2 text-xs text-muted-foreground">{f.codigo}</span>
                  {f.nombre}
                </td>
                {f.valores.map((v, i) => (
                  <td
                    key={lotes[i].id}
                    className={cn(
                      td,
                      f.marcas[i] > 0 && 'bg-emerald-50 font-semibold text-emerald-800',
                      f.marcas[i] < 0 && 'bg-red-50 font-semibold text-red-800',
                      v.kg === 0 && 'text-muted-foreground/50',
                    )}
                    title={f.marcas[i] ? `${f.marcas[i] > 0 ? '+' : ''}${f.marcas[i].toFixed(2)} pp frente a la mediana` : undefined}
                  >
                    {v.kg === 0 ? '—' : modo === 'pct' ? porc(v.pct) : num(v.kg, 2)}
                  </td>
                ))}
                <td className={cn(td, 'font-semibold')}>{modo === 'pct' ? porc(f.pctTotal) : num(f.kg, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="bg-muted font-semibold">
              <td className={cn(td, 'sticky left-0 bg-muted text-left')}>Total lote</td>
              {lotes.map((l) => (
                <td key={l.id} className={td}>
                  {modo === 'pct' ? porc(l.rendimiento) : num(l.kgProducido, 2)}
                </td>
              ))}
              <td className={td}>{modo === 'pct' ? porc(d.rendimiento) : num(d.kgProducidoCerrados, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

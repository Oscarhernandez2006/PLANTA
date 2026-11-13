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
import { ArrowDownToLine, ArrowUpFromLine, Beef, ChevronDown, ChevronRight, Gauge, PackageCheck, Receipt, TrendingDown, TrendingUp, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { cn, plantToday } from '@/lib/utils';
import { pct, useTallerAcondicionamiento, type ProcesoAcond } from './api';
import { ComparativoAcond, ConsolidadoAcond } from './acond-mensual';
import { BotonFacturacion, GastosProceso, millones, Pendientes, Utilidad } from './finanzas-ui';
import { pesos, pesosDec } from './maestros-api';
import {
  AMBAR,
  AZUL,
  clientesDe,
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
  type Alerta,
} from './ui';

const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'procesos', label: 'Procesos' },
  { value: 'comparativo', label: 'Comparativo mensual' },
  { value: 'consolidado', label: 'Consolidado mensual' },
];

const PROCESO_LABEL: Record<ProcesoAcond['procesos'][number], string> = {
  porcionado: 'Porcionado',
  inyectado: 'Inyectado',
};
const ot = (n: number) => `OT ${n}`;

export function TallerAcondicionamientoPage() {
  const periodo = usePeriodo();
  const [cliente, setCliente] = useState('');
  const [tab, setTab] = useState('resumen');
  const [anio, setAnio] = useState(() => plantToday().slice(0, 4));
  const [mes, setMes] = useState(() => plantToday().slice(0, 7));
  const [margen, setMargen] = useState(10);
  const rango =
    tab === 'comparativo'
      ? { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
      : tab === 'consolidado'
        ? rangoDeMes(mes)
        : periodo;
  const q = useTallerAcondicionamiento(rango.desde, rango.hasta, margen);
  const procesos = useMemo(() => (q.data ?? []).filter((p) => !cliente || p.clienteId === cliente), [q.data, cliente]);
  const d = useMemo(() => resumir(procesos), [procesos]);
  const periodoAlterno =
    tab === 'comparativo' ? <SelectorAnio anio={anio} setAnio={setAnio} /> : tab === 'consolidado' ? <SelectorMes mes={mes} setMes={setMes} /> : undefined;

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Encabezado
        titulo="Taller de acondicionamiento"
        descripcion="Entrada trasladada a proceso frente a producto acondicionado, por orden de traslado y orden de acondicionamiento."
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

      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={PackageCheck} label="Procesos" value={num(d.filas.length)} detalle={d.enCurso ? `${d.enCurso} en curso` : 'Todos cerrados'} />
        <Kpi icon={ArrowDownToLine} label="Entrada" value={kg(d.entrada, 0)} detalle={`${num(d.lotesOrigen)} lotes de desposte de origen`} />
        <Kpi icon={ArrowUpFromLine} label="Salida" value={kg(d.salida, 0)} detalle={`${num(d.etiquetas)} etiquetas`} />
        <Kpi icon={Gauge} label="Rendimiento" tone="text-[#156F21]" value={porc(d.rendimiento)} detalle="Salida sobre entrada" />
        <Kpi
          icon={TrendingDown}
          label={d.merma >= 0 ? 'Merma' : 'Ganancia'}
          tone={d.merma >= 0 ? undefined : 'text-[#156F21]'}
          value={kg(Math.abs(d.merma))}
          detalle={porc(d.mermaPct == null ? null : Math.abs(d.mermaPct))}
        />
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Receipt} label="Venta" value={millones(d.fin.venta)} detalle={d.salidaC ? `${pesosDec(d.fin.venta / d.salidaC)} por kg` : undefined} />
        <Kpi icon={Beef} label="Materia prima" value={millones(d.fin.costoMP)} detalle={d.fin.entrada ? `${pesosDec(d.fin.costoMP / d.fin.entrada)} por kg de entrada` : undefined} />
        <Kpi icon={Wrench} label="Servicios y empaques" value={millones(d.fin.gastos)} detalle={d.salidaC ? `${pesosDec(d.fin.gastos / d.salidaC)} por kg de salida` : undefined} />
        <Kpi
          icon={TrendingUp}
          label="Utilidad"
          tone={d.fin.utilidad >= 0 ? 'text-[#156F21]' : 'text-red-700'}
          value={millones(d.fin.utilidad)}
          detalle={d.fin.parciales ? `${d.fin.parciales} proceso(s) con datos incompletos` : d.fin.venta ? `Margen ${porc((d.fin.utilidad * 100) / d.fin.venta, 1)}` : 'Sin venta: carga la lista de precios'}
        />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="shrink-0" />
      {tab === 'resumen' && <Resumen d={d} />}
      {tab === 'procesos' && <TablaProcesos d={d} margen={margen} setMargen={setMargen} />}
      {tab === 'comparativo' && <ComparativoAcond filas={d.filas} anio={anio} />}
      {tab === 'consolidado' && (
        <ConsolidadoAcond d={d} mes={mes} cliente={clientesDe(q.data).find((c) => c.id === cliente)?.nombre ?? null} />
      )}
    </div>
  );
}

export type ResumenAcond = ReturnType<typeof resumir>;
type Resumen = ResumenAcond;

function resumir(procesos: ProcesoAcond[]) {
  const filas = procesos.map((p) => ({
    ...p,
    merma: p.entradaKg - p.salidaKg,
    rendimiento: pct(p.salidaKg, p.entradaKg),
    mermaPct: pct(p.entradaKg - p.salidaKg, p.entradaKg),
    sinSalida: p.etiquetas === 0,
  }));
  // Rendimiento solo con procesos que ya tienen producto etiquetado.
  const conSalida = filas.filter((f) => !f.sinSalida);
  const entradaC = conSalida.reduce((s, f) => s + f.entradaKg, 0);
  const salidaC = conSalida.reduce((s, f) => s + f.salidaKg, 0);
  const rendimiento = pct(salidaC, entradaC);

  const porDia = new Map<string, { fecha: string; entrada: number; salida: number }>();
  for (const f of filas) {
    const v = porDia.get(f.fecha) ?? { fecha: f.fecha, entrada: 0, salida: 0 };
    v.entrada += f.entradaKg;
    v.salida += f.salidaKg;
    porDia.set(f.fecha, v);
  }

  const porTipo = new Map<string, { tipo: string; entrada: number; salida: number }>();
  for (const f of conSalida) {
    const tipo = f.procesos.map((p) => PROCESO_LABEL[p]).join(' + ');
    const v = porTipo.get(tipo) ?? { tipo, entrada: 0, salida: 0 };
    v.entrada += f.entradaKg;
    v.salida += f.salidaKg;
    porTipo.set(tipo, v);
  }

  const salidas = new Map<string, { codigo: string; nombre: string; kg: number; unds: number }>();
  for (const f of conSalida) {
    for (const p of f.salidas) {
      const v = salidas.get(p.codigo) ?? { codigo: p.codigo, nombre: p.nombre, kg: 0, unds: 0 };
      v.kg += p.kg;
      v.unds += p.unds;
      salidas.set(p.codigo, v);
    }
  }

  const alertas: Alerta[] = [];
  for (const f of filas) {
    const nombre = `${ot(f.otNumber)} (OC ${f.ocNumbers.join(', ')})`;
    if (f.sinSalida) {
      alertas.push({ nivel: 'media', texto: `${nombre} aún no tiene producto etiquetado.` });
      continue;
    }
    const inyectado = f.procesos.includes('inyectado');
    if (f.merma < 0 && !inyectado) {
      alertas.push({ nivel: 'alta', texto: `${nombre}: la salida supera la entrada en ${kg(-f.merma)} sin ser inyectado. Revisar pesajes.` });
    } else if (!inyectado && f.mermaPct != null && f.mermaPct > 5) {
      alertas.push({ nivel: f.mermaPct > 10 ? 'alta' : 'media', texto: `${nombre}: merma de ${porc(f.mermaPct)} (${kg(f.merma)}).` });
    }
    if (f.activo) alertas.push({ nivel: 'media', texto: `${nombre} sigue activa: el resultado puede cambiar.` });
  }

  const entrada = filas.reduce((s, f) => s + f.entradaKg, 0);
  const salida = filas.reduce((s, f) => s + f.salidaKg, 0);
  const conFin = conSalida.filter((f) => f.finanzas);
  const fin = {
    venta: conFin.reduce((s, f) => s + f.finanzas!.venta, 0),
    costoMP: conFin.reduce((s, f) => s + f.finanzas!.costoMP, 0),
    gastos: conFin.reduce((s, f) => s + f.finanzas!.totalGastos, 0),
    utilidad: conFin.reduce((s, f) => s + f.finanzas!.utilidad, 0),
    entrada: conFin.reduce((s, f) => s + f.entradaKg, 0),
    parciales: conFin.filter((f) => f.finanzas!.pendientes.length).length,
  };
  return {
    filas,
    fin,
    enCurso: filas.filter((f) => f.activo).length,
    entrada,
    salida,
    etiquetas: filas.reduce((s, f) => s + f.etiquetas, 0),
    lotesOrigen: new Set(filas.flatMap((f) => f.lotesOrigen)).size,
    rendimiento,
    merma: entradaC - salidaC,
    mermaPct: pct(entradaC - salidaC, entradaC),
    salidaC,
    dias: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    tipos: [...porTipo.values()].map((t) => ({ ...t, rendimiento: pct(t.salida, t.entrada) ?? 0 })),
    ranking: [...salidas.values()].sort((a, b) => b.kg - a.kg),
    alertas,
  };
}

function Resumen({ d }: { d: Resumen }) {
  const porProceso = d.filas
    .filter((f) => !f.sinSalida)
    .map((f) => ({ proceso: ot(f.otNumber), entrada: f.entradaKg, salida: f.salidaKg, rendimiento: f.rendimiento ?? 0, inyectado: f.procesos.includes('inyectado') }));
  const top = d.ranking.slice(0, 10).map((p) => ({
    ...p,
    corto: p.nombre.length > 26 ? `${p.nombre.slice(0, 25)}…` : p.nombre,
    part: d.salidaC ? (p.kg * 100) / d.salidaC : 0,
  }));
  const alto = 'h-72';

  return (
    <div className="grid shrink-0 grid-cols-1 gap-4 pb-2 xl:grid-cols-2">
      <Grafica titulo="Entrada y salida por proceso" subtitulo="Línea: rendimiento (eje derecho)">
        <div className={alto}>
          {porProceso.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={porProceso} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="proceso" fontSize={11} />
                <YAxis yAxisId="kg" fontSize={11} width={56} tickFormatter={(v: number) => num(v)} />
                <YAxis yAxisId="pct" orientation="right" fontSize={11} width={44} unit="%" domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, n) => (n === 'rendimiento' ? [porc(v), 'Rendimiento'] : [kg(v), n === 'entrada' ? 'Entrada' : 'Salida'])}
                />
                <Legend formatter={(v: string) => ({ entrada: 'Entrada (kg)', salida: 'Salida (kg)', rendimiento: 'Rendimiento' } as Record<string, string>)[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="kg" dataKey="entrada" fill={GRIS} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="kg" dataKey="salida" fill={VERDE_CLARO} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Line yAxisId="pct" type="monotone" dataKey="rendimiento" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <PanelAlertas alertas={d.alertas} />

      <Grafica titulo="Rendimiento por proceso" subtitulo="Ámbar: inyectado (gana peso) · Rojo: por debajo del promedio">
        <div className={alto}>
          {porProceso.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porProceso} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="proceso" fontSize={11} />
                <YAxis fontSize={11} width={44} unit="%" domain={[(min: number) => Math.max(0, Math.floor(min - 5)), 'auto']} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [porc(v), 'Rendimiento']} />
                {d.rendimiento != null && <ReferenceLine y={d.rendimiento} stroke={GRIS} strokeDasharray="4 4" />}
                <ReferenceLine y={100} stroke={AZUL} strokeOpacity={0.4} />
                <Bar dataKey="rendimiento" radius={[3, 3, 0, 0]} maxBarSize={56}>
                  {porProceso.map((p) => (
                    <Cell
                      key={p.proceso}
                      fill={p.inyectado ? AMBAR : d.rendimiento != null && p.rendimiento < d.rendimiento - 1 ? ROJO : VERDE_MEDIO}
                    />
                  ))}
                  <LabelList dataKey="rendimiento" position="top" fontSize={10} formatter={(v: number) => v.toFixed(1)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Kilos procesados por día">
        <div className={alto}>
          {d.dias.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.dias} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha" tickFormatter={etiquetaDia} fontSize={11} />
                <YAxis fontSize={11} width={56} tickFormatter={(v: number) => num(v)} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => etiquetaDia(String(v))} formatter={(v: number, n) => [kg(v), n === 'entrada' ? 'Entrada' : 'Salida']} />
                <Legend formatter={(v) => (v === 'entrada' ? 'Entrada (kg)' : 'Salida (kg)')} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="entrada" fill={GRIS} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="salida" fill={VERDE} radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Por tipo de proceso">
        <div className={alto}>
          {d.tipos.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.tipos} layout="vertical" margin={{ top: 0, right: 90, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} tickFormatter={(v: number) => num(v)} />
                <YAxis type="category" dataKey="tipo" fontSize={12} width={130} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [kg(v), n === 'entrada' ? 'Entrada' : 'Salida']} />
                <Legend formatter={(v) => (v === 'entrada' ? 'Entrada (kg)' : 'Salida (kg)')} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="entrada" fill={GRIS} radius={[0, 3, 3, 0]} maxBarSize={22} />
                <Bar dataKey="salida" fill={VERDE_CLARO} radius={[0, 3, 3, 0]} maxBarSize={22}>
                  <LabelList dataKey="rendimiento" position="right" fontSize={10} formatter={(v: number) => `${v.toFixed(1)} %`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Productos acondicionados" subtitulo="Productos con más kilos y su participación en la salida">
        <div className={alto}>
          {top.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 0, right: 64, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} tickFormatter={(v: number) => num(v)} />
                <YAxis type="category" dataKey="corto" fontSize={11} width={180} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [kg(v), 'Salida']} />
                <Bar dataKey="kg" fill={VERDE} radius={[0, 3, 3, 0]} maxBarSize={20}>
                  <LabelList dataKey="part" position="right" fontSize={10} formatter={(v: number) => `${v.toFixed(1)} %`} />
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

function TablaProcesos({ d, margen, setMargen }: { d: Resumen; margen: number; setMargen: (v: number) => void }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const th = 'border-b border-border bg-muted px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-2 py-2 text-right tabular-nums';
  if (!d.filas.length) return <Card className="p-6"><SinDatos /></Card>;

  return (
    <Card className="shrink-0 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">Toca un proceso para ver su costo por producto, el precio sugerido y los servicios cobrados.</p>
        <div className="flex items-center gap-2">
          <Label htmlFor="ac-margen" className="whitespace-nowrap">Margen objetivo</Label>
          <Input
            id="ac-margen"
            type="number"
            min={0}
            max={95}
            className="h-9 w-20 text-right"
            defaultValue={margen}
            onBlur={(e) => {
              const v = Math.min(95, Math.max(0, Number(e.target.value) || 0));
              if (v !== margen) setMargen(v);
            }}
          />
          <span className="text-sm">%</span>
        </div>
      </div>
      <div className="scrollbar-app overflow-x-auto">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'text-left')}>Traslado</th>
              <th className={cn(th, 'text-left')}>Fecha</th>
              <th className={cn(th, 'text-left')}>Cliente</th>
              <th className={cn(th, 'text-left')}>Proceso</th>
              <th className={cn(th, 'text-left')}>Lotes origen</th>
              <th className={th}>Entrada</th>
              <th className={th}>Salida</th>
              <th className={th}>Rendimiento</th>
              <th className={th}>Merma</th>
              <th className={th}>Venta</th>
              <th className={th}>Utilidad</th>
              <th className={th}>Etiquetas</th>
              <th className={cn(th, 'text-center')}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {d.filas.map((f) => {
              const abierto = abiertos.has(f.otId);
              return (
                <Fragment key={f.otId}>
                  <tr
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() =>
                      setAbiertos((prev) => {
                        const next = new Set(prev);
                        if (next.has(f.otId)) next.delete(f.otId);
                        else next.add(f.otId);
                        return next;
                      })
                    }
                  >
                    <td className={cn(td, 'text-left font-semibold')}>
                      <span className="inline-flex items-center gap-1">
                        {abierto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        {ot(f.otNumber)}
                        <span className="text-xs font-normal text-muted-foreground">· OC {f.ocNumbers.join(', ')}</span>
                      </span>
                    </td>
                    <td className={cn(td, 'text-left')}>{etiquetaDia(f.fecha)}</td>
                    <td className={cn(td, 'max-w-52 truncate text-left')} title={f.cliente}>{f.cliente}</td>
                    <td className={cn(td, 'text-left')}>{f.procesos.map((p) => PROCESO_LABEL[p]).join(' + ')}</td>
                    <td className={cn(td, 'text-left')}>{f.lotesOrigen.length ? f.lotesOrigen.map((n) => `OP ${n}`).join(', ') : '—'}</td>
                    <td className={td}>{kg(f.entradaKg)}</td>
                    <td className={td}>{f.sinSalida ? '—' : kg(f.salidaKg)}</td>
                    <td className={cn(td, 'font-semibold text-[#156F21]')}>{f.sinSalida ? '—' : porc(f.rendimiento)}</td>
                    <td className={cn(td, f.merma < 0 && 'text-[#156F21]')}>
                      {f.sinSalida ? '—' : `${f.merma < 0 ? '+' : ''}${kg(Math.abs(f.merma))} · ${porc(f.mermaPct == null ? null : Math.abs(f.mermaPct), 1)}`}
                    </td>
                    <td className={td}>{f.finanzas && !f.sinSalida ? pesos(f.finanzas.venta) : '—'}</td>
                    <td className={td}>
                      {f.finanzas && !f.sinSalida ? (
                        <Utilidad valor={f.finanzas.utilidad} margen={f.finanzas.margen} parcial={f.finanzas.pendientes.length > 0} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={td}>{num(f.etiquetas)}</td>
                    <td className={cn(td, 'text-center')}>
                      {f.sinSalida ? <Badge tone="warning">Sin salida</Badge> : f.activo ? <Badge tone="info">Activa</Badge> : <Badge tone="success">Cerrada</Badge>}
                    </td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={13} className="border-b border-border bg-muted/20 px-6 py-3">
                        <DetalleProceso proceso={f} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60 font-semibold">
              <td className={cn(td, 'text-left')} colSpan={5}>Total del periodo</td>
              <td className={td}>{kg(d.entrada)}</td>
              <td className={td}>{kg(d.salida)}</td>
              <td className={cn(td, 'text-[#156F21]')}>{porc(d.rendimiento)}</td>
              <td className={td}>{`${d.merma < 0 ? '+' : ''}${kg(Math.abs(d.merma))} · ${porc(d.mermaPct == null ? null : Math.abs(d.mermaPct), 1)}`}</td>
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

function DetalleProceso({ proceso: f }: { proceso: Resumen['filas'][number] }) {
  const fin = f.finanzas;
  const fe = new Map((fin?.entradas ?? []).map((e) => [e.codigo, e]));
  const fs = new Map((fin?.cortes ?? []).map((c) => [c.codigo, c]));
  const th = 'px-2 py-1 text-xs uppercase text-muted-foreground';
  const td = 'px-2 py-1.5 text-right tabular-nums';
  return (
    <div className="space-y-3">
      {fin && f.salidas.length > 0 && (
        <BotonFacturacion
          documento={{
            taller: 'ACONDICIONAMIENTO',
            numero: `OT ${f.otNumber}`,
            fecha: f.fecha,
            cliente: f.cliente,
            referencia: `OC ${f.ocNumbers.join(', ')} · ${f.procesos.map((p) => PROCESO_LABEL[p]).join(' + ')} · entrada ${kg(f.entradaKg)}`,
            productos: [...f.salidas]
              .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
              .map((p) => {
                const c = fs.get(p.codigo);
                return { codigo: p.codigo, nombre: p.nombre, unds: p.unds, kg: p.kg, precioKg: c?.precioKg ?? 0, valor: c?.venta ?? 0 };
              }),
            servicios: fin.gastos,
          }}
        />
      )}
      {fin && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ['Venta', pesos(fin.venta)],
            ['Materia prima', pesos(fin.costoMP)],
            ['Servicios y empaques', pesos(fin.totalGastos)],
            ['Costo total', pesos(fin.costoTotal)],
          ].map(([t, v]) => (
            <div key={t} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[11px] uppercase text-muted-foreground">{t}</p>
              <p className="font-semibold tabular-nums">{v}</p>
            </div>
          ))}
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">Utilidad</p>
            <Utilidad valor={fin.utilidad} margen={fin.margen} parcial={fin.pendientes.length > 0} />
          </div>
        </div>
      )}
      {fin && <Pendientes items={fin.pendientes} />}
      <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entrada (traslado)</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Producto</th>
                <th className={cn(th, 'text-right')}>Kg</th>
                <th className={cn(th, 'text-right')}>Part.</th>
                <th className={cn(th, 'text-right')}>Costo / kg</th>
              </tr>
            </thead>
            <tbody>
              {[...f.entradas].sort((a, b) => b.kg - a.kg).map((p) => (
                <tr key={p.codigo} className="border-t border-border/60">
                  <td className="px-2 py-1.5">
                    <span className="mr-2 text-xs text-muted-foreground">{p.codigo}</span>
                    {p.nombre}
                  </td>
                  <td className={td}>{kg(p.kg, 2)}</td>
                  <td className={td}>{porc(pct(p.kg, f.entradaKg), 1)}</td>
                  <td className={td}>{fe.get(p.codigo)?.costoKg != null ? pesosDec(fe.get(p.codigo)!.costoKg!) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Salida (acondicionado) · precio sugerido con margen del {fin?.margenObjetivo ?? 10} %
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Producto</th>
                <th className={cn(th, 'text-right')}>Kg</th>
                <th className={cn(th, 'text-right')}>Rend.</th>
                <th className={cn(th, 'text-right')}>Precio / kg</th>
                <th className={cn(th, 'text-right')}>Venta</th>
                <th className={cn(th, 'text-right')}>Costo MP / kg</th>
                <th className={cn(th, 'text-right')}>Costo total / kg</th>
                <th className={cn(th, 'text-right')}>Precio sugerido</th>
              </tr>
            </thead>
            <tbody>
              {[...f.salidas].sort((a, b) => b.kg - a.kg).map((p) => {
                const c = fs.get(p.codigo);
                const bajo = c && c.precioKg > 0 && c.precioSugeridoKg != null && c.precioKg < c.precioSugeridoKg;
                return (
                  <tr key={p.codigo} className="border-t border-border/60">
                    <td className="px-2 py-1.5">
                      <span className="mr-2 text-xs text-muted-foreground">{p.codigo}</span>
                      {p.nombre}
                    </td>
                    <td className={td}>{kg(p.kg, 2)}</td>
                    <td className={td}>{porc(pct(p.kg, f.entradaKg), 1)}</td>
                    <td className={cn(td, (!c || c.precioKg <= 0) && 'text-amber-700', bajo && 'text-red-700')} title={bajo ? 'Por debajo del precio sugerido' : undefined}>
                      {c && c.precioKg > 0 ? pesosDec(c.precioKg) : 'Sin precio'}
                    </td>
                    <td className={td}>{c ? pesos(c.venta) : '—'}</td>
                    <td className={td}>{c?.costoMpKg != null ? pesosDec(c.costoMpKg) : '—'}</td>
                    <td className={td}>{c?.costoIntegralKg != null ? pesosDec(c.costoIntegralKg) : '—'}</td>
                    <td className={cn(td, 'font-semibold text-[#156F21]')}>{c?.precioSugeridoKg != null ? pesosDec(c.precioSugeridoKg) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {fin && (
        <div className="max-w-3xl">
          <GastosProceso gastos={fin.gastos} refServicios={{ transferOrderId: f.otId }} clienteId={f.clienteId} tipo="acond" />
        </div>
      )}
    </div>
  );
}

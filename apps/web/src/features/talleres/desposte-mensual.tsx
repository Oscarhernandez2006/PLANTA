import { useMemo, useState } from 'react';
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
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, plantToday } from '@/lib/utils';
import { pct } from './api';
import { descargarExcel, FMT_ENTERO, FMT_KG, FMT_PCT, FMT_PESOS } from './excel';
import { Utilidad } from './finanzas-ui';
import { pesos } from './maestros-api';
import type { Resumen } from './TallerDespostePage';
import {
  AZUL,
  etiquetaDia,
  etiquetaMes,
  GRIS,
  Grafica,
  kg,
  num,
  porc,
  ROJO,
  SinDatos,
  tooltipStyle,
  VERDE_CLARO,
  VERDE_MEDIO,
} from './ui';

type Lote = Resumen['lotes'][number];
const op = (n: number) => `OP ${n}`;
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

interface Mes {
  ym: string;
  lotes: Lote[];
  canales: number;
  kgFrio: number;
  kgProducido: number;
  rendimiento: number | null;
  tca: number | null;
  kgCanal: number | null;
  venta: number;
  utilidad: number;
  varProduccion: number | null;
  varRendimiento: number | null;
}

/** Agrega los lotes por mes y calcula la variación frente al mes anterior con datos. */
function porMes(lotes: Lote[], anio: string): Mes[] {
  const hoy = plantToday();
  const ultimo = anio === hoy.slice(0, 4) ? Number(hoy.slice(5, 7)) : 12;
  const meses: Mes[] = [];
  let previo: Mes | null = null;
  for (let m = 1; m <= ultimo; m++) {
    const ym = `${anio}-${String(m).padStart(2, '0')}`;
    const delMes = lotes.filter((l) => l.fecha.startsWith(ym));
    const cerrados = delMes.filter((l) => !l.enProceso);
    const frioC = cerrados.reduce((s, l) => s + l.kgFrio, 0);
    const prodC = cerrados.reduce((s, l) => s + l.kgProducido, 0);
    const retC = cerrados.reduce((s, l) => s + l.kgRetoma, 0);
    const canales = delMes.reduce((s, l) => s + l.canales, 0);
    const kgFrio = delMes.reduce((s, l) => s + l.kgFrio, 0);
    const actual: Mes = {
      ym,
      lotes: delMes,
      canales,
      kgFrio,
      kgProducido: delMes.reduce((s, l) => s + l.kgProducido, 0),
      rendimiento: pct(prodC, frioC),
      tca: pct(frioC - retC, frioC),
      kgCanal: canales ? kgFrio / canales : null,
      venta: cerrados.reduce((s, l) => s + (l.finanzas?.venta ?? 0), 0),
      utilidad: cerrados.reduce((s, l) => s + (l.finanzas?.utilidad ?? 0), 0),
      varProduccion: null,
      varRendimiento: null,
    };
    if (previo && delMes.length) {
      actual.varProduccion = previo.kgProducido ? (actual.kgProducido / previo.kgProducido - 1) * 100 : null;
      actual.varRendimiento =
        actual.rendimiento != null && previo.rendimiento != null ? actual.rendimiento - previo.rendimiento : null;
    }
    meses.push(actual);
    if (delMes.length) previo = actual;
  }
  return meses;
}

function Variacion({ v, unidad }: { v: number | null; unidad: '%' | 'pp' }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const txt = `${v > 0 ? '+' : ''}${v.toLocaleString('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${unidad}`;
  return <span className={cn('font-medium', v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-700' : '')}>{txt}</span>;
}

export function ComparativoDesposte({ lotes, anio }: { lotes: Lote[]; anio: string }) {
  const meses = useMemo(() => porMes(lotes, anio), [lotes, anio]);
  const conDatos = meses.filter((m) => m.lotes.length);
  const [activo, setActivo] = useState<string | null>(null);
  const mesActivo = meses.find((m) => m.ym === activo) ?? conDatos.at(-1) ?? null;
  const grafica = meses.map((m) => ({
    mes: etiquetaMes(m.ym).split(' ')[0],
    kgProducido: m.kgProducido,
    rendimiento: m.rendimiento,
    tca: m.tca,
  }));
  const lotesMes = (mesActivo?.lotes ?? [])
    .filter((l) => !l.enProceso)
    .map((l) => ({ lote: op(l.opNumber), rendimiento: l.rendimiento ?? 0 }));
  const th = 'border-b border-border bg-muted px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-2 py-2 text-right tabular-nums';

  if (!conDatos.length) return <Card className="p-6"><SinDatos texto={`Sin lotes despostados en ${anio}`} /></Card>;

  return (
    <div className="grid shrink-0 grid-cols-1 gap-4 pb-2 xl:grid-cols-2">
      <Grafica titulo={`Producción y rendimiento ${anio}`} subtitulo="Barras: kg etiquetados · Líneas: rendimiento y TCA" className="xl:col-span-2">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={grafica} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis yAxisId="kg" fontSize={11} width={64} tickFormatter={(v: number) => num(v)} />
              <YAxis yAxisId="pct" orientation="right" fontSize={11} width={44} unit="%" domain={[(min: number) => Math.max(0, Math.floor(min - 5)), 100]} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, n) => (n === 'kgProducido' ? [kg(v), 'Producción'] : [porc(v), n === 'tca' ? 'TCA' : 'Rendimiento'])}
              />
              <Legend formatter={(v: string) => ({ kgProducido: 'Producción (kg)', rendimiento: 'Rendimiento', tca: 'TCA' } as Record<string, string>)[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="kg" dataKey="kgProducido" fill={VERDE_CLARO} radius={[3, 3, 0, 0]} maxBarSize={56} />
              <Line yAxisId="pct" type="monotone" dataKey="rendimiento" stroke={VERDE_MEDIO} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              <Line yAxisId="pct" type="monotone" dataKey="tca" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Grafica>

      <Card className="overflow-hidden xl:col-span-2">
        <div className="scrollbar-app overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Mes</th>
                <th className={th}>Lotes</th>
                <th className={th}>Canales</th>
                <th className={th}>Frío</th>
                <th className={th}>Producción</th>
                <th className={th}>Var. producción</th>
                <th className={th}>Rendimiento</th>
                <th className={th}>Var. rendimiento</th>
                <th className={th}>TCA</th>
                <th className={th}>Kg / canal</th>
                <th className={th}>Venta</th>
                <th className={th}>Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr
                  key={m.ym}
                  onClick={() => m.lotes.length && setActivo(m.ym)}
                  className={cn(
                    m.lotes.length ? 'cursor-pointer hover:bg-muted/40' : 'text-muted-foreground',
                    mesActivo?.ym === m.ym && 'bg-emerald-50',
                  )}
                >
                  <td className={cn(td, 'text-left font-semibold capitalize')}>{etiquetaMes(m.ym)}</td>
                  <td className={td}>{m.lotes.length || '—'}</td>
                  <td className={td}>{m.lotes.length ? num(m.canales, m.canales % 1 ? 1 : 0) : '—'}</td>
                  <td className={td}>{m.lotes.length ? kg(m.kgFrio, 0) : '—'}</td>
                  <td className={td}>{m.lotes.length ? kg(m.kgProducido, 0) : '—'}</td>
                  <td className={td}><Variacion v={m.varProduccion} unidad="%" /></td>
                  <td className={cn(td, 'font-semibold text-[#156F21]')}>{porc(m.rendimiento)}</td>
                  <td className={td}><Variacion v={m.varRendimiento} unidad="pp" /></td>
                  <td className={td}>{porc(m.tca)}</td>
                  <td className={td}>{m.kgCanal ? kg(m.kgCanal) : '—'}</td>
                  <td className={td}>{m.lotes.length ? pesos(m.venta) : '—'}</td>
                  <td className={td}>{m.lotes.length ? <Utilidad valor={m.utilidad} margen={m.venta ? (m.utilidad * 100) / m.venta : null} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {mesActivo && (
        <Grafica
          titulo={`Lotes de ${etiquetaMes(mesActivo.ym)}`}
          subtitulo="Rendimiento por lote frente al promedio del mes · Toca un mes en la tabla para cambiarlo"
          className="xl:col-span-2"
        >
          <div className="h-72">
            {lotesMes.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lotesMes} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="lote" fontSize={11} />
                  <YAxis fontSize={11} width={44} unit="%" domain={[(min: number) => Math.max(0, Math.floor(min - 5)), 100]} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [porc(v), 'Rendimiento']} />
                  {mesActivo.rendimiento != null && <ReferenceLine y={mesActivo.rendimiento} stroke={GRIS} strokeDasharray="4 4" />}
                  <Bar dataKey="rendimiento" radius={[3, 3, 0, 0]} maxBarSize={56}>
                    {lotesMes.map((l) => (
                      <Cell key={l.lote} fill={mesActivo.rendimiento != null && l.rendimiento < mesActivo.rendimiento - 1 ? ROJO : VERDE_MEDIO} />
                    ))}
                    <LabelList dataKey="rendimiento" position="top" fontSize={10} formatter={(v: number) => v.toFixed(1)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SinDatos texto="Los lotes del mes aún no tienen etiquetas" />
            )}
          </div>
        </Grafica>
      )}
    </div>
  );
}

export function ConsolidadoDesposte({ d, mes, cliente }: { d: Resumen; mes: string; cliente: string | null }) {
  const [exportando, setExportando] = useState(false);
  const porCliente = useMemo(() => {
    const m = new Map<string, { cliente: string; lotes: number; canales: number; kgFrio: number; kgProducido: number; kgFrioC: number; kgProdC: number }>();
    for (const l of d.lotes) {
      const v = m.get(l.clienteId) ?? { cliente: l.cliente, lotes: 0, canales: 0, kgFrio: 0, kgProducido: 0, kgFrioC: 0, kgProdC: 0 };
      v.lotes += 1;
      v.canales += l.canales;
      v.kgFrio += l.kgFrio;
      v.kgProducido += l.kgProducido;
      if (!l.enProceso) {
        v.kgFrioC += l.kgFrio;
        v.kgProdC += l.kgProducido;
      }
      m.set(l.clienteId, v);
    }
    return [...m.values()].map((v) => ({ ...v, rendimiento: pct(v.kgProdC, v.kgFrioC) })).sort((a, b) => b.kgFrio - a.kgFrio);
  }, [d.lotes]);

  async function exportar() {
    setExportando(true);
    try {
      const titulo = `Consolidado mensual de desposte — ${etiquetaMes(mes)}${cliente ? ` — ${cliente}` : ''}`;
      const cortes = d.lotes.flatMap((l) =>
        l.productos.map((p) => {
          const f = l.finanzas?.cortes.find((c) => c.codigo === p.codigo);
          return { l, p, f, rend: pct(p.kg, l.kgFrio), part: pct(p.kg, l.kgProducido) };
        }),
      );
      const gastos = d.lotes.flatMap((l) => (l.finanzas?.gastos ?? []).map((g) => ({ l, g })));
      await descargarExcel(`Consolidado desposte ${mes}${cliente ? ` ${cliente}` : ''}.xlsx`, [
        {
          nombre: 'Lotes',
          titulo,
          columnas: [
            { titulo: 'Fecha desposte', valor: (l: Lote) => l.fecha, ancho: 13 },
            { titulo: 'Fecha sacrificio', valor: (l: Lote) => l.fechaSacrificio, ancho: 13 },
            { titulo: 'OP', valor: (l: Lote) => l.opNumber, ancho: 8 },
            { titulo: 'OD', valor: (l: Lote) => l.odNumber, ancho: 8 },
            { titulo: 'Cliente', valor: (l: Lote) => l.cliente, ancho: 34 },
            { titulo: 'Canales', valor: (l: Lote) => l.canales, formato: '#,##0.0' },
            { titulo: 'Kg caliente', valor: (l: Lote) => l.kgCaliente, formato: FMT_KG },
            { titulo: 'Kg frío', valor: (l: Lote) => l.kgFrio, formato: FMT_KG },
            { titulo: 'Oreo %', valor: (l: Lote) => r2(l.oreoPct), formato: FMT_PCT },
            { titulo: 'Kg producidos', valor: (l: Lote) => l.kgProducido, formato: FMT_KG },
            { titulo: 'Diferencia kg', valor: (l: Lote) => r2(l.mermaKg), formato: FMT_KG },
            { titulo: 'Diferencia %', valor: (l: Lote) => r2(l.mermaPct), formato: FMT_PCT },
            { titulo: 'Rendimiento %', valor: (l: Lote) => r2(l.rendimiento), formato: FMT_PCT },
            { titulo: 'Kg retoma', valor: (l: Lote) => l.kgRetoma, formato: FMT_KG },
            { titulo: 'TCA %', valor: (l: Lote) => r2(l.tca), formato: FMT_PCT },
            { titulo: 'Kg frío / canal', valor: (l: Lote) => r2(l.kgCanal), formato: FMT_KG },
            { titulo: 'Etiquetas', valor: (l: Lote) => l.etiquetas, formato: FMT_ENTERO },
            { titulo: 'Venta $', valor: (l: Lote) => l.finanzas?.venta ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Costo ganado $', valor: (l: Lote) => l.finanzas?.costoGanado ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Gastos proceso $', valor: (l: Lote) => l.finanzas?.totalGastos ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Utilidad $', valor: (l: Lote) => l.finanzas?.utilidad ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Margen %', valor: (l: Lote) => l.finanzas?.margen ?? null, formato: FMT_PCT },
            { titulo: 'Datos faltantes', valor: (l: Lote) => l.finanzas?.pendientes.join(' ') || null, ancho: 40 },
            { titulo: 'Estado', valor: (l: Lote) => (l.enProceso ? 'En proceso' : l.status === 'facturado' ? 'Cerrada' : 'Activa'), ancho: 12 },
          ],
          filas: d.lotes,
          totales: [
            'TOTAL', null, d.lotes.length, null, null, d.canales, r2(d.kgCaliente), r2(d.kgFrio), r2(d.oreo),
            r2(d.kgProducido), r2(d.mermaKg), r2(d.mermaPct), r2(d.rendimiento), r2(d.kgRetoma), r2(d.tca),
            r2(d.kgCanal), d.etiquetas, r2(d.fin.venta), r2(d.fin.costoGanado), r2(d.fin.gastos), r2(d.fin.utilidad),
            d.fin.venta ? r2((d.fin.utilidad * 100) / d.fin.venta) : null, null, null,
          ],
        },
        {
          nombre: 'Gastos de proceso',
          titulo,
          columnas: [
            { titulo: 'OP', valor: (g: (typeof gastos)[number]) => g.l.opNumber, ancho: 8 },
            { titulo: 'Fecha', valor: (g: (typeof gastos)[number]) => g.l.fecha, ancho: 12 },
            { titulo: 'Cliente', valor: (g: (typeof gastos)[number]) => g.l.cliente, ancho: 30 },
            { titulo: 'Concepto', valor: (g: (typeof gastos)[number]) => g.g.concepto, ancho: 24 },
            { titulo: 'Cantidad', valor: (g: (typeof gastos)[number]) => g.g.cantidad, formato: FMT_KG },
            { titulo: 'Tarifa $', valor: (g: (typeof gastos)[number]) => g.g.valorUnitario, formato: FMT_PESOS },
            { titulo: 'Total $', valor: (g: (typeof gastos)[number]) => g.g.total, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Origen', valor: (g: (typeof gastos)[number]) => (g.g.manual ? 'Digitado' : 'Calculado'), ancho: 12 },
          ],
          filas: gastos,
        },
        {
          nombre: 'Por cliente',
          titulo,
          columnas: [
            { titulo: 'Cliente', valor: (c: (typeof porCliente)[number]) => c.cliente, ancho: 36 },
            { titulo: 'Lotes', valor: (c: (typeof porCliente)[number]) => c.lotes, formato: FMT_ENTERO },
            { titulo: 'Canales', valor: (c: (typeof porCliente)[number]) => c.canales, formato: '#,##0.0' },
            { titulo: 'Kg frío', valor: (c: (typeof porCliente)[number]) => r2(c.kgFrio), formato: FMT_KG },
            { titulo: 'Kg producidos', valor: (c: (typeof porCliente)[number]) => r2(c.kgProducido), formato: FMT_KG },
            { titulo: 'Rendimiento %', valor: (c: (typeof porCliente)[number]) => r2(c.rendimiento), formato: FMT_PCT },
          ],
          filas: porCliente,
        },
        {
          nombre: 'Cortes por lote',
          titulo,
          columnas: [
            { titulo: 'OP', valor: (c: (typeof cortes)[number]) => c.l.opNumber, ancho: 8 },
            { titulo: 'Fecha', valor: (c: (typeof cortes)[number]) => c.l.fecha, ancho: 12 },
            { titulo: 'Cliente', valor: (c: (typeof cortes)[number]) => c.l.cliente, ancho: 30 },
            { titulo: 'Código', valor: (c: (typeof cortes)[number]) => c.p.codigo, ancho: 10 },
            { titulo: 'Corte', valor: (c: (typeof cortes)[number]) => c.p.nombre, ancho: 36 },
            { titulo: 'Unds', valor: (c: (typeof cortes)[number]) => c.p.unds, formato: FMT_ENTERO },
            { titulo: 'Kg', valor: (c: (typeof cortes)[number]) => c.p.kg, formato: FMT_KG },
            { titulo: 'Rendimiento %', valor: (c: (typeof cortes)[number]) => r2(c.rend), formato: FMT_PCT },
            { titulo: 'Participación %', valor: (c: (typeof cortes)[number]) => r2(c.part), formato: FMT_PCT },
            { titulo: 'Kg / canal', valor: (c: (typeof cortes)[number]) => (c.l.canales ? r2(c.p.kg / c.l.canales) : null), formato: FMT_KG },
            { titulo: 'Precio / kg $', valor: (c: (typeof cortes)[number]) => c.f?.precioKg ?? null, formato: FMT_PESOS },
            { titulo: 'Venta $', valor: (c: (typeof cortes)[number]) => c.f?.venta ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Part. venta %', valor: (c: (typeof cortes)[number]) => c.f?.participacionVenta ?? null, formato: FMT_PCT },
            { titulo: 'Costo asignado $', valor: (c: (typeof cortes)[number]) => c.f?.costoAsignado ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Costo / kg $', valor: (c: (typeof cortes)[number]) => c.f?.costoKg ?? null, formato: FMT_PESOS },
          ],
          filas: cortes,
        },
        {
          nombre: 'Matriz de cortes',
          titulo: `${titulo} — % sobre peso frío`,
          columnas: [
            { titulo: 'Código', valor: (p: Resumen['ranking'][number]) => p.codigo, ancho: 10 },
            { titulo: 'Corte', valor: (p: Resumen['ranking'][number]) => p.nombre, ancho: 36 },
            ...d.cerrados.map((l) => ({
              titulo: op(l.opNumber),
              valor: (p: Resumen['ranking'][number]) => r2(pct(l.productos.find((x) => x.codigo === p.codigo)?.kg ?? 0, l.kgFrio)),
              formato: FMT_PCT,
              ancho: 10,
            })),
            { titulo: 'Total kg', valor: (p: Resumen['ranking'][number]) => r2(p.kg), formato: FMT_KG },
            { titulo: 'Total %', valor: (p: Resumen['ranking'][number]) => r2(pct(p.kg, d.kgFrioCerrados)), formato: FMT_PCT },
          ],
          filas: d.ranking,
        },
      ]);
    } finally {
      setExportando(false);
    }
  }

  const th = 'border-b border-border bg-muted px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-2 py-2 text-right tabular-nums';

  return (
    <div className="flex shrink-0 flex-col gap-4 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {d.lotes.length} lote(s) despostados en <span className="font-semibold capitalize text-foreground">{etiquetaMes(mes)}</span>
          {cliente && <> para <span className="font-semibold text-foreground">{cliente}</span></>}.
        </p>
        <Button onClick={exportar} disabled={!d.lotes.length || exportando}>
          <FileSpreadsheet className="size-4" />
          {exportando ? 'Generando…' : 'Descargar Excel'}
        </Button>
      </div>

      {!d.lotes.length ? (
        <Card className="p-6"><SinDatos texto="Sin lotes en el mes" /></Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="scrollbar-app overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(th, 'text-left')}>Fecha</th>
                    <th className={cn(th, 'text-left')}>Lote</th>
                    <th className={cn(th, 'text-left')}>Cliente</th>
                    <th className={th}>Canales</th>
                    <th className={th}>Frío</th>
                    <th className={th}>Producción</th>
                    <th className={th}>Diferencia</th>
                    <th className={th}>Rendimiento</th>
                    <th className={th}>Retoma</th>
                    <th className={th}>TCA</th>
                    <th className={th}>Venta</th>
                    <th className={th}>Costo total</th>
                    <th className={th}>Utilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lotes.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/40">
                      <td className={cn(td, 'text-left')}>{etiquetaDia(l.fecha)}</td>
                      <td className={cn(td, 'text-left font-semibold')}>
                        {op(l.opNumber)} <span className="text-xs font-normal text-muted-foreground">· OD {l.odNumber}</span>
                      </td>
                      <td className={cn(td, 'max-w-60 truncate text-left')} title={l.cliente}>{l.cliente}</td>
                      <td className={td}>{num(l.canales, l.canales % 1 ? 1 : 0)}</td>
                      <td className={td}>{kg(l.kgFrio)}</td>
                      <td className={td}>{l.enProceso ? '—' : kg(l.kgProducido)}</td>
                      <td className={td}>{l.enProceso ? '—' : `${kg(l.mermaKg)} · ${porc(l.mermaPct, 1)}`}</td>
                      <td className={cn(td, 'font-semibold text-[#156F21]')}>{l.enProceso ? '—' : porc(l.rendimiento)}</td>
                      <td className={td}>{l.enProceso ? '—' : kg(l.kgRetoma)}</td>
                      <td className={td}>{l.enProceso ? '—' : porc(l.tca)}</td>
                      <td className={td}>{l.finanzas && !l.enProceso ? pesos(l.finanzas.venta) : '—'}</td>
                      <td className={td}>{l.finanzas && !l.enProceso ? pesos(l.finanzas.costoTotal) : '—'}</td>
                      <td className={td}>
                        {l.finanzas && !l.enProceso ? (
                          <Utilidad valor={l.finanzas.utilidad} margen={l.finanzas.margen} parcial={l.finanzas.pendientes.length > 0} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/60 font-semibold">
                    <td className={cn(td, 'text-left')} colSpan={3}>Total del mes</td>
                    <td className={td}>{num(d.canales, d.canales % 1 ? 1 : 0)}</td>
                    <td className={td}>{kg(d.kgFrio)}</td>
                    <td className={td}>{kg(d.kgProducido)}</td>
                    <td className={td}>{`${kg(d.mermaKg)} · ${porc(d.mermaPct, 1)}`}</td>
                    <td className={cn(td, 'text-[#156F21]')}>{porc(d.rendimiento)}</td>
                    <td className={td}>{kg(d.kgRetoma)}</td>
                    <td className={td}>{porc(d.tca)}</td>
                    <td className={td}>{pesos(d.fin.venta)}</td>
                    <td className={td}>{pesos(d.fin.costoGanado + d.fin.gastos)}</td>
                    <td className={td}>
                      <Utilidad valor={d.fin.utilidad} margen={d.fin.venta ? (d.fin.utilidad * 100) / d.fin.venta : null} parcial={d.fin.parciales > 0} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {porCliente.length > 1 && (
            <Card className="overflow-hidden">
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold uppercase tracking-wide">Por cliente</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(th, 'text-left')}>Cliente</th>
                    <th className={th}>Lotes</th>
                    <th className={th}>Canales</th>
                    <th className={th}>Frío</th>
                    <th className={th}>Producción</th>
                    <th className={th}>Rendimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {porCliente.map((c) => (
                    <tr key={c.cliente} className="hover:bg-muted/40">
                      <td className={cn(td, 'text-left')}>{c.cliente}</td>
                      <td className={td}>{c.lotes}</td>
                      <td className={td}>{num(c.canales, c.canales % 1 ? 1 : 0)}</td>
                      <td className={td}>{kg(c.kgFrio)}</td>
                      <td className={td}>{kg(c.kgProducido)}</td>
                      <td className={cn(td, 'font-semibold text-[#156F21]')}>{porc(c.rendimiento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

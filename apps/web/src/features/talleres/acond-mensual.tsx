import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Bar, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, plantToday } from '@/lib/utils';
import { pct } from './api';
import { descargarExcel, FMT_ENTERO, FMT_KG, FMT_PCT, FMT_PESOS } from './excel';
import type { ResumenAcond } from './TallerAcondicionamientoPage';
import { AZUL, etiquetaDia, etiquetaMes, GRIS, Grafica, kg, num, porc, SinDatos, tooltipStyle, VERDE_CLARO } from './ui';

type Proceso = ResumenAcond['filas'][number];
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const PROCESO: Record<string, string> = { porcionado: 'Porcionado', inyectado: 'Inyectado' };
const tipo = (p: Proceso) => p.procesos.map((x) => PROCESO[x]).join(' + ');

function Variacion({ v, unidad }: { v: number | null; unidad: '%' | 'pp' }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const txt = `${v > 0 ? '+' : ''}${v.toLocaleString('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${unidad}`;
  return <span className={cn('font-medium', v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-700' : '')}>{txt}</span>;
}

export function ComparativoAcond({ filas, anio }: { filas: Proceso[]; anio: string }) {
  const meses = useMemo(() => {
    const hoy = plantToday();
    const ultimo = anio === hoy.slice(0, 4) ? Number(hoy.slice(5, 7)) : 12;
    const out = [];
    let previo: { salida: number; rendimiento: number | null } | null = null;
    for (let m = 1; m <= ultimo; m++) {
      const ym = `${anio}-${String(m).padStart(2, '0')}`;
      const del = filas.filter((f) => f.fecha.startsWith(ym));
      const con = del.filter((f) => !f.sinSalida);
      const entC = con.reduce((s, f) => s + f.entradaKg, 0);
      const salC = con.reduce((s, f) => s + f.salidaKg, 0);
      const actual = {
        ym,
        procesos: del.length,
        entrada: del.reduce((s, f) => s + f.entradaKg, 0),
        salida: del.reduce((s, f) => s + f.salidaKg, 0),
        rendimiento: pct(salC, entC),
        merma: entC - salC,
        mermaPct: pct(entC - salC, entC),
        varSalida: null as number | null,
        varRendimiento: null as number | null,
      };
      if (previo && del.length) {
        actual.varSalida = previo.salida ? (actual.salida / previo.salida - 1) * 100 : null;
        actual.varRendimiento = actual.rendimiento != null && previo.rendimiento != null ? actual.rendimiento - previo.rendimiento : null;
      }
      out.push(actual);
      if (del.length) previo = actual;
    }
    return out;
  }, [filas, anio]);

  if (!meses.some((m) => m.procesos)) return <Card className="p-6"><SinDatos texto={`Sin procesos de acondicionamiento en ${anio}`} /></Card>;
  const th = 'border-b border-border bg-muted px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-2 py-2 text-right tabular-nums';
  const grafica = meses.map((m) => ({ mes: etiquetaMes(m.ym).split(' ')[0], entrada: m.entrada, salida: m.salida, rendimiento: m.rendimiento }));

  return (
    <div className="flex shrink-0 flex-col gap-4 pb-2">
      <Grafica titulo={`Entrada, salida y rendimiento ${anio}`}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={grafica} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis yAxisId="kg" fontSize={11} width={64} tickFormatter={(v: number) => num(v)} />
              <YAxis yAxisId="pct" orientation="right" fontSize={11} width={44} unit="%" domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => (n === 'rendimiento' ? [porc(v), 'Rendimiento'] : [kg(v), n === 'entrada' ? 'Entrada' : 'Salida'])} />
              <Legend formatter={(v: string) => ({ entrada: 'Entrada (kg)', salida: 'Salida (kg)', rendimiento: 'Rendimiento' } as Record<string, string>)[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="kg" dataKey="entrada" fill={GRIS} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="kg" dataKey="salida" fill={VERDE_CLARO} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Line yAxisId="pct" type="monotone" dataKey="rendimiento" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Grafica>
      <Card className="overflow-hidden">
        <div className="scrollbar-app overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Mes</th>
                <th className={th}>Procesos</th>
                <th className={th}>Entrada</th>
                <th className={th}>Salida</th>
                <th className={th}>Var. salida</th>
                <th className={th}>Rendimiento</th>
                <th className={th}>Var. rendimiento</th>
                <th className={th}>Merma</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.ym} className={cn('hover:bg-muted/40', !m.procesos && 'text-muted-foreground')}>
                  <td className={cn(td, 'text-left font-semibold capitalize')}>{etiquetaMes(m.ym)}</td>
                  <td className={td}>{m.procesos || '—'}</td>
                  <td className={td}>{m.procesos ? kg(m.entrada, 0) : '—'}</td>
                  <td className={td}>{m.procesos ? kg(m.salida, 0) : '—'}</td>
                  <td className={td}><Variacion v={m.varSalida} unidad="%" /></td>
                  <td className={cn(td, 'font-semibold text-[#156F21]')}>{porc(m.rendimiento)}</td>
                  <td className={td}><Variacion v={m.varRendimiento} unidad="pp" /></td>
                  <td className={td}>{m.rendimiento == null ? '—' : `${kg(m.merma)} · ${porc(m.mermaPct, 1)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ConsolidadoAcond({ d, mes, cliente }: { d: ResumenAcond; mes: string; cliente: string | null }) {
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    setExportando(true);
    try {
      const titulo = `Consolidado mensual de acondicionamiento — ${etiquetaMes(mes)}${cliente ? ` — ${cliente}` : ''}`;
      const productos = d.filas.flatMap((f) => [
        ...f.entradas.map((p) => ({ f, p, tipoMov: 'Entrada', base: pct(p.kg, f.entradaKg) })),
        ...f.salidas.map((p) => ({ f, p, tipoMov: 'Salida', base: pct(p.kg, f.entradaKg) })),
      ]);
      type P = (typeof productos)[number];
      const servicios = d.filas.flatMap((f) => (f.finanzas?.gastos ?? []).map((g) => ({ f, g })));
      await descargarExcel(`Consolidado acondicionamiento ${mes}${cliente ? ` ${cliente}` : ''}.xlsx`, [
        {
          nombre: 'Procesos',
          titulo,
          columnas: [
            { titulo: 'Fecha', valor: (f: Proceso) => f.fecha, ancho: 12 },
            { titulo: 'OT', valor: (f: Proceso) => f.otNumber, ancho: 8 },
            { titulo: 'OC', valor: (f: Proceso) => f.ocNumbers.join(', '), ancho: 10 },
            { titulo: 'Cliente', valor: (f: Proceso) => f.cliente, ancho: 34 },
            { titulo: 'Proceso', valor: (f: Proceso) => tipo(f), ancho: 14 },
            { titulo: 'Lotes origen (OP)', valor: (f: Proceso) => f.lotesOrigen.join(', '), ancho: 16 },
            { titulo: 'Entrada kg', valor: (f: Proceso) => f.entradaKg, formato: FMT_KG },
            { titulo: 'Salida kg', valor: (f: Proceso) => f.salidaKg, formato: FMT_KG },
            { titulo: 'Rendimiento %', valor: (f: Proceso) => r2(f.rendimiento), formato: FMT_PCT },
            { titulo: 'Merma kg', valor: (f: Proceso) => r2(f.merma), formato: FMT_KG },
            { titulo: 'Merma %', valor: (f: Proceso) => r2(f.mermaPct), formato: FMT_PCT },
            { titulo: 'Etiquetas', valor: (f: Proceso) => f.etiquetas, formato: FMT_ENTERO },
            { titulo: 'Venta $', valor: (f: Proceso) => f.finanzas?.venta ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Materia prima $', valor: (f: Proceso) => f.finanzas?.costoMP ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Servicios $', valor: (f: Proceso) => f.finanzas?.totalGastos ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Utilidad $', valor: (f: Proceso) => f.finanzas?.utilidad ?? null, formato: FMT_PESOS, ancho: 16 },
            { titulo: 'Margen %', valor: (f: Proceso) => f.finanzas?.margen ?? null, formato: FMT_PCT },
            { titulo: 'Datos faltantes', valor: (f: Proceso) => f.finanzas?.pendientes.join(' ') || null, ancho: 40 },
            { titulo: 'Estado', valor: (f: Proceso) => (f.sinSalida ? 'Sin salida' : f.activo ? 'Activa' : 'Cerrada'), ancho: 12 },
          ],
          filas: d.filas,
          totales: [
            'TOTAL', d.filas.length, null, null, null, null, r2(d.entrada), r2(d.salida), r2(d.rendimiento), r2(d.merma), r2(d.mermaPct), d.etiquetas,
            r2(d.fin.venta), r2(d.fin.costoMP), r2(d.fin.gastos), r2(d.fin.utilidad), d.fin.venta ? r2((d.fin.utilidad * 100) / d.fin.venta) : null, null, null,
          ],
        },
        {
          nombre: 'Servicios',
          titulo,
          columnas: [
            { titulo: 'OT', valor: (g: (typeof servicios)[number]) => g.f.otNumber, ancho: 8 },
            { titulo: 'Fecha', valor: (g: (typeof servicios)[number]) => g.f.fecha, ancho: 12 },
            { titulo: 'Cliente', valor: (g: (typeof servicios)[number]) => g.f.cliente, ancho: 30 },
            { titulo: 'Concepto', valor: (g: (typeof servicios)[number]) => g.g.concepto, ancho: 24 },
            { titulo: 'Cantidad', valor: (g: (typeof servicios)[number]) => g.g.cantidad, formato: FMT_KG },
            { titulo: 'Tarifa $', valor: (g: (typeof servicios)[number]) => g.g.valorUnitario, formato: FMT_PESOS },
            { titulo: 'Total $', valor: (g: (typeof servicios)[number]) => g.g.total, formato: FMT_PESOS, ancho: 16 },
          ],
          filas: servicios,
        },
        {
          nombre: 'Productos',
          titulo,
          columnas: [
            { titulo: 'OT', valor: (x: P) => x.f.otNumber, ancho: 8 },
            { titulo: 'Fecha', valor: (x: P) => x.f.fecha, ancho: 12 },
            { titulo: 'Cliente', valor: (x: P) => x.f.cliente, ancho: 30 },
            { titulo: 'Movimiento', valor: (x: P) => x.tipoMov, ancho: 12 },
            { titulo: 'Código', valor: (x: P) => x.p.codigo, ancho: 10 },
            { titulo: 'Producto', valor: (x: P) => x.p.nombre, ancho: 36 },
            { titulo: 'Unds', valor: (x: P) => x.p.unds, formato: FMT_ENTERO },
            { titulo: 'Kg', valor: (x: P) => x.p.kg, formato: FMT_KG },
            { titulo: '% sobre entrada', valor: (x: P) => r2(x.base), formato: FMT_PCT },
          ],
          filas: productos,
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
          {d.filas.length} proceso(s) en <span className="font-semibold capitalize text-foreground">{etiquetaMes(mes)}</span>
          {cliente && <> para <span className="font-semibold text-foreground">{cliente}</span></>}.
        </p>
        <Button onClick={exportar} disabled={!d.filas.length || exportando}>
          <FileSpreadsheet className="size-4" />
          {exportando ? 'Generando…' : 'Descargar Excel'}
        </Button>
      </div>
      {!d.filas.length ? (
        <Card className="p-6"><SinDatos texto="Sin procesos en el mes" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="scrollbar-app overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(th, 'text-left')}>Fecha</th>
                  <th className={cn(th, 'text-left')}>Traslado</th>
                  <th className={cn(th, 'text-left')}>Cliente</th>
                  <th className={cn(th, 'text-left')}>Proceso</th>
                  <th className={th}>Entrada</th>
                  <th className={th}>Salida</th>
                  <th className={th}>Rendimiento</th>
                  <th className={th}>Merma</th>
                  <th className={th}>Etiquetas</th>
                </tr>
              </thead>
              <tbody>
                {d.filas.map((f) => (
                  <tr key={f.otId} className="hover:bg-muted/40">
                    <td className={cn(td, 'text-left')}>{etiquetaDia(f.fecha)}</td>
                    <td className={cn(td, 'text-left font-semibold')}>
                      OT {f.otNumber} <span className="text-xs font-normal text-muted-foreground">· OC {f.ocNumbers.join(', ')}</span>
                    </td>
                    <td className={cn(td, 'max-w-60 truncate text-left')} title={f.cliente}>{f.cliente}</td>
                    <td className={cn(td, 'text-left')}>{tipo(f)}</td>
                    <td className={td}>{kg(f.entradaKg)}</td>
                    <td className={td}>{f.sinSalida ? '—' : kg(f.salidaKg)}</td>
                    <td className={cn(td, 'font-semibold text-[#156F21]')}>{f.sinSalida ? '—' : porc(f.rendimiento)}</td>
                    <td className={td}>{f.sinSalida ? '—' : `${kg(f.merma)} · ${porc(f.mermaPct, 1)}`}</td>
                    <td className={td}>{num(f.etiquetas)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 font-semibold">
                  <td className={cn(td, 'text-left')} colSpan={4}>Total del mes</td>
                  <td className={td}>{kg(d.entrada)}</td>
                  <td className={td}>{kg(d.salida)}</td>
                  <td className={cn(td, 'text-[#156F21]')}>{porc(d.rendimiento)}</td>
                  <td className={td}>{`${kg(d.merma)} · ${porc(d.mermaPct, 1)}`}</td>
                  <td className={td}>{num(d.etiquetas)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

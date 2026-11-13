import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleDollarSign, Percent, Receipt, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTallerAcondicionamiento, useTallerDesposte } from './api';
import { millones, Pendientes, Utilidad } from './finanzas-ui';
import { pesos, pesosDec } from './maestros-api';
import { AMBAR, AZUL, clientesDe, Encabezado, etiquetaMes, Filtros, Grafica, kg, Kpi, porc, SinDatos, tooltipStyle, usePeriodo, VERDE, VERDE_CLARO } from './ui';

interface Fila {
  proceso: string;
  ordenes: number;
  kg: number;
  venta: number;
  materiaPrima: number;
  gastos: number;
  utilidad: number;
  parciales: number;
}

const COLORES: Record<string, string> = { Desposte: VERDE, Porcionado: VERDE_CLARO, Inyectado: AMBAR };

/** Utilidad por proceso (desposte, porcionado, inyectado) del periodo. */
export function ResultadosPage() {
  const periodo = usePeriodo();
  const [cliente, setCliente] = useState('');
  const des = useTallerDesposte(periodo.desde, periodo.hasta);
  const aco = useTallerAcondicionamiento(periodo.desde, periodo.hasta);

  const d = useMemo(() => {
    const filas = new Map<string, Fila>();
    const meses = new Map<string, Record<string, number> & { venta: number }>();
    const pendientes = new Set<string>();
    const sumar = (proceso: string, ym: string, v: Omit<Fila, 'proceso' | 'ordenes' | 'parciales'>, parcial: boolean) => {
      const f = filas.get(proceso) ?? { proceso, ordenes: 0, kg: 0, venta: 0, materiaPrima: 0, gastos: 0, utilidad: 0, parciales: 0 };
      f.ordenes += 1;
      f.kg += v.kg;
      f.venta += v.venta;
      f.materiaPrima += v.materiaPrima;
      f.gastos += v.gastos;
      f.utilidad += v.utilidad;
      if (parcial) f.parciales += 1;
      filas.set(proceso, f);
      const m = meses.get(ym) ?? ({ venta: 0 } as Record<string, number> & { venta: number });
      m[proceso] = (m[proceso] ?? 0) + v.utilidad;
      m.venta += v.venta;
      meses.set(ym, m);
    };
    for (const l of des.data ?? []) {
      if ((cliente && l.clienteId !== cliente) || !l.finanzas || !l.etiquetas) continue;
      const f = l.finanzas;
      f.pendientes.forEach((p) => pendientes.add(`OP ${l.opNumber}: ${p}`));
      sumar('Desposte', l.fecha.slice(0, 7), { kg: l.kgProducido, venta: f.venta, materiaPrima: f.costoGanado, gastos: f.totalGastos, utilidad: f.utilidad }, f.pendientes.length > 0);
    }
    for (const p of aco.data ?? []) {
      if ((cliente && p.clienteId !== cliente) || !p.finanzas || !p.etiquetas) continue;
      const f = p.finanzas;
      f.pendientes.forEach((x) => pendientes.add(`OT ${p.otNumber}: ${x}`));
      const nombre = p.procesos.map((x) => (x === 'inyectado' ? 'Inyectado' : 'Porcionado')).join(' + ');
      sumar(nombre, p.fecha.slice(0, 7), { kg: p.salidaKg, venta: f.venta, materiaPrima: f.costoMP, gastos: f.totalGastos, utilidad: f.utilidad }, f.pendientes.length > 0);
    }
    const lista = [...filas.values()];
    const total = lista.reduce(
      (t, f) => ({ venta: t.venta + f.venta, costo: t.costo + f.materiaPrima + f.gastos, utilidad: t.utilidad + f.utilidad }),
      { venta: 0, costo: 0, utilidad: 0 },
    );
    return {
      filas: lista,
      total,
      procesos: lista.map((f) => f.proceso),
      meses: [...meses].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => {
        const util = lista.reduce((s, f) => s + (v[f.proceso] ?? 0), 0);
        return { mes: etiquetaMes(ym), ...v, margen: v.venta ? (util * 100) / v.venta : null };
      }),
      pendientes: [...pendientes],
    };
  }, [des.data, aco.data, cliente]);

  const clientes = useMemo(() => {
    const m = new Map([...clientesDe(des.data), ...clientesDe(aco.data)].map((c) => [c.id, c]));
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [des.data, aco.data]);
  const th = 'border-b border-border bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-3 py-2 text-right tabular-nums';
  const cargando = des.isFetching || aco.isFetching;

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Encabezado
        titulo="Resultados de los talleres"
        descripcion="Utilidad por proceso: desposte, porcionado e inyectado, con la lista de precios, las tarifas y el costo del ganado vigentes."
        cargando={cargando}
        onRefrescar={() => {
          des.refetch();
          aco.refetch();
        }}
      />
      <Filtros periodo={periodo} cliente={cliente} setCliente={setCliente} clientes={clientes} cargando={des.isLoading || aco.isLoading} />

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Receipt} label="Venta" value={millones(d.total.venta)} />
        <Kpi icon={CircleDollarSign} label="Costo total" value={millones(d.total.costo)} detalle="Materia prima + servicios" />
        <Kpi icon={TrendingUp} label="Utilidad" tone={d.total.utilidad >= 0 ? 'text-[#156F21]' : 'text-red-700'} value={millones(d.total.utilidad)} />
        <Kpi icon={Percent} label="Margen" value={d.total.venta ? porc((d.total.utilidad * 100) / d.total.venta, 1) : '—'} detalle={d.pendientes.length ? `${d.pendientes.length} dato(s) pendientes` : undefined} tone={d.pendientes.length ? 'text-amber-700' : undefined} />
      </div>

      <Card className="shrink-0 overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'text-left')}>Proceso</th>
              <th className={th}>Órdenes</th>
              <th className={th}>Kg producidos</th>
              <th className={th}>Venta</th>
              <th className={th}>Materia prima</th>
              <th className={th}>Servicios</th>
              <th className={th}>Utilidad</th>
              <th className={th}>Utilidad / kg</th>
            </tr>
          </thead>
          <tbody>
            {d.filas.map((f) => (
              <tr key={f.proceso} className="hover:bg-muted/40">
                <td className={cn(td, 'text-left font-semibold')}>
                  <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: COLORES[f.proceso] ?? AZUL }} />
                  {f.proceso}
                </td>
                <td className={td}>{f.ordenes}</td>
                <td className={td}>{kg(f.kg, 0)}</td>
                <td className={td}>{pesos(f.venta)}</td>
                <td className={td}>{pesos(f.materiaPrima)}</td>
                <td className={td}>{pesos(f.gastos)}</td>
                <td className={td}>
                  <Utilidad valor={f.utilidad} margen={f.venta ? (f.utilidad * 100) / f.venta : null} parcial={f.parciales > 0} />
                </td>
                <td className={td}>{f.kg ? pesosDec(f.utilidad / f.kg) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.filas.length && <SinDatos texto="Sin procesos valorizados en el periodo" />}
      </Card>

      <Grafica titulo="Utilidad por mes y proceso" subtitulo="Línea: margen total del mes" className="shrink-0">
        <div className="h-80">
          {d.meses.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.meses} margin={{ top: 20, right: 8, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis yAxisId="cop" fontSize={11} width={70} tickFormatter={millones} />
                <YAxis yAxisId="pct" orientation="right" fontSize={11} width={44} unit="%" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => (n === 'margen' ? [porc(v, 1), 'Margen'] : [pesos(v), String(n)])} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => (v === 'margen' ? 'Margen' : v)} />
                {d.procesos.map((p) => (
                  <Bar key={p} yAxisId="cop" dataKey={p} stackId="u" fill={COLORES[p] ?? AZUL} maxBarSize={56} />
                ))}
                <Line yAxisId="pct" type="monotone" dataKey="margen" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      {d.pendientes.length > 0 && (
        <Card className="shrink-0 p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Datos pendientes para un resultado completo</h2>
          <div className="scrollbar-app max-h-60 overflow-y-auto">
            <Pendientes items={d.pendientes} />
          </div>
        </Card>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LoaderCircle, Receipt, RefreshCw, RotateCcw, Scale, Users } from 'lucide-react';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { StatValue } from '@/components/ui/stat';
import { cn, plantToday } from '@/lib/utils';
import { calcular, decimal, nombreTarifa, pesos, useBeneficio } from './beneficio-api';
import { totalesRetoma, useRetomas } from './retomas-api';

const VERDE = '#4D7D50';
const VERDE_CLARO = '#66B253';
const AZUL = '#156082';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const mesActual = () => `${plantToday().slice(0, 7)}-01`;
const anioActual = () => `${plantToday().slice(0, 4)}-01-01`;
const n = (v: number) => v.toLocaleString('es-CO');
const millones = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `$ ${decimal(v / 1_000_000, v >= 100_000_000 ? 0 : 1)} M` : pesos(v);
const etiquetaMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const etiquetaDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Último día del mes de una fecha AAAA-MM-DD. */
const finDeMes = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

function Grafica({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  );
}

function SinDatos() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin datos en el rango</div>;
}

const tooltipStyle = { borderRadius: 8, fontSize: 12 };

export function DashboardHistoricoPage() {
  const [desde, setDesde] = useState(anioActual);
  const [hasta, setHasta] = useState(plantToday);
  const [firmador, setFirmador] = useState('');
  const beneficio = useBeneficio(desde, hasta);
  const retomas = useRetomas(desde, hasta);

  // Segmentación por firmador (agrupa "X" y "X SAS" como en Consolidados).
  const firmadores = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const f of beneficio.data ?? []) {
      const nombre = f.firmador?.trim();
      if (!nombre) continue;
      const clave = nombreTarifa(nombre);
      const nombres = m.get(clave) ?? new Map<string, number>();
      nombres.set(nombre, (nombres.get(nombre) ?? 0) + 1);
      m.set(clave, nombres);
    }
    return [...m]
      .map(([clave, nombres]) => ({ clave, nombre: [...nombres].sort((a, b) => b[1] - a[1])[0][0] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [beneficio.data]);

  const d = useMemo(() => {
    const coincide = (nombre: string | null) => !firmador || nombreTarifa(nombre ?? '') === firmador;
    const filas = (beneficio.data ?? []).filter((f) => coincide(f.firmador));
    const ret = (retomas.data ?? []).filter((f) => coincide(f.firmador));

    let reses = 0;
    let facturacion = 0;
    let pie = 0;
    let caliente = 0;
    const porDia = new Map<string, number>();
    const porSemana = new Map<number, number>();
    const porMes = new Map<string, { reses: number; facturacion: number; retomas: number }>();
    const porCliente = new Map<string, { nombre: string; reses: number; nombres: Map<string, number> }>();
    const mes = (ym: string) => {
      const v = porMes.get(ym) ?? { reses: 0, facturacion: 0, retomas: 0 };
      porMes.set(ym, v);
      return v;
    };

    for (const f of filas) {
      const c = calcular(f);
      reses += c.reses;
      facturacion += c.totalSacrificio;
      pie += f.pesoPieKg ?? 0;
      caliente += f.pesoCalienteKg ?? 0;
      porDia.set(f.fecha, (porDia.get(f.fecha) ?? 0) + c.reses);
      porSemana.set(c.semana, (porSemana.get(c.semana) ?? 0) + c.reses);
      const m = mes(f.fecha.slice(0, 7));
      m.reses += c.reses;
      m.facturacion += c.totalSacrificio;
      const nombre = f.firmador?.trim() || '(vacío)';
      const clave = nombreTarifa(nombre) || nombre;
      const g = porCliente.get(clave) ?? { nombre, reses: 0, nombres: new Map<string, number>() };
      g.reses += c.reses;
      g.nombres.set(nombre, (g.nombres.get(nombre) ?? 0) + 1);
      porCliente.set(clave, g);
    }
    let totalRetomas = 0;
    for (const f of ret) {
      const t = totalesRetoma(f).total;
      totalRetomas += t;
      mes(f.fecha.slice(0, 7)).retomas += t;
    }

    return {
      reses,
      facturacion,
      totalRetomas,
      rendimiento: pie ? (caliente * 100) / pie : 0,
      dias: [...porDia].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, r]) => ({ fecha, reses: r })),
      semanas: [...porSemana].sort((a, b) => a[0] - b[0]).map(([s, r]) => ({ semana: `Sem ${s}`, reses: r })),
      meses: [...porMes].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => ({ mes: etiquetaMes(ym), ...v })),
      clientes: [...porCliente.values()]
        .map(({ nombres, reses: r }) => ({ cliente: [...nombres].sort((a, b) => b[1] - a[1])[0][0], reses: r }))
        .sort((a, b) => b.reses - a.reses),
    };
  }, [beneficio.data, retomas.data, firmador]);

  // Línea de tiempo: meses del año en curso para filtrar con un toque.
  const anio = plantToday().slice(0, 4);
  const mesHoy = Number(plantToday().slice(5, 7));
  const presets: [string, () => void][] = [
    ['Hoy', () => { setDesde(plantToday()); setHasta(plantToday()); }],
    ['Este mes', () => { setDesde(mesActual()); setHasta(plantToday()); }],
    ['Este año', () => { setDesde(anioActual()); setHasta(plantToday()); }],
    ['Todo', () => { setDesde(''); setHasta(''); }],
  ];
  const mesSeleccionado = (m: number) => {
    const ini = `${anio}-${String(m).padStart(2, '0')}-01`;
    return desde === ini && hasta === (m === mesHoy ? plantToday() : finDeMes(ini));
  };

  const cargando = beneficio.isLoading || retomas.isLoading;
  const muchosDias = d.dias.length > 31;
  const alto = 'h-72';

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={logoSantaCruz} alt="Santacruz" className="h-14 w-auto" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Histórico sacrificio — beneficio, facturación y retomas.</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-12 [&_svg]:size-6"
          title="Refrescar"
          disabled={beneficio.isFetching || retomas.isFetching}
          onClick={() => {
            beneficio.refetch();
            retomas.refetch();
          }}
        >
          <RefreshCw className={cn((beneficio.isFetching || retomas.isFetching) && 'animate-spin')} />
        </Button>
      </div>

      <Card className="flex shrink-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="db-desde">Desde</Label>
            <Input id="db-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="db-hasta">Hasta</Label>
            <Input id="db-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {presets.map(([label, fn]) => (
              <Button key={label} variant="outline" size="sm" className="h-9" onClick={fn}>
                {label}
              </Button>
            ))}
          </div>
          <div className="min-w-72 flex-1 space-y-1">
            <Label htmlFor="db-firmador">Firmador</Label>
            <Select id="db-firmador" className="h-9" value={firmador} onChange={(e) => setFirmador(e.target.value)}>
              <option value="">Todos los firmadores</option>
              {firmadores.map((f) => (
                <option key={f.clave} value={f.clave}>
                  {f.nombre}
                </option>
              ))}
            </Select>
          </div>
          {cargando && <LoaderCircle className="mb-2 size-5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{anio}</span>
          {MESES.slice(0, mesHoy).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                const ini = `${anio}-${String(i + 1).padStart(2, '0')}-01`;
                setDesde(ini);
                setHasta(i + 1 === mesHoy ? plantToday() : finDeMes(ini));
              }}
              className={cn(
                'h-8 rounded-md border px-3 text-xs font-medium uppercase transition-colors',
                mesSeleccionado(i + 1)
                  ? 'border-[#156F21] bg-[#156F21] text-white'
                  : 'border-border bg-card hover:bg-accent',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatValue icon={Users} label="Beneficio (reses)" tone="text-[#156F21]" value={n(d.reses)} />
        <StatValue icon={Receipt} label="Facturación" tone="text-[#156F21]" value={pesos(d.facturacion)} />
        <StatValue icon={RotateCcw} label="Pago por retomas" value={pesos(d.totalRetomas)} />
        <StatValue icon={Scale} label="Rendimiento promedio" value={`${decimal(d.rendimiento, 2)} %`} />
      </div>

      <Grafica titulo="Beneficio diario" className="shrink-0">
        <div className={alto}>
          {d.dias.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.dias} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha" tickFormatter={etiquetaDia} fontSize={11} minTickGap={8} />
                <YAxis fontSize={11} width={40} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => etiquetaDia(String(v))} formatter={(v: number) => [n(v), 'Reses']} />
                <Bar dataKey="reses" fill={VERDE} radius={[3, 3, 0, 0]} maxBarSize={70}>
                  {!muchosDias && <LabelList dataKey="reses" position="top" fontSize={10} />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Beneficio por cliente" className="shrink-0">
        <div className="h-80">
          {d.clientes.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.clientes} margin={{ top: 20, right: 8, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="cliente"
                  fontSize={10}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={110}
                  tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                />
                <YAxis fontSize={11} width={48} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [n(v), 'Reses']} />
                <Bar dataKey="reses" fill={VERDE} radius={[3, 3, 0, 0]} maxBarSize={70}>
                  <LabelList dataKey="reses" position="top" fontSize={10} formatter={(v: number) => n(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <Grafica titulo="Producción semanal" className="shrink-0">
        <div className={alto}>
          {d.semanas.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.semanas} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="semana" fontSize={11} minTickGap={4} />
                <YAxis fontSize={11} width={48} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [n(v), 'Reses']} />
                <Line type="monotone" dataKey="reses" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }}>
                  {d.semanas.length <= 26 && <LabelList dataKey="reses" position="top" fontSize={10} formatter={(v: number) => n(v)} />}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <SinDatos />
          )}
        </div>
      </Grafica>

      <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-3">
        <Grafica titulo="Beneficio mensual">
          <div className={alto}>
            {d.meses.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.meses} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" fontSize={11} />
                  <YAxis fontSize={11} width={48} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [n(v), 'Reses']} />
                  <Bar dataKey="reses" fill={VERDE} radius={[3, 3, 0, 0]} maxBarSize={70}>
                    <LabelList dataKey="reses" position="top" fontSize={10} formatter={(v: number) => n(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SinDatos />
            )}
          </div>
        </Grafica>
        <Grafica titulo="Facturación mensual">
          <div className={alto}>
            {d.meses.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.meses} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={11} tickFormatter={millones} />
                  <YAxis type="category" dataKey="mes" fontSize={11} width={80} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [pesos(v), 'Facturación']} />
                  <Bar dataKey="facturacion" fill={VERDE_CLARO} radius={[0, 3, 3, 0]} maxBarSize={40}>
                    <LabelList dataKey="facturacion" position="right" fontSize={10} formatter={millones} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SinDatos />
            )}
          </div>
        </Grafica>
        <Grafica titulo="Pago por retomas">
          <div className={alto}>
            {d.meses.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.meses} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={11} tickFormatter={millones} />
                  <YAxis type="category" dataKey="mes" fontSize={11} width={80} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [pesos(v), 'Retomas']} />
                  <Bar dataKey="retomas" fill={VERDE_CLARO} radius={[0, 3, 3, 0]} maxBarSize={40}>
                    <LabelList dataKey="retomas" position="right" fontSize={10} formatter={millones} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SinDatos />
            )}
          </div>
        </Grafica>
      </div>
    </div>
  );
}

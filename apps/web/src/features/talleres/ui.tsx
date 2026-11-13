import { useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label, Select } from '@/components/ui/input';
import { cn, plantToday } from '@/lib/utils';

export const VERDE = '#156F21';
export const VERDE_MEDIO = '#4D7D50';
export const VERDE_CLARO = '#66B253';
export const AZUL = '#156082';
export const AMBAR = '#D97706';
export const ROJO = '#B91C1C';
export const GRIS = '#94A3B8';
export const tooltipStyle = { borderRadius: 8, fontSize: 12 };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const fmt = (v: number, dec: number) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const kg = (v: number, dec = 1) => `${fmt(v, dec)} kg`;
export const num = (v: number, dec = 0) => fmt(v, dec);
export const porc = (v: number | null, dec = 2) => (v == null ? '—' : `${fmt(v, dec)} %`);
export const etiquetaDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const etiquetaMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

const finDeMes = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

/** Filtro de periodo compartido por los talleres: por defecto, el mes en curso. */
export function usePeriodo() {
  const [desde, setDesde] = useState(() => `${plantToday().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(plantToday);
  return { desde, hasta, setDesde, setHasta };
}

export function Encabezado({
  titulo,
  descripcion,
  cargando,
  onRefrescar,
}: {
  titulo: string;
  descripcion: string;
  cargando: boolean;
  onRefrescar: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src={logoSantaCruz} alt="Santacruz" className="h-14 w-auto" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>
        </div>
      </div>
      <Button variant="outline" size="icon" className="size-12 [&_svg]:size-6" title="Refrescar" disabled={cargando} onClick={onRefrescar}>
        <RefreshCw className={cn(cargando && 'animate-spin')} />
      </Button>
    </div>
  );
}

export function Filtros({
  periodo,
  cliente,
  setCliente,
  clientes,
  cargando,
  periodoAlterno,
}: {
  periodo: ReturnType<typeof usePeriodo>;
  cliente: string;
  setCliente: (v: string) => void;
  clientes: { id: string; nombre: string }[];
  cargando: boolean;
  /** Reemplaza el rango de fechas (vistas mensuales o anuales). */
  periodoAlterno?: React.ReactNode;
}) {
  const { desde, hasta, setDesde, setHasta } = periodo;
  const hoy = plantToday();
  const anio = hoy.slice(0, 4);
  const mesHoy = Number(hoy.slice(5, 7));
  const presets: [string, () => void][] = [
    ['Hoy', () => { setDesde(hoy); setHasta(hoy); }],
    ['Últimos 7 días', () => {
      const d = new Date(`${hoy}T12:00:00`);
      d.setDate(d.getDate() - 6);
      setDesde(d.toISOString().slice(0, 10));
      setHasta(hoy);
    }],
    ['Este mes', () => { setDesde(`${hoy.slice(0, 7)}-01`); setHasta(hoy); }],
    ['Este año', () => { setDesde(`${anio}-01-01`); setHasta(hoy); }],
  ];
  const rangoMes = (m: number) => {
    const ini = `${anio}-${String(m).padStart(2, '0')}-01`;
    return [ini, m === mesHoy ? hoy : finDeMes(ini)] as const;
  };

  return (
    <Card className="flex shrink-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {periodoAlterno ?? (
          <>
            <div className="space-y-1">
              <Label htmlFor="tl-desde">Desde</Label>
              <Input id="tl-desde" type="date" className="h-9 w-40" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tl-hasta">Hasta</Label>
              <Input id="tl-hasta" type="date" className="h-9 w-40" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {presets.map(([label, fn]) => (
                <Button key={label} variant="outline" size="sm" className="h-9" onClick={fn}>
                  {label}
                </Button>
              ))}
            </div>
          </>
        )}
        <div className="min-w-64 flex-1 space-y-1">
          <Label htmlFor="tl-cliente">Cliente</Label>
          <Combobox
            id="tl-cliente"
            options={clientes.map((c) => ({ value: c.id, label: c.nombre }))}
            value={cliente}
            onChange={setCliente}
            placeholder="Todos los clientes — escribe para buscar"
            emptyText="Ningún cliente coincide"
          />
        </div>
        {cargando && <LoaderCircle className="mb-2 size-5 animate-spin text-muted-foreground" />}
      </div>
      {!periodoAlterno && (
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{anio}</span>
        {MESES.slice(0, mesHoy).map((m, i) => {
          const [ini, fin] = rangoMes(i + 1);
          const activo = desde === ini && hasta === fin;
          return (
            <button
              key={m}
              type="button"
              onClick={() => { setDesde(ini); setHasta(fin); }}
              className={cn(
                'h-8 rounded-md border px-3 text-xs font-medium uppercase transition-colors',
                activo ? 'border-[#156F21] bg-[#156F21] text-white' : 'border-border bg-card hover:bg-accent',
              )}
            >
              {m}
            </button>
          );
        })}
      </div>
      )}
    </Card>
  );
}

/** Selector de año (desde 2026 hasta el actual). */
export function SelectorAnio({ anio, setAnio }: { anio: string; setAnio: (v: string) => void }) {
  const actual = Number(plantToday().slice(0, 4));
  const anios = Array.from({ length: Math.max(1, actual - 2025) }, (_, i) => String(actual - i));
  return (
    <div className="space-y-1">
      <Label htmlFor="tl-anio">Año</Label>
      <Select id="tl-anio" className="h-9 w-32" value={anio} onChange={(e) => setAnio(e.target.value)}>
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Selector de mes (AAAA-MM) con botones de mes anterior y siguiente. */
export function SelectorMes({ mes, setMes }: { mes: string; setMes: (v: string) => void }) {
  const mover = (delta: number) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const hoy = plantToday().slice(0, 7);
  return (
    <div className="space-y-1">
      <Label htmlFor="tl-mes">Mes</Label>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-9" onClick={() => mover(-1)}>
          ‹
        </Button>
        <Input id="tl-mes" type="month" className="h-9 w-44" value={mes} max={hoy} onChange={(e) => e.target.value && setMes(e.target.value)} />
        <Button variant="outline" size="sm" className="h-9" disabled={mes >= hoy} onClick={() => mover(1)}>
          ›
        </Button>
      </div>
    </div>
  );
}

/** Primer y último día de un mes AAAA-MM. */
export function rangoDeMes(ym: string) {
  return { desde: `${ym}-01`, hasta: finDeMes(`${ym}-01`) };
}

/** Indicador principal con una línea de contexto opcional. */
export function Kpi({
  icon: Icon,
  label,
  value,
  detalle,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detalle?: React.ReactNode;
  tone?: string;
}) {
  return (
    <Card className="flex h-full flex-col p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone)}>{value}</p>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{detalle}</p>}
    </Card>
  );
}

export function Grafica({
  titulo,
  subtitulo,
  children,
  className,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <div className="mb-2 text-center">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
        {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  );
}

export function SinDatos({ texto = 'Sin datos en el periodo' }: { texto?: string }) {
  return <div className="flex h-full min-h-24 items-center justify-center text-sm text-muted-foreground">{texto}</div>;
}

export interface Alerta {
  nivel: 'alta' | 'media';
  texto: string;
}

export function PanelAlertas({ alertas }: { alertas: Alerta[] }) {
  return (
    <Card className="flex flex-col p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Alertas del periodo</h2>
      {alertas.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="size-4" />
          Sin novedades: todos los lotes están dentro de lo esperado.
        </div>
      ) : (
        <ul className="scrollbar-app max-h-72 space-y-2 overflow-y-auto pr-1">
          {alertas.map((a, i) => (
            <li
              key={i}
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                a.nivel === 'alta' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800',
              )}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{a.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Clientes únicos presentes en los datos, para el filtro. */
export function clientesDe<T extends { clienteId: string; cliente: string }>(rows: T[] | undefined) {
  const m = new Map<string, string>();
  for (const r of rows ?? []) m.set(r.clienteId, r.cliente);
  return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

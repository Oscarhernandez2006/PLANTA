import { useMemo, useState } from 'react';
import { CalendarDays, Database, Download, LoaderCircle, Receipt, RefreshCw, RotateCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { StatValue } from '@/components/ui/stat';
import { cn, plantToday } from '@/lib/utils';
import { calcular, fechaLarga, nombreTarifa, pesos, useBeneficio, type FilaBeneficio } from './beneficio-api';
import { totalesRetoma, useRetomas } from './retomas-api';

const mesActual = () => `${plantToday().slice(0, 7)}-01`;
const anioActual = () => `${plantToday().slice(0, 4)}-01-01`;
const n = (v: number) => v.toLocaleString('es-CO');

/** Las 6 tablas dinámicas de la hoja DATOS, calculadas desde Beneficio y Retomas. */
export function resumenDatos(beneficio: FilaBeneficio[]) {
  const porFirmador = new Map<string, { firmador: string; reses: number; nombres: Map<string, number> }>();
  const porFecha = new Map<string, number>();
  const porSemana = new Map<number, number>();
  let reses = 0;
  let facturacion = 0;
  for (const f of beneficio) {
    const c = calcular(f);
    reses += c.reses;
    facturacion += c.totalSacrificio;
    const nombre = f.firmador?.trim() || '(vacío)';
    const clave = nombreTarifa(nombre) || nombre;
    const g = porFirmador.get(clave) ?? { firmador: nombre, reses: 0, nombres: new Map<string, number>() };
    g.reses += c.reses;
    g.nombres.set(nombre, (g.nombres.get(nombre) ?? 0) + 1);
    porFirmador.set(clave, g);
    porFecha.set(f.fecha, (porFecha.get(f.fecha) ?? 0) + c.reses);
    porSemana.set(c.semana, (porSemana.get(c.semana) ?? 0) + c.reses);
  }
  return {
    reses,
    facturacion,
    firmadores: [...porFirmador.values()]
      .map(({ nombres, reses: r }) => ({ firmador: [...nombres].sort((a, b) => b[1] - a[1])[0][0], reses: r }))
      .sort((a, b) => a.firmador.localeCompare(b.firmador, 'es')),
    dias: [...porFecha].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, r]) => ({ fecha, reses: r })),
    semanas: [...porSemana].sort((a, b) => a[0] - b[0]).map(([semana, r]) => ({ semana, reses: r })),
  };
}

async function exportar(d: ReturnType<typeof resumenDatos>, totalRetomas: number, nombre: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DATOS');
  ws.columns = [
    { width: 45 }, { width: 14 }, { width: 3 }, { width: 14 }, { width: 14 }, { width: 3 },
    { width: 22 }, { width: 3 }, { width: 14 }, { width: 3 }, { width: 22 }, { width: 3 }, { width: 12 }, { width: 14 },
  ];
  const head = ws.addRow(['FIRMADOR', 'TOTAL RESES', '', 'FECHA', 'TOTAL RESES', '', 'TOTAL FACTURACION', '', 'TOTAL RESES', '', 'TOTAL RETOMAS', '', 'No SEMANA', 'TOTAL RESES']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => {
    if (c.value) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  });
  const filas = Math.max(d.firmadores.length, d.dias.length, d.semanas.length) + 1;
  for (let i = 0; i < filas; i++) {
    const r = ws.getRow(i + 2);
    const fir = d.firmadores[i];
    const dia = d.dias[i];
    const sem = d.semanas[i];
    const celda = (col: number, valor: string | number | Date) => {
      r.getCell(col).value = valor;
    };
    if (fir) {
      celda(1, fir.firmador);
      celda(2, fir.reses);
    } else if (i === d.firmadores.length) {
      celda(1, 'Total Result');
      celda(2, d.reses);
    }
    if (dia) {
      const [y, m, dd] = dia.fecha.split('-').map(Number);
      celda(4, new Date(Date.UTC(y, m - 1, dd)));
      r.getCell(4).numFmt = 'dd/mm/yyyy';
      celda(5, dia.reses);
    } else if (i === d.dias.length) {
      celda(4, 'Total Result');
      celda(5, d.reses);
    }
    if (sem) {
      celda(13, sem.semana);
      celda(14, sem.reses);
    } else if (i === d.semanas.length) {
      celda(13, 'Total Result');
      celda(14, d.reses);
    }
    if (i === 0) {
      r.getCell(7).value = d.facturacion;
      r.getCell(7).numFmt = '"$" #,##0';
      r.getCell(9).value = d.reses;
      r.getCell(11).value = totalRetomas;
      r.getCell(11).numFmt = '"$" #,##0';
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function Tabla({
  titulo,
  icon: Icon,
  columnas,
  filas,
  total,
}: {
  titulo: string;
  icon: React.ComponentType<{ className?: string }>;
  columnas: [string, string];
  filas: { clave: string; etiqueta: React.ReactNode; valor: number }[];
  total: number;
}) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  const tf = 'sticky bottom-0 z-10 border-t-2 border-border bg-muted px-3 py-2 font-semibold tabular-nums';
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
        <Icon className="size-5 text-muted-foreground" />
        <h2 className="font-semibold">{titulo}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{filas.length} filas</span>
      </div>
      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'text-left')}>{columnas[0]}</th>
              <th className={cn(th, 'text-right')}>{columnas[1]}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="hover:bg-muted/40 [&>td]:border-b [&>td]:border-border">
                <td className="px-3 py-1.5">
                  <div className="font-medium">{f.etiqueta}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${(f.valor * 100) / max}%` }} />
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">{n(f.valor)}</td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <td className={tf}>Total</td>
                <td className={cn(tf, 'text-right')}>{n(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

export function DatosHistoricoPage() {
  const [desde, setDesde] = useState(anioActual);
  const [hasta, setHasta] = useState(plantToday);
  const [exportando, setExportando] = useState(false);
  const beneficio = useBeneficio(desde, hasta);
  const retomas = useRetomas(desde, hasta);

  const d = useMemo(() => resumenDatos(beneficio.data ?? []), [beneficio.data]);
  const totalRetomas = useMemo(
    () => (retomas.data ?? []).reduce((s, f) => s + totalesRetoma(f).total, 0),
    [retomas.data],
  );
  const cargando = beneficio.isLoading || retomas.isLoading;

  async function descargar() {
    setExportando(true);
    try {
      await exportar(d, totalRetomas, `DATOS ${desde || 'inicio'} a ${hasta || 'hoy'}`);
    } finally {
      setExportando(false);
    }
  }

  const presets: [string, () => void][] = [
    ['Hoy', () => { setDesde(plantToday()); setHasta(plantToday()); }],
    ['Este mes', () => { setDesde(mesActual()); setHasta(plantToday()); }],
    ['Este año', () => { setDesde(anioActual()); setHasta(plantToday()); }],
    ['Todo', () => { setDesde(''); setHasta(''); }],
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Database className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Datos</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Histórico sacrificio — resúmenes de beneficio y retomas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title="Exportar a Excel"
            disabled={cargando || exportando}
            onClick={descargar}
          >
            {exportando ? <LoaderCircle className="animate-spin" /> : <Download />}
          </Button>
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
      </div>

      <Card className="flex shrink-0 flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label htmlFor="hd-desde">Desde</Label>
          <Input id="hd-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hd-hasta">Hasta</Label>
          <Input id="hd-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {presets.map(([label, fn]) => (
            <Button key={label} variant="outline" size="sm" className="h-9" onClick={fn}>
              {label}
            </Button>
          ))}
        </div>
        {cargando && <LoaderCircle className="mb-2 size-5 animate-spin text-muted-foreground" />}
      </Card>

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3">
        <StatValue icon={Receipt} label="Total facturación" tone="text-emerald-600" value={pesos(d.facturacion)} />
        <StatValue icon={Users} label="Total reses" value={n(d.reses)} />
        <StatValue icon={RotateCcw} label="Total retomas" value={pesos(totalRetomas)} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <Tabla
          titulo="Reses por firmador"
          icon={Users}
          columnas={['Firmador', 'Total reses']}
          filas={d.firmadores.map((f) => ({ clave: f.firmador, etiqueta: f.firmador, valor: f.reses }))}
          total={d.reses}
        />
        <Tabla
          titulo="Beneficio diario"
          icon={CalendarDays}
          columnas={['Fecha', 'Total reses']}
          filas={d.dias.map((f) => ({ clave: f.fecha, etiqueta: fechaLarga(f.fecha), valor: f.reses }))}
          total={d.reses}
        />
        <Tabla
          titulo="Reses por semana"
          icon={CalendarDays}
          columnas={['No semana', 'Total reses']}
          filas={d.semanas.map((f) => ({ clave: String(f.semana), etiqueta: `Semana ${f.semana}`, valor: f.reses }))}
          total={d.reses}
        />
      </div>
    </div>
  );
}

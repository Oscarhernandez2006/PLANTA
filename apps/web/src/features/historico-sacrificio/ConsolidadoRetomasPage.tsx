import { useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowDownWideNarrow, Download, Inbox, LoaderCircle, RefreshCw, Repeat2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { cn, plantToday } from '@/lib/utils';
import { decimal, nombreTarifa, pesos } from './beneficio-api';
import { CONCEPTOS, totalesRetoma, useRetomas, type FilaRetoma } from './retomas-api';

const mesActual = () => `${plantToday().slice(0, 7)}-01`;
const anioActual = () => `${plantToday().slice(0, 4)}-01-01`;

interface FilaConsolidado {
  firmador: string;
  registros: number;
  reses: number;
  cantidades: number[];
  montos: number[];
  total: number;
}

const vacia = (firmador: string): FilaConsolidado => ({
  firmador,
  registros: 0,
  reses: 0,
  cantidades: CONCEPTOS.map(() => 0),
  montos: CONCEPTOS.map(() => 0),
  total: 0,
});

/**
 * Tabla dinámica de la hoja CONSOLIDADO DE RETOMAS: suma por firmador de las
 * reses, cantidades y totales de cada concepto. Agrupa por el nombre
 * normalizado (sin "SAS", puntos ni tildes) y muestra la forma más usada.
 */
function consolidar(filas: FilaRetoma[]) {
  const mapa = new Map<string, FilaConsolidado & { nombres: Map<string, number> }>();
  for (const f of filas) {
    const nombre = f.firmador?.trim() || '(vacío)';
    const clave = nombreTarifa(nombre) || nombre;
    const g = mapa.get(clave) ?? { ...vacia(nombre), nombres: new Map<string, number>() };
    const t = totalesRetoma(f);
    g.registros++;
    g.reses += f.reses;
    CONCEPTOS.forEach(([q], k) => {
      g.cantidades[k] += f[q] ?? 0;
      g.montos[k] += t.porConcepto[k];
    });
    g.total += t.total;
    g.nombres.set(nombre, (g.nombres.get(nombre) ?? 0) + 1);
    mapa.set(clave, g);
  }
  return [...mapa.values()].map(({ nombres, ...g }) => ({
    ...g,
    firmador: [...nombres].sort((a, b) => b[1] - a[1])[0][0],
  }));
}

const esKg = (q: string) => q === 'pielesKg' || q === 'seboKg';

async function exportar(filas: FilaConsolidado[], total: FilaConsolidado, nombre: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CONSOLIDADO DE RETOMAS');
  const titulos = CONCEPTOS.map(([, , , t]) => t.toUpperCase());
  ws.columns = [{ width: 50 }, { width: 10 }, ...titulos.map(() => ({ width: 13 })), ...titulos.map(() => ({ width: 18 })), { width: 18 }];
  const head = ws.addRow(['FIRMADOR', 'RESES', ...titulos, ...titulos.map((t) => `TOTAL ${t}`), 'TOTAL']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  head.height = 30;
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  });
  const fila = (f: FilaConsolidado, nombreFila: string) => {
    const r = ws.addRow([nombreFila, f.reses, ...f.cantidades, ...f.montos, f.total]);
    for (let c = 3 + CONCEPTOS.length; c <= 3 + CONCEPTOS.length * 2; c++) r.getCell(c).numFmt = '"$" #,##0';
    return r;
  };
  filas.forEach((f) => fila(f, f.firmador));
  fila(total, 'Total Result').font = { bold: true };

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

export function ConsolidadoRetomasPage() {
  const [desde, setDesde] = useState(anioActual);
  const [hasta, setHasta] = useState(plantToday);
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState<'nombre' | 'total'>('nombre');
  const [exportando, setExportando] = useState(false);

  const datos = useRetomas(desde, hasta);

  const { filas, total } = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    const todas = consolidar(datos.data ?? []).filter((f) => !q || f.firmador.toUpperCase().includes(q));
    todas.sort((a, b) => (orden === 'total' ? b.total - a.total : a.firmador.localeCompare(b.firmador, 'es')));
    const total = todas.reduce((t, f) => {
      t.registros += f.registros;
      t.reses += f.reses;
      f.cantidades.forEach((v, k) => (t.cantidades[k] += v));
      f.montos.forEach((v, k) => (t.montos[k] += v));
      t.total += f.total;
      return t;
    }, vacia('Total'));
    return { filas: todas, total };
  }, [datos.data, buscar, orden]);

  async function descargar() {
    setExportando(true);
    try {
      await exportar(filas, total, `CONSOLIDADO DE RETOMAS ${desde || 'inicio'} a ${hasta || 'hoy'}`);
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

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  const td = 'whitespace-nowrap px-2 py-2 text-right tabular-nums';
  const tf = 'sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-border bg-muted px-2 py-2 text-right font-semibold tabular-nums';
  const cant = (v: number, q: string) => (v ? decimal(v, esKg(q) && v % 1 ? 1 : 0) : '');
  const monto = (v: number) => (v ? pesos(v) : '$ -');
  const columnas = 3 + CONCEPTOS.length * 2;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Repeat2 className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Consolidados Retomas</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Histórico sacrificio — retomas acumuladas por firmador.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title={orden === 'nombre' ? 'Ordenar por mayor total' : 'Ordenar por nombre'}
            onClick={() => setOrden(orden === 'nombre' ? 'total' : 'nombre')}
          >
            {orden === 'nombre' ? <ArrowDownWideNarrow /> : <ArrowDownAZ />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title="Exportar a Excel"
            disabled={!filas.length || exportando}
            onClick={descargar}
          >
            {exportando ? <LoaderCircle className="animate-spin" /> : <Download />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title="Refrescar"
            disabled={datos.isFetching}
            onClick={() => datos.refetch()}
          >
            <RefreshCw className={cn(datos.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <Card className="flex shrink-0 flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label htmlFor="hcr-desde">Desde</Label>
          <Input id="hcr-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hcr-hasta">Hasta</Label>
          <Input id="hcr-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {presets.map(([label, fn]) => (
            <Button key={label} variant="outline" size="sm" className="h-9" onClick={fn}>
              {label}
            </Button>
          ))}
        </div>
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Buscar firmador…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <p className="text-sm text-muted-foreground">
          {filas.length} firmadores · {total.reses.toLocaleString('es-CO')} reses · {pesos(total.total)}
        </p>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Firmador</th>
                <th className={cn(th, 'text-right')}>Reses</th>
                {CONCEPTOS.map(([q, , , t]) => (
                  <th key={q} className={cn(th, 'text-right')}>
                    {t}
                    {esKg(q) && ' (kg)'}
                  </th>
                ))}
                {CONCEPTOS.map(([q, , , t]) => (
                  <th key={`t-${q}`} className={cn(th, 'text-right')}>Total {t.toLowerCase()}</th>
                ))}
                <th className={cn(th, 'text-right')}>Total</th>
              </tr>
            </thead>
            <tbody>
              {datos.isLoading ? (
                <tr>
                  <td colSpan={columnas} className="py-16 text-center text-muted-foreground">
                    <LoaderCircle className="mx-auto size-6 animate-spin" />
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={columnas} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                      <Inbox className="size-8" />
                      <p className="text-sm font-medium">No hay retomas en este rango</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filas.map((f) => (
                  <tr key={f.firmador} className="hover:bg-muted/40 [&>td]:border-b [&>td]:border-border">
                    <td className={cn(td, 'text-left font-medium')}>{f.firmador}</td>
                    <td className={cn(td, 'font-semibold')}>{f.reses.toLocaleString('es-CO')}</td>
                    {CONCEPTOS.map(([q], k) => (
                      <td key={q} className={td}>{cant(f.cantidades[k], q)}</td>
                    ))}
                    {CONCEPTOS.map(([q], k) => (
                      <td key={`t-${q}`} className={cn(td, !f.montos[k] && 'text-muted-foreground')}>{monto(f.montos[k])}</td>
                    ))}
                    <td className={cn(td, 'font-semibold')}>{pesos(f.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr>
                  <td className={cn(tf, 'text-left')}>Total</td>
                  <td className={tf}>{total.reses.toLocaleString('es-CO')}</td>
                  {CONCEPTOS.map(([q], k) => (
                    <td key={q} className={tf}>{cant(total.cantidades[k], q)}</td>
                  ))}
                  {CONCEPTOS.map(([q], k) => (
                    <td key={`t-${q}`} className={tf}>{monto(total.montos[k])}</td>
                  ))}
                  <td className={tf}>{pesos(total.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

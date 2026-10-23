import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowDownAZ, Download, Inbox, Layers, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { cn, plantToday } from '@/lib/utils';
import { calcular, decimal, nombreTarifa, pesos, useBeneficio, type FilaBeneficio } from './beneficio-api';

const mesActual = () => `${plantToday().slice(0, 7)}-01`;
const anioActual = () => `${plantToday().slice(0, 4)}-01-01`;

interface FilaConsolidado {
  firmador: string;
  guias: number;
  reses: number;
  totalSacrificio: number;
}

/**
 * Tabla dinámica de la hoja CONSOLIDADO: suma de total reses por firmador.
 * Se agrupa por el nombre normalizado (sin "SAS", puntos ni tildes) para que
 * "AGROPECUARIA SANTACRUZ" y "AGROPECUARIA SANTACRUZ SAS" sumen juntos; se
 * muestra la forma del nombre con más registros.
 */
function consolidar(filas: FilaBeneficio[]) {
  const mapa = new Map<string, FilaConsolidado & { nombres: Map<string, number> }>();
  for (const f of filas) {
    const nombre = f.firmador?.trim() || '(vacío)';
    const clave = nombreTarifa(nombre) || nombre;
    const c = calcular(f);
    const g = mapa.get(clave) ?? { firmador: nombre, guias: 0, reses: 0, totalSacrificio: 0, nombres: new Map() };
    g.guias++;
    g.reses += c.reses;
    g.totalSacrificio += c.totalSacrificio;
    g.nombres.set(nombre, (g.nombres.get(nombre) ?? 0) + 1);
    mapa.set(clave, g);
  }
  return [...mapa.values()].map(({ nombres, ...g }) => ({
    ...g,
    firmador: [...nombres].sort((a, b) => b[1] - a[1])[0][0],
  }));
}

async function exportar(filas: FilaConsolidado[], total: FilaConsolidado, nombre: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CONSOLIDADO');
  ws.columns = [{ width: 50 }, { width: 20 }, { width: 12 }, { width: 20 }];
  const head = ws.addRow(['FIRMADOR', 'Suma de TOTAL RESES', '% RESES', 'TOTAL SACRIFICIO']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  });
  for (const f of filas) {
    const r = ws.addRow([f.firmador, f.reses, total.reses ? f.reses / total.reses : 0, f.totalSacrificio]);
    r.getCell(3).numFmt = '0.0%';
    r.getCell(4).numFmt = '"$" #,##0';
  }
  const t = ws.addRow(['Total Result', total.reses, 1, total.totalSacrificio]);
  t.font = { bold: true };
  t.getCell(3).numFmt = '0.0%';
  t.getCell(4).numFmt = '"$" #,##0';

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

export function ConsolidadoHistoricoPage() {
  const [desde, setDesde] = useState(anioActual);
  const [hasta, setHasta] = useState(plantToday);
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState<'nombre' | 'reses'>('nombre');
  const [exportando, setExportando] = useState(false);

  const datos = useBeneficio(desde, hasta);

  const { filas, total } = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    const todas = consolidar(datos.data ?? []).filter((f) => !q || f.firmador.toUpperCase().includes(q));
    todas.sort((a, b) =>
      orden === 'reses' ? b.reses - a.reses : a.firmador.localeCompare(b.firmador, 'es'),
    );
    const total = todas.reduce(
      (t, f) => ({ ...t, guias: t.guias + f.guias, reses: t.reses + f.reses, totalSacrificio: t.totalSacrificio + f.totalSacrificio }),
      { firmador: 'Total', guias: 0, reses: 0, totalSacrificio: 0 },
    );
    return { filas: todas, total };
  }, [datos.data, buscar, orden]);

  const maxReses = Math.max(1, ...filas.map((f) => f.reses));

  async function descargar() {
    setExportando(true);
    try {
      await exportar(filas, total, `CONSOLIDADO ${desde || 'inicio'} a ${hasta || 'hoy'}`);
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

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  const td = 'whitespace-nowrap px-3 py-2 tabular-nums';
  const tf = 'sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-border bg-muted px-3 py-2 font-semibold tabular-nums';

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Layers className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Consolidados</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Histórico sacrificio — total de reses beneficiadas por firmador.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title={orden === 'nombre' ? 'Ordenar por más reses' : 'Ordenar por nombre'}
            onClick={() => setOrden(orden === 'nombre' ? 'reses' : 'nombre')}
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
          <Label htmlFor="hc-desde">Desde</Label>
          <Input id="hc-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hc-hasta">Hasta</Label>
          <Input id="hc-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
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
          {filas.length} firmadores · {total.reses.toLocaleString('es-CO')} reses
        </p>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Firmador</th>
                <th className={cn(th, 'text-right')}>Guías</th>
                <th className={cn(th, 'text-right')}>Suma de total reses</th>
                <th className={cn(th, 'w-1/4 text-left')}>% de las reses</th>
                <th className={cn(th, 'text-right')}>Total sacrificio</th>
              </tr>
            </thead>
            <tbody>
              {datos.isLoading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-muted-foreground">
                    <LoaderCircle className="mx-auto size-6 animate-spin" />
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                      <Inbox className="size-8" />
                      <p className="text-sm font-medium">No hay beneficio registrado en este rango</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filas.map((f) => {
                  const pct = total.reses ? (f.reses * 100) / total.reses : 0;
                  return (
                    <tr key={f.firmador} className="hover:bg-muted/40 [&>td]:border-b [&>td]:border-border">
                      <td className={cn(td, 'font-medium')}>{f.firmador}</td>
                      <td className={cn(td, 'text-right text-muted-foreground')}>{f.guias.toLocaleString('es-CO')}</td>
                      <td className={cn(td, 'text-right font-semibold')}>{f.reses.toLocaleString('es-CO')}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${(f.reses * 100) / maxReses}%` }} />
                          </div>
                          <span className="w-12 text-right text-xs text-muted-foreground">{decimal(pct, 1)}%</span>
                        </div>
                      </td>
                      <td className={cn(td, 'text-right')}>{pesos(f.totalSacrificio)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr>
                  <td className={tf}>Total</td>
                  <td className={cn(tf, 'text-right')}>{total.guias.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{total.reses.toLocaleString('es-CO')}</td>
                  <td className={tf}>100%</td>
                  <td className={cn(tf, 'text-right')}>{pesos(total.totalSacrificio)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

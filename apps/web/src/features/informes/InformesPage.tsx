import { useState } from 'react';
import {
  FileBarChart,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  ListOrdered,
  Paperclip,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn, plantToday as today } from '@/lib/utils';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { useAuth } from '../auth/auth-context';
import { descargarDespachoExcel, descargarDespachoPdf } from './despacho-canales-export';
import { formatOB, type OrdenBeneficioStatus } from '../registrar/orden-beneficio-api';
import { PrepararOrdenDialog } from '../registrar/PrepararOrden';
import {
  useDetalleCanalCaliente,
  useDetalleProduccion,
  useInformeCanalCaliente,
  useInformeProduccion,
  type InformeCanalCalienteRow,
  type InformeProduccionRow,
} from './api';
import {
  ESTADO_OP_LABEL,
  consecutivoProduccion,
  descargarProduccionExcel,
  descargarProduccionPdf,
  totalesEtiquetado,
  totalesProduccion,
} from './produccion-export';

const INFORMES = [
  { key: 'canal-caliente', label: '01.7 CANAL/CALIENTE' },
  { key: 'canal-fria', label: '01.7 CANAL/FRIA' },
  { key: 'productos', label: '01.7 PRODUCTOS' },
  { key: 'produccion', label: 'INFORME PRODUCCIÓN' },
] as const;

type InformeKey = (typeof INFORMES)[number]['key'];

export function InformesPage() {
  const [seleccionado, setSeleccionado] = useState<InformeKey | null>(null);
  const actual = INFORMES.find((i) => i.key === seleccionado);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileBarChart className="size-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Selecciona el informe que quieres consultar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INFORMES.map((i) => (
          <button
            key={i.key}
            type="button"
            onClick={() => setSeleccionado(i.key)}
            className="text-left"
          >
            <Card
              className={cn(
                'flex items-center gap-3 p-5 transition-colors hover:bg-muted/40',
                seleccionado === i.key && 'border-primary bg-muted/40',
              )}
            >
              <FileText className="size-8 shrink-0 text-muted-foreground" />
              <span className="text-base font-medium">{i.label}</span>
            </Card>
          </button>
        ))}
      </div>

      {seleccionado === 'canal-caliente' && <InformeCanalCaliente />}
      {seleccionado === 'produccion' && <InformeProduccion />}
      {actual && seleccionado !== 'canal-caliente' && seleccionado !== 'produccion' && (
        <Card className="flex min-h-[240px] flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="font-semibold">{actual.label}</p>
          <p className="text-sm text-muted-foreground">
            El contenido de este informe está pendiente de definir.
          </p>
        </Card>
      )}
    </div>
  );
}

const ESTADO_LABEL: Record<OrdenBeneficioStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  procesado: 'Procesado',
};

function InformeProduccion() {
  const [hasta, setHasta] = useState(today());
  const [busqueda, setBusqueda] = useState('');
  const informe = useInformeProduccion(hasta);
  const q = busqueda.trim().toUpperCase();
  const rows = (informe.data ?? []).filter(
    (r) =>
      !q ||
      consecutivoProduccion(r).includes(q) ||
      String(r.opNumber) === q ||
      String(r.odNumber) === q,
  );
  const [detalle, setDetalle] = useState<InformeProduccionRow | null>(null);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="size-5" />
            Lista de órdenes de producción
          </CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-64 pl-8 uppercase"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar consecutivo (OD u OP)…"
                aria-label="Buscar consecutivo"
              />
            </div>
            <Input
              type="date"
              className="h-9 w-44"
              value={hasta}
              onChange={(e) => e.target.value && setHasta(e.target.value)}
              aria-label="Fecha de proceso hasta"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Muestra las órdenes registradas o con proceso en los últimos 60 días hasta la fecha elegida.
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-h-[calc(100vh-20rem)] min-h-40 overflow-auto rounded-md border border-border">
          <Table>
            <THead className="sticky top-0 z-10 bg-card">
              <TR>
                <TH>Consecutivo</TH>
                <TH>Cliente</TH>
                <TH>Fec. de proceso</TH>
                <TH className="text-center">Estado</TH>
              </TR>
            </THead>
            <TBody>
              {informe.isLoading ? (
                <TR>
                  <TD colSpan={4} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={4} className="py-8 text-center text-muted-foreground">
                    {q
                      ? 'Ningún consecutivo coincide con la búsqueda.'
                      : 'No hay órdenes de producción en este periodo.'}
                  </TD>
                </TR>
              ) : (
                rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums">
                      <button
                        type="button"
                        onClick={() => setDetalle(r)}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {consecutivoProduccion(r)}
                      </button>
                    </TD>
                    <TD>{r.clienteNit ? `${r.clienteNit} - ${r.cliente}` : r.cliente}</TD>
                    <TD className="tabular-nums">{r.processDate}</TD>
                    <TD className="text-center">{ESTADO_OP_LABEL[r.status]}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </CardContent>
      {detalle && <DetalleProduccionDialog orden={detalle} onClose={() => setDetalle(null)} />}
    </Card>
  );
}

function DetalleProduccionDialog({
  orden,
  onClose,
}: {
  orden: InformeProduccionRow;
  onClose: () => void;
}) {
  const detalle = useDetalleProduccion(orden.id);
  const { user } = useAuth();
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);
  const [preparando, setPreparando] = useState(false);
  const d = detalle.data;
  const tot = d ? totalesProduccion(d) : { piezas: 0, kg: 0 };
  const te = d ? totalesEtiquetado(d) : { canastillas: 0, unds: 0, kg: 0, rendimiento: 0 };
  const generado = new Date(detalle.dataUpdatedAt || Date.now()).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const cab = 'border border-border bg-muted px-3 py-2 text-center text-xs font-semibold uppercase';
  const cel = 'border border-border px-3 py-2 text-center';

  async function exportar(tipo: 'pdf' | 'excel') {
    if (!d) return;
    setExportando(tipo);
    try {
      if (tipo === 'pdf') await descargarProduccionPdf(d, user?.fullName ?? '');
      else await descargarProduccionExcel(d, user?.fullName ?? '');
    } finally {
      setExportando(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Informe de producción consecutivo: ${consecutivoProduccion(orden)} | ${generado}`}
      className="max-w-6xl"
      scrollInterno
    >
      <div className="space-y-5">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="h-9"
            onClick={() => detalle.refetch()}
            disabled={detalle.isFetching}
            title="Actualizar"
          >
            <RefreshCw className={cn('size-4', detalle.isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="Preparar orden"
            title="Preparar orden"
            onClick={() => setPreparando(true)}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('pdf')}
            disabled={!d || exportando !== null}
            title="Exportar a PDF"
          >
            <FileDown className="size-4 text-red-700" />
            {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('excel')}
            disabled={!d || exportando !== null}
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="size-4 text-emerald-700" />
            {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </Button>
        </div>

        {detalle.isLoading || !d ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cab}>Cliente</th>
                  <th className={cab}>Producto terminado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={cel}>{d.cliente}</td>
                  <td className={cn(cel, 'font-bold text-red-600')}>{d.productoTerminado ?? '—'}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cab}>Consecutivo</th>
                  <th className={cab}>Fecha de sacrificio</th>
                  <th className={cab}>Fecha de ingreso</th>
                  <th className={cab}>Lote</th>
                  <th className={cab}>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr className="tabular-nums">
                  <td className={cn(cel, 'font-bold text-red-600')}>{consecutivoProduccion(d)}</td>
                  <td className={cel}>{d.fechaSacrificio ?? '—'}</td>
                  <td className={cel}>{d.fechaIngreso ?? '—'}</td>
                  <td className={cel}>{d.opNumber}</td>
                  <td className={cel}>{ESTADO_OP_LABEL[d.status]}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th colSpan={5} className={cab}>
                    Orden de traslado de M.P a sala No. {d.odNumber}
                  </th>
                </tr>
                <tr>
                  <th className={cn(cab, 'w-20')}>No.</th>
                  <th className={cn(cab, 'w-32')}>Código</th>
                  <th className={cab}>Producto</th>
                  <th className={cn(cab, 'w-40')}>Piezas</th>
                  <th className={cn(cab, 'w-48')}>Cant.(kg)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.detalle.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={cn(cel, 'py-6 text-muted-foreground')}>
                      La orden de despacho aún no tiene canales pesadas en Canal Fría.
                    </td>
                  </tr>
                ) : (
                  d.detalle.map((r, i) => (
                    <tr key={r.codigo} className="even:bg-muted/30">
                      <td className={cel}>{String(i + 1).padStart(2, '0')}</td>
                      <td className={cel}>{r.codigo}</td>
                      <td className={cel}>{r.producto}</td>
                      <td className={cel}>{r.piezas}</td>
                      <td className={cn(cel, 'text-right')}>{kg(r.kg)}</td>
                    </tr>
                  ))
                )}
                <tr className="text-base font-bold">
                  <td colSpan={3} className={cn(cel, 'text-right uppercase')}>
                    Totales
                  </td>
                  <td className={cel}>{tot.piezas}</td>
                  <td className={cn(cel, 'text-right')}>{kg(tot.kg)}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th colSpan={8} className={cab}>
                    Orden de producción (pesaje y etiquetado) No. {d.opNumber}
                  </th>
                </tr>
                <tr>
                  <th className={cn(cab, 'w-14')}>No.</th>
                  <th className={cn(cab, 'w-24')}>Código</th>
                  <th className={cab}>Producto</th>
                  <th className={cab}>Tienda</th>
                  <th className={cn(cab, 'w-32')}>N.º canastilla</th>
                  <th className={cn(cab, 'w-20')}>Unds</th>
                  <th className={cn(cab, 'w-32')}>Cant.(kg)</th>
                  <th className={cn(cab, 'w-24')}>RND(%)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.etiquetado.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={cn(cel, 'py-6 text-muted-foreground')}>
                      Aún no hay productos etiquetados en Rotulado Desposte para esta orden.
                    </td>
                  </tr>
                ) : (
                  d.etiquetado.map((r, i) => (
                    <tr key={`${r.codigo}-${r.tiendaCodigo}-${r.canastilla ?? i}`} className="even:bg-muted/30">
                      <td className={cel}>{String(i + 1).padStart(2, '0')}</td>
                      <td className={cel}>{r.codigo}</td>
                      <td className={cel}>{r.producto}</td>
                      <td className={cel}>
                        {r.tiendaCodigo} - {r.tienda}
                        {r.sobrantes > 0 && (
                          <span className="ml-1.5 rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                            {r.sobrantes} SOBRANTE{r.sobrantes > 1 ? 'S' : ''}
                          </span>
                        )}
                      </td>
                      <td className={cn(cel, 'font-semibold')}>{r.canastilla ?? '—'}</td>
                      <td className={cel}>{r.unds}</td>
                      <td className={cn(cel, 'text-right')}>{kg(r.kg)}</td>
                      <td className={cel}>{kg(r.rendimiento)}</td>
                    </tr>
                  ))
                )}
                <tr className="text-base font-bold">
                  <td colSpan={4} className={cn(cel, 'text-right uppercase')}>
                    Totales
                  </td>
                  <td className={cel}>{te.canastillas} canast.</td>
                  <td className={cel}>{te.unds}</td>
                  <td className={cn(cel, 'text-right')}>{kg(te.kg)}</td>
                  <td className={cel}>{kg(te.rendimiento)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
      {preparando && (
        <PrepararOrdenDialog
          orden={{
            id: orden.id,
            opNumber: orden.opNumber,
            odNumber: orden.odNumber,
            clienteId: orden.clienteId,
            clienteNit: orden.clienteNit,
            clienteNombre: orden.cliente,
          }}
          onClose={() => setPreparando(false)}
        />
      )}
    </Dialog>
  );
}

function InformeCanalCaliente() {
  const [fecha, setFecha] = useState(today());
  const [hasta, setHasta] = useState(fecha);
  const informe = useInformeCanalCaliente(hasta);
  const rows = informe.data ?? [];
  const [detalle, setDetalle] = useState<InformeCanalCalienteRow | null>(null);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="size-5" />
            Lista de órdenes de canal caliente
          </CardTitle>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (fecha) setHasta(fecha);
            }}
          >
            <Input
              type="date"
              className="h-9 w-44"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Fecha de proceso hasta"
            />
            <Button type="submit" variant="outline" className="h-9" title="Filtrar">
              <Filter className="size-4" />
              Filtrar
            </Button>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">
          Muestra los últimos 60 días hasta la fecha elegida.
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-h-[560px] overflow-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR>
                <TH>OD No.</TH>
                <TH>Cliente</TH>
                <TH>Tipo</TH>
                <TH>Fec. de proceso</TH>
                <TH className="text-center">Estado</TH>
              </TR>
            </THead>
            <TBody>
              {informe.isLoading ? (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                    No hay órdenes de canal caliente en este periodo.
                  </TD>
                </TR>
              ) : (
                rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums">
                      <button
                        type="button"
                        onClick={() => setDetalle(r)}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {formatOB(r.reference)}
                      </button>
                    </TD>
                    <TD>{clienteConDestino(r)}</TD>
                    <TD>CANAL/CALIENTE</TD>
                    <TD className="tabular-nums">{r.date}</TD>
                    <TD className="text-center">{ESTADO_LABEL[r.status]}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </CardContent>
      {detalle && (
        <DetalleCanalCalienteDialog orden={detalle} onClose={() => setDetalle(null)} />
      )}
    </Card>
  );
}

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clienteConDestino = (o: { cliente: string; destino: string | null }) =>
  o.destino ? `${o.cliente} (${o.destino.toUpperCase()})` : o.cliente;

function DetalleCanalCalienteDialog({
  orden,
  onClose,
}: {
  orden: InformeCanalCalienteRow;
  onClose: () => void;
}) {
  const detalle = useDetalleCanalCaliente(orden.id);
  const { user } = useAuth();
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);
  const piezas = detalle.data?.piezas ?? [];
  const total = piezas.reduce((a, p) => a + p.pesoKg, 0);
  const celda = 'border border-border px-3 py-2';

  async function exportar(tipo: 'pdf' | 'excel') {
    if (!detalle.data) return;
    setExportando(tipo);
    try {
      if (tipo === 'pdf') await descargarDespachoPdf(detalle.data, user?.fullName ?? '');
      else await descargarDespachoExcel(detalle.data, user?.fullName ?? '');
    } finally {
      setExportando(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`OD No.: ${formatOB(orden.reference)}`}
      description={clienteConDestino(detalle.data ?? orden)}
      className="max-w-5xl"
    >
      <div className="space-y-4">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('excel')}
            disabled={!piezas.length || exportando !== null}
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="size-4 text-emerald-700" />
            {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('pdf')}
            disabled={!piezas.length || exportando !== null}
            title="Exportar a PDF"
          >
            <FileDown className="size-4 text-red-700" />
            {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </Button>
        </div>
        <div className="max-h-[420px] overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase">
              <tr>
                <th className={celda}>No.</th>
                <th className={celda}>Barcode</th>
                <th className={celda}>Código</th>
                <th className={celda}>Producto</th>
                <th className={cn(celda, 'text-center')}>Unds.</th>
                <th className={cn(celda, 'text-right')}>Cant. (kg)</th>
              </tr>
            </thead>
            <tbody>
              {detalle.isLoading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : piezas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Esta orden no tiene canales pesadas.
                  </td>
                </tr>
              ) : (
                piezas.map((p, i) => (
                  <tr key={p.piezaId} className="hover:bg-muted/40">
                    <td className={cn(celda, 'tabular-nums')}>{String(i + 1).padStart(2, '0')}</td>
                    <td className={cn(celda, 'tabular-nums')}>
                      {p.canalTipo
                        ? codigoBarras({
                            lote: orden.reference,
                            turno: p.turno ?? p.sequence,
                            canalTipo: p.canalTipo,
                            pieza: p.pieza,
                          })
                        : '—'}
                    </td>
                    <td className={cn(celda, 'tabular-nums')}>{p.codigo}</td>
                    <td className={celda}>{p.producto}</td>
                    <td className={cn(celda, 'text-center tabular-nums')}>01</td>
                    <td className={cn(celda, 'text-right tabular-nums')}>{kg(p.pesoKg)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-xs font-semibold uppercase">
            <tr>
              <th className={celda}>Empaques</th>
              <th className={celda}>Unds.</th>
              <th className={celda}>Total (kg)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-center font-semibold tabular-nums">
              <td className={celda}>{String(piezas.length).padStart(3, '0')}</td>
              <td className={celda}>{String(piezas.length).padStart(3, '0')}</td>
              <td className={celda}>{kg(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

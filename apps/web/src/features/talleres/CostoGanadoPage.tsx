import { useMemo, useState } from 'react';
import { Beef, CircleDollarSign, Pencil, Plus, Scale, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { cn, plantToday } from '@/lib/utils';
import {
  mensajeError,
  METODO_LABEL,
  METODO_VALOR,
  pesos,
  pesosDec,
  totalCosto,
  useCostosGanado,
  useEliminarCostoGanado,
  useGuardarCostoGanado,
  type LoteCosto,
  type MetodoCosto,
} from './maestros-api';
import { Encabezado, etiquetaDia, kg, Kpi, num, SinDatos } from './ui';

export function CostoGanadoPage() {
  const [desde, setDesde] = useState(() => `${plantToday().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(plantToday);
  const [busqueda, setBusqueda] = useState('');
  const [soloSinCosto, setSoloSinCosto] = useState(false);
  const [editar, setEditar] = useState<LoteCosto | null>(null);
  const q = useCostosGanado(desde, hasta);
  const eliminar = useEliminarCostoGanado();

  const lotes = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (q.data ?? []).filter(
      (l) =>
        (!soloSinCosto || !l.costo) &&
        (!t || l.cliente.includes(t) || (l.proveedor ?? '').toUpperCase().includes(t) || l.guias.some((g) => g.includes(t)) || String(l.reference) === t),
    );
  }, [q.data, busqueda, soloSinCosto]);

  const conCosto = lotes.filter((l) => l.costo?.total != null);
  const total = conCosto.reduce((s, l) => s + (l.costo!.total ?? 0), 0);
  const pie = conCosto.reduce((s, l) => s + l.pesoPieKg, 0);
  const canal = conCosto.reduce((s, l) => s + l.pesoCanalKg, 0);
  const th = 'border-b border-border bg-muted px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-2 py-2 text-right tabular-nums';

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Encabezado
        titulo="Costo de ganado"
        descripcion="Liquidación del ganado de cada orden de beneficio: por kg en pie, en finca o en canal, por animal o por valor total del lote."
        cargando={q.isFetching}
        onRefrescar={() => q.refetch()}
      />
      <Card className="flex shrink-0 flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label htmlFor="cg-desde">Sacrificio desde</Label>
          <Input id="cg-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cg-hasta">Hasta</Label>
          <Input id="cg-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="relative min-w-72 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar cliente, proveedor, guía o número de orden" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={soloSinCosto} onChange={(e) => setSoloSinCosto(e.target.checked)} />
          Solo sin costo
        </label>
      </Card>

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Beef} label="Lotes con costo" value={`${conCosto.length} / ${lotes.length}`} detalle={`${num(conCosto.reduce((s, l) => s + l.animales, 0))} animales liquidados`} />
        <Kpi icon={CircleDollarSign} label="Costo total" tone="text-[#156F21]" value={pesos(total)} />
        <Kpi icon={Scale} label="Costo por kg en pie" value={pie ? pesosDec(total / pie) : '—'} detalle={`${kg(pie, 0)} en pie`} />
        <Kpi icon={Scale} label="Costo por kg en canal" value={canal ? pesosDec(total / canal) : '—'} detalle={`${kg(canal, 0)} en canal caliente`} />
      </div>

      <Card className="shrink-0 overflow-hidden">
        <div className="scrollbar-app overflow-x-auto">
          <table className="w-full min-w-[1150px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Sacrificio</th>
                <th className={cn(th, 'text-left')}>Orden</th>
                <th className={cn(th, 'text-left')}>Cliente</th>
                <th className={cn(th, 'text-left')}>Proveedor · guía</th>
                <th className={th}>Animales</th>
                <th className={th}>Peso en pie</th>
                <th className={th}>Peso canal</th>
                <th className={cn(th, 'text-left')}>Forma de liquidar</th>
                <th className={th}>Costo total</th>
                <th className={th}>$/kg pie</th>
                <th className={th}>$/kg canal</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.ordenId} className="hover:bg-muted/40">
                  <td className={cn(td, 'text-left')}>{etiquetaDia(l.fecha)}</td>
                  <td className={cn(td, 'text-left font-semibold')}>
                    OB {l.reference}
                    {l.observaciones && <span className="block text-xs font-normal text-muted-foreground">{l.observaciones}</span>}
                  </td>
                  <td className={cn(td, 'max-w-48 truncate text-left')} title={l.cliente}>{l.cliente}</td>
                  <td className={cn(td, 'max-w-56 text-left')}>
                    <span className="block truncate" title={l.costo?.proveedor ?? l.proveedor ?? ''}>{l.costo?.proveedor ?? l.proveedor ?? '—'}</span>
                    <span className="block truncate text-xs text-muted-foreground">{l.guias.join(', ')}</span>
                  </td>
                  <td className={td}>{l.animales}</td>
                  <td className={td}>{kg(l.pesoPieKg)}</td>
                  <td className={td}>{kg(l.pesoCanalKg)}</td>
                  <td className={cn(td, 'text-left')}>
                    {l.costo ? (
                      <>
                        {METODO_LABEL[l.costo.metodo]}
                        <span className="block text-xs text-muted-foreground">
                          {l.costo.metodo === 'valor_total' ? 'Valor del lote' : pesosDec(l.costo.valorUnitario)}
                          {l.costo.referencia && ` · ${l.costo.referencia}`}
                        </span>
                      </>
                    ) : (
                      <Badge tone="warning">Sin costo</Badge>
                    )}
                  </td>
                  <td className={cn(td, 'font-semibold')}>{l.costo?.total != null ? pesos(l.costo.total) : '—'}</td>
                  <td className={td}>{l.costo?.porKgPie != null ? pesosDec(l.costo.porKgPie) : '—'}</td>
                  <td className={td}>{l.costo?.porKgCanal != null ? pesosDec(l.costo.porKgCanal) : '—'}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>
                    <Button variant={l.costo ? 'ghost' : 'outline'} size="sm" className="h-8" onClick={() => setEditar(l)}>
                      {l.costo ? <Pencil /> : <Plus />} {l.costo ? '' : 'Registrar'}
                    </Button>
                    {l.costo && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Quitar costo"
                        onClick={() => window.confirm(`¿Quitar el costo de la OB ${l.reference}?`) && eliminar.mutate(l.ordenId)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lotes.length && <SinDatos texto="Sin órdenes de beneficio en el periodo" />}
        </div>
      </Card>
      {editar && <CostoDialog lote={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}

function CostoDialog({ lote, onClose }: { lote: LoteCosto; onClose: () => void }) {
  const guardar = useGuardarCostoGanado();
  const c = lote.costo;
  const [metodo, setMetodo] = useState<MetodoCosto>(c?.metodo ?? 'kg_pie');
  const [valor, setValor] = useState(c ? String(c.valorUnitario) : '');
  const [pesoFinca, setPesoFinca] = useState(c?.pesoFincaKg != null ? String(c.pesoFincaKg) : '');
  const [proveedor, setProveedor] = useState(c?.proveedor ?? lote.proveedor ?? '');
  const [referencia, setReferencia] = useState(c?.referencia ?? '');
  const [observaciones, setObservaciones] = useState(c?.observaciones ?? '');
  const [error, setError] = useState('');

  const v = Number(valor.replace(',', '.')) || 0;
  const finca = Number(pesoFinca.replace(',', '.')) || null;
  const total = totalCosto(metodo, v, lote, finca);

  async function enviar() {
    setError('');
    try {
      await guardar.mutateAsync({
        ordenId: lote.ordenId,
        metodo,
        valorUnitario: v,
        pesoFincaKg: metodo === 'kg_finca' ? finca : null,
        proveedor,
        referencia,
        observaciones,
      });
      onClose();
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar el costo.'));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Costo del ganado · OB ${lote.reference}`}
      description={`${lote.cliente} · ${lote.animales} animales · ${kg(lote.pesoPieKg)} en pie · ${kg(lote.pesoCanalKg)} en canal`}
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <Label>Forma de liquidar</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(METODO_LABEL) as MetodoCosto[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodo(m)}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  metodo === m ? 'border-[#156F21] bg-[#156F21] text-white' : 'border-border hover:bg-muted',
                )}
              >
                {METODO_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="cg-valor">{METODO_VALOR[metodo]} ($)</Label>
            <Input id="cg-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))} autoFocus />
          </div>
          {metodo === 'kg_finca' && (
            <div className="space-y-1">
              <Label htmlFor="cg-finca">Peso en finca (kg)</Label>
              <Input id="cg-finca" inputMode="decimal" value={pesoFinca} onChange={(e) => setPesoFinca(e.target.value.replace(/[^\d.,]/g, ''))} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="cg-prov">Proveedor</Label>
            <Input id="cg-prov" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cg-ref">Factura / liquidación</Label>
            <Input id="cg-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cg-obs">Observaciones</Label>
          <Input id="cg-obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-emerald-800">Costo total</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-900">{total != null ? pesos(total) : '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-emerald-800">$/kg en pie</p>
            <p className="font-semibold tabular-nums">{total != null && lote.pesoPieKg ? pesosDec(total / lote.pesoPieKg) : '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-emerald-800">$/kg en canal</p>
            <p className="font-semibold tabular-nums">{total != null && lote.pesoCanalKg ? pesosDec(total / lote.pesoCanalKg) : '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-emerald-800">$/animal</p>
            <p className="font-semibold tabular-nums">{total != null && lote.animales ? pesos(total / lote.animales) : '—'}</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!v || (metodo === 'kg_finca' && !finca) || guardar.isPending}>
            Guardar costo
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

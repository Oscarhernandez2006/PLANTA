import { useMemo, useState } from 'react';
import { Save, Eraser, Hash, Inbox, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { cn } from '@/lib/utils';
import {
  usePesoEnPieList,
  usePesoEnPieNextReference,
  useCreatePesoEnPie,
  type PesoEnPieStatus,
  type TipoPesaje,
} from './api';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function num(s: string) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function kg(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

const statusLabel: Record<PesoEnPieStatus, string> = {
  pendiente: 'Pendiente',
  en_insensibilizacion: 'En insensibilización',
  procesado: 'Procesado',
};
const statusTone: Record<PesoEnPieStatus, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  en_insensibilizacion: 'bg-sky-100 text-sky-700',
  procesado: 'bg-emerald-100 text-emerald-700',
};

export function PesoEnPiePage() {
  const [fecha, setFecha] = useState(today());
  const [guia, setGuia] = useState('');
  const [corral, setCorral] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipoPesaje, setTipoPesaje] = useState<TipoPesaje>('promediado');
  const [pesoTotal, setPesoTotal] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lista = usePesoEnPieList();
  const nextRef = usePesoEnPieNextReference(fecha, true);
  const crear = useCreatePesoEnPie();

  const cantNum = num(cantidad);
  const totalNum = num(pesoTotal);
  const promedio = useMemo(
    () => (cantNum > 0 && totalNum > 0 ? totalNum / cantNum : 0),
    [cantNum, totalNum],
  );

  const canSave = cantNum >= 1 && !crear.isPending;

  function limpiar() {
    setGuia('');
    setCorral('');
    setCantidad('');
    setPesoTotal('');
    setObservaciones('');
    setTipoPesaje('promediado');
    setSaveError(null);
  }

  async function guardar() {
    if (!canSave) return;
    setSaveError(null);
    try {
      const created = await crear.mutateAsync({
        date: fecha,
        guia: guia.trim() || undefined,
        corral: corral.trim() || undefined,
        animalCount: cantNum,
        tipoPesaje,
        pesoTotalKg: totalNum > 0 ? totalNum : undefined,
        observaciones: observaciones.trim() || undefined,
      });
      limpiar();
      setNotice(`Reporte N.º ${created.reference} guardado.`);
      window.setTimeout(() => setNotice(null), 3500);
    } catch {
      setSaveError('No se pudo guardar el reporte.');
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PesoEnPieIcon className="size-9 text-foreground" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Peso en Pie
            </h1>
            <p className="text-sm text-muted-foreground">
              Reporte de animales que ingresan a la planta.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={limpiar}
            disabled={crear.isPending}
          >
            <Eraser /> Limpiar
          </Button>
          <Button onClick={guardar} disabled={!canSave}>
            {crear.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Save />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {notice && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}
      {saveError && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* Formulario */}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref">Referencia</Label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold">
              <Hash className="size-4 text-muted-foreground" />
              {nextRef.data?.next ?? '—'}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guia">Guía de movilidad</Label>
            <Input
              id="guia"
              value={guia}
              onChange={(e) => setGuia(e.target.value)}
              placeholder="N.º de guía"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="corral">Corral</Label>
            <Input
              id="corral"
              value={corral}
              onChange={(e) => setCorral(e.target.value)}
              placeholder="Corral asignado"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cantidad">N.º de animales</Label>
            <Input
              id="cantidad"
              inputMode="numeric"
              value={cantidad}
              onChange={(e) =>
                setCantidad(e.target.value.replace(/[^0-9]/g, ''))
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo de pesaje</Label>
            <Select
              id="tipo"
              value={tipoPesaje}
              onChange={(e) => setTipoPesaje(e.target.value as TipoPesaje)}
            >
              <option value="promediado">Promediado (peso total)</option>
              <option value="individual">Individual (por animal)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="total">Peso total (kg)</Label>
            <Input
              id="total"
              inputMode="decimal"
              value={pesoTotal}
              onChange={(e) =>
                setPesoTotal(e.target.value.replace(/[^0-9.]/g, ''))
              }
              placeholder="0.0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Peso promedio (kg/animal)</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold text-emerald-700">
              {kg(promedio || null)}
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label htmlFor="obs">Observaciones</Label>
            <Input
              id="obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
      </Card>

      {/* Reportes recientes */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-6 py-3 text-sm font-semibold">
          Reportes recientes
        </div>
        {lista.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : !lista.data?.length ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-8" />
            Aún no hay reportes registrados.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Ref.</TH>
                <TH>Fecha</TH>
                <TH>Guía</TH>
                <TH>Corral</TH>
                <TH className="text-right">Animales</TH>
                <TH className="text-right">Prom. kg</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {lista.data.map((r) => (
                <TR key={r.id}>
                  <TD className="font-semibold">{r.reference}</TD>
                  <TD>{r.date}</TD>
                  <TD>{r.guia ?? '—'}</TD>
                  <TD>{r.corral ?? '—'}</TD>
                  <TD className="text-right">{r.animalCount}</TD>
                  <TD className="text-right">{kg(r.pesoPromedioKg)}</TD>
                  <TD>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        statusTone[r.status],
                      )}
                    >
                      {statusLabel[r.status]}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

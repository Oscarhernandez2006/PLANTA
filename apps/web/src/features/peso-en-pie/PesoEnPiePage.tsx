import { useState } from 'react';
import {
  Calculator,
  Check,
  ClipboardCheck,
  Eraser,
  Gauge,
  Inbox,
  LoaderCircle,
  Pencil,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import {
  usePesoEnPieList,
  usePesoEnPieNextReference,
  useCreatePesoEnPie,
} from './api';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function num(s: string) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function kg(n: number | null | undefined) {
  return (n ?? 0).toLocaleString('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function PesoEnPiePage() {
  const [fecha, setFecha] = useState(today());
  const [guia, setGuia] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [cliente, setCliente] = useState('');
  const [tipoAnimal, setTipoAnimal] = useState('');
  const [corral, setCorral] = useState('');
  const [lote, setLote] = useState('0');
  const [animalNo, setAnimalNo] = useState('');
  const [peso, setPeso] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [tab, setTab] = useState('registro');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lista = usePesoEnPieList();
  const nextRef = usePesoEnPieNextReference(fecha, true);
  const crear = useCreatePesoEnPie();

  const pesoNum = num(peso);
  const reportes = lista.data ?? [];
  const totalAnimales = reportes.reduce((total, reporte) => total + reporte.animalCount, 0);
  const totalKg = reportes.reduce((total, reporte) => total + (reporte.pesoTotalKg ?? 0), 0);
  const tabs: TabItem[] = [
    { value: 'registro', label: `Total: ${totalAnimales} (${kg(totalKg)} kg)` },
    { value: 'observaciones', label: 'Observaciones' },
    { value: 'guias', label: `Guías Abiertas: ${reportes.length}` },
  ];

  const canSave = pesoNum > 0 && !crear.isPending;

  function limpiar() {
    setGuia('');
    setProveedor('');
    setCliente('');
    setTipoAnimal('');
    setCorral('');
    setLote('0');
    setAnimalNo('');
    setPeso('');
    setObservaciones('');
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
        animalCount: 1,
        tipoPesaje: 'individual',
        pesoTotalKg: pesoNum,
        observaciones:
          [
            proveedor && `Proveedor: ${proveedor.trim()}`,
            cliente && `Cliente: ${cliente.trim()}`,
            tipoAnimal && `Animal: ${tipoAnimal}`,
            lote && `Lote: ${lote.trim()}`,
            animalNo && `Animal No.: ${animalNo.trim()}`,
            observaciones.trim(),
          ].filter(Boolean).join(' | ') || undefined,
      });
      limpiar();
      setNotice(`Animal N.º ${created.reference} guardado.`);
      window.setTimeout(() => setNotice(null), 3500);
    } catch {
      setSaveError('No se pudo guardar el reporte.');
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-3 md:p-5">
      <div className="flex flex-wrap items-start gap-2">
        <PesoEnPieIcon className="size-14 rounded-sm border border-border p-1 text-foreground" />
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[auto_minmax(220px,1fr)_auto_auto] sm:items-center">
          <label className="text-lg font-semibold" htmlFor="fecha">Fecha:</label>
          <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-12 max-w-56 text-lg" />
          <Label className="text-lg" htmlFor="guia">Guía de Movilización:</Label>
          <div className="flex gap-2">
            <Input id="guia" value={guia} onChange={(e) => setGuia(e.target.value)} className="h-12 min-w-40 text-lg" />
            <Button aria-label="Guardar registro" title="Guardar registro" onClick={guardar} disabled={!canSave} className="size-12 shrink-0 p-0">
              {crear.isPending ? <LoaderCircle className="animate-spin" /> : <Check className="size-8" />}
            </Button>
            <Button aria-label="Limpiar formulario" title="Limpiar formulario" variant="outline" onClick={limpiar} disabled={crear.isPending} className="size-12 shrink-0 p-0"><Eraser className="size-7" /></Button>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Button aria-label="Calcular" title="Calcular" variant="outline" className="size-12 p-0"><Calculator /></Button>
          <Button aria-label="Auditar" title="Auditar" variant="outline" className="size-12 p-0"><ClipboardCheck /></Button>
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

      <Card className="overflow-hidden rounded-sm border-2">
        <div className="grid gap-3 p-3 md:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="proveedor">Proveedor:</Label><Input id="proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="h-12 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="cliente">Cliente:</Label><Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-12 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="tipo-animal">Tipo de Animal:</Label><Select id="tipo-animal" value={tipoAnimal} onChange={(e) => setTipoAnimal(e.target.value)} className="h-12 text-lg"><option value="">Seleccione...</option><option>Bovino</option></Select></div>
          <div className="space-y-1"><Label htmlFor="corral">Ubicación (Corral):</Label><Select id="corral" value={corral} onChange={(e) => setCorral(e.target.value)} className="h-12 text-lg"><option value="">Seleccione...</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1)}>Corral {i + 1}</option>)}</Select></div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr]">
        <FieldBox label="Lote:"><Input value={lote} onChange={(e) => setLote(e.target.value.replace(/[^0-9]/g, ''))} className="h-20 border-0 text-center text-4xl font-semibold shadow-none" /></FieldBox>
        <FieldBox label="Animal No.:"><Input value={animalNo || String(nextRef.data?.next ?? '')} onChange={(e) => setAnimalNo(e.target.value.replace(/[^0-9]/g, ''))} className="h-20 border-0 text-center text-3xl font-bold shadow-none" /></FieldBox>
        <FieldBox label="Peso (kg):"><Input value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.0" className="h-20 border-0 text-center text-4xl font-bold text-emerald-700 shadow-none" /></FieldBox>
        <div className="flex items-center justify-end gap-2 md:col-span-3"><Button aria-label="Leer báscula" title="Leer báscula" variant="outline" className="size-14 p-0"><Gauge /></Button><Button aria-label="Editar" title="Editar" variant="outline" className="size-14 p-0"><Pencil /></Button><Button aria-label="Imprimir" title="Imprimir" variant="outline" className="size-14 p-0"><Printer /></Button></div>
      </div>

      <Card className="min-h-64 overflow-hidden rounded-sm">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="bg-muted/40" />
        {tab === 'observaciones' ? <div className="p-4"><Input aria-label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones" className="h-32 items-start py-3" /></div> : tab === 'guias' ? <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">{reportes.map((r) => <div key={r.id} className="rounded-md border border-border p-3"><div className="font-semibold">Guía {r.guia ?? 'sin número'}</div><div className="text-sm text-muted-foreground">{r.date} · {kg(r.pesoTotalKg)} kg</div></div>)}</div> : null}
        {tab === 'registro' && lista.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : tab === 'registro' && !reportes.length ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-8" /> Aún no hay animales registrados.
          </div>
        ) : tab === 'registro' ? <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">{reportes.map((r) => <div key={r.id} className="rounded-md border border-border p-3"><div className="text-lg font-bold">Animal N.º {r.reference}</div><div className="text-sm text-muted-foreground">{r.date} · {kg(r.pesoTotalKg)} kg</div></div>)}</div> : null}
      </Card>
    </div>
  );
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="relative rounded-sm border-2 border-border bg-card pt-2"><span className="absolute -top-3 left-3 bg-background px-2 text-xl font-medium">{label}</span>{children}</div>;
}

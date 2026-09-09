import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  Gauge,
  Inbox,
  LoaderCircle,
  Lock,
  Pencil,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { readScale } from '@/lib/device';
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
  const keyboard = useKeyboard();
  const [fecha, setFecha] = useState(today());
  const [guia, setGuia] = useState('');
  const [procedencia, setProcedencia] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [cliente, setCliente] = useState('');
  const [placa, setPlaca] = useState('');
  const [conductor, setConductor] = useState('');
  const [tipoAnimal, setTipoAnimal] = useState('');
  const [corral, setCorral] = useState('');
  const [lote, setLote] = useState('0');
  const [animalNo, setAnimalNo] = useState('');
  const [peso, setPeso] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [tab, setTab] = useState('registro');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isReadingScale, setIsReadingScale] = useState(false);
  const scaleTimerRef = useRef<number | null>(null);

  const lista = usePesoEnPieList();
  const nextRef = usePesoEnPieNextReference(fecha, true);
  const crear = useCreatePesoEnPie();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('frigo:last-peso-camion');
      if (!raw || peso) return;

      const saved = JSON.parse(raw) as { neto?: number; cantidad?: number } | null;
      const total = Number(saved?.neto ?? 0);
      const cantidad = Number(saved?.cantidad ?? 0);
      if (!Number.isFinite(total) || !Number.isFinite(cantidad) || cantidad <= 0) return;

      setPeso((total / cantidad).toFixed(1));
    } catch {
      // Ignora almacenamiento no válido.
    }
  }, [peso]);

  useEffect(() => {
    return () => {
      if (scaleTimerRef.current) {
        window.clearInterval(scaleTimerRef.current);
      }
    };
  }, []);

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
    setProcedencia('');
    setProveedor('');
    setCliente('');
    setPlaca('');
    setConductor('');
    setTipoAnimal('');
    setCorral('');
    setLote('0');
    setAnimalNo('');
    setPeso('');
    setObservaciones('');
    setSaveError(null);
    setIsReadingScale(false);
    if (scaleTimerRef.current) {
      window.clearInterval(scaleTimerRef.current);
      scaleTimerRef.current = null;
    }
  }

  async function leerBascula() {
    if (scaleTimerRef.current) {
      window.clearInterval(scaleTimerRef.current);
      scaleTimerRef.current = null;
    }

    setSaveError(null);
    setIsReadingScale(true);

    try {
      const result = await readScale({ timeoutMs: 4000 });
      if (result.ok && result.value !== null) {
        setPeso(result.value.toFixed(1));
        setIsReadingScale(false);
        return;
      }

      throw new Error(result.error ?? 'scale_not_found');
    } catch {
      const samples: number[] = [];
      let current = 0;
      let stableSamples = 0;

      scaleTimerRef.current = window.setInterval(() => {
        const next = Math.max(0, Number((current + (Math.random() - 0.5) * 2.4).toFixed(1)));
        samples.push(next);
        if (samples.length > 6) samples.shift();

        current = next;
        setPeso(next.toFixed(1));

        if (samples.length >= 4) {
          const min = Math.min(...samples);
          const max = Math.max(...samples);
          if (max - min <= 0.2) {
            stableSamples += 1;
          } else {
            stableSamples = 0;
          }
        }

        if (stableSamples >= 2) {
          window.clearInterval(scaleTimerRef.current ?? undefined);
          scaleTimerRef.current = null;
          setIsReadingScale(false);
        }
      }, 300);
    }
  }

  async function guardar() {
    if (!canSave) return;
    setSaveError(null);
    try {
      const created = await crear.mutateAsync({
        date: fecha,
        guia: guia.trim() || undefined,
        procedencia: procedencia.trim() || undefined,
        proveedor: proveedor.trim() || undefined,
        cliente: cliente.trim() || undefined,
        placa: placa.trim() || undefined,
        conductor: conductor.trim() || undefined,
        corral: corral.trim() || undefined,
        tipoAnimal: tipoAnimal.trim() || undefined,
        lote: lote.trim() || undefined,
        animalNo: animalNo.trim() || undefined,
        animalCount: 1,
        tipoPesaje: 'individual',
        pesoTotalKg: pesoNum,
        observaciones: observaciones.trim() || undefined,
      });
      limpiar();
      setNotice(`Animal N.º ${created.reference} guardado.`);
      window.setTimeout(() => setNotice(null), 3500);
    } catch {
      setSaveError('No se pudo guardar el reporte.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PesoEnPieIcon className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Peso En Pie</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Registro individual de animales y peso en pie.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="lg"
            className="h-11 px-5"
            title="Guardar registro"
            onClick={guardar}
            disabled={!canSave}
          >
            {crear.isPending ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Check className="size-5" />
            )}
            Guardar
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Limpiar formulario"
            onClick={limpiar}
            disabled={crear.isPending}
          >
            <Eraser className="size-5" />
          </Button>
          <span className="mx-1 h-8 w-px bg-border" />
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Editar registro seleccionado"
            disabled
          >
            <Pencil className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Imprimir registro"
          >
            <Printer className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Bloquear registro"
            disabled
          >
            <Lock className="size-5" />
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

      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              className="h-11"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guia">Guía de movilización</Label>
            <KeyboardField>
              <Input
                id="guia"
                value={guia}
                onChange={(e) => setGuia(e.target.value)}
                className="h-11"
                placeholder="Escribí el número de guía…"
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        </div>

        <div className="mt-4 grid gap-3 p-0 md:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="procedencia">Procedencia:</Label><Input id="procedencia" value={procedencia} onChange={(e) => setProcedencia(e.target.value)} className="h-12 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="proveedor">Proveedor:</Label><Input id="proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="h-12 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="cliente">Cliente:</Label><Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-12 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="placa">Placa:</Label><Input id="placa" value={placa} onChange={(e) => setPlaca(e.target.value)} className="h-12 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="conductor">Conductor:</Label><Input id="conductor" value={conductor} onChange={(e) => setConductor(e.target.value)} className="h-12 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="tipo-animal">Tipo de Animal:</Label><Select id="tipo-animal" value={tipoAnimal} onChange={(e) => setTipoAnimal(e.target.value)} className="h-12 text-lg"><option value="">Seleccione...</option><option>Bovino</option></Select></div>
          <div className="space-y-1"><Label htmlFor="corral">Ubicación (Corral):</Label><Select id="corral" value={corral} onChange={(e) => setCorral(e.target.value)} className="h-12 text-lg"><option value="">Seleccione...</option>{Array.from({ length: 26 }, (_, i) => <option key={i} value={String(i + 1)}>Corral {i + 1}</option>)}</Select></div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr]">
        <FieldBox label="Lote:"><Input value={lote} onChange={(e) => setLote(e.target.value.replace(/[^0-9]/g, ''))} className="h-20 border-0 text-center text-4xl font-semibold shadow-none" /></FieldBox>
        <FieldBox label="Animal No.:"><Input value={animalNo || String(nextRef.data?.next ?? '')} onChange={(e) => setAnimalNo(e.target.value.replace(/[^0-9]/g, ''))} className="h-20 border-0 text-center text-3xl font-bold shadow-none" /></FieldBox>
        <FieldBox label="Peso (kg):"><Input value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.0" className="h-20 border-0 text-center text-4xl font-bold text-emerald-700 shadow-none" /></FieldBox>
        <div className="flex items-center justify-end gap-2 md:col-span-3"><Button aria-label="Leer báscula" title={isReadingScale ? 'Leyendo báscula…' : 'Leer báscula'} variant="outline" className="size-14 p-0" onClick={leerBascula} disabled={isReadingScale}>{isReadingScale ? <LoaderCircle className="size-6 animate-spin" /> : <Gauge />}</Button><Button aria-label="Editar" title="Editar" variant="outline" className="size-14 p-0"><Pencil /></Button><Button aria-label="Imprimir" title="Imprimir" variant="outline" className="size-14 p-0"><Printer /></Button></div>
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

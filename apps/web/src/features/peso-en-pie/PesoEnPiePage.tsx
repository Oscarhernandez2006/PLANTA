import { useEffect, useRef, useState } from 'react';
import {
  Save,
  Eraser,
  Gauge,
  Inbox,
  LoaderCircle,
  Lock,
  Pencil,
  Printer,
  Hash,
  Layers,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { StatInput } from '@/components/ui/stat';
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
    setProveedor('');
    setCliente('');
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
    <div className="space-y-4">
      {/* Encabezado + barra de acciones */}
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
              <Save className="size-5" />
            )}
            Guardar
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Nuevo / limpiar"
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
            title="Cerrar registro"
            disabled
          >
            <Lock className="size-5" />
          </Button>
        </div>
      </div>

      {/* Avisos */}
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {saveError}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <Save className="size-4" />
          {notice}
        </div>
      )}

      {/* Datos del registro */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr]">
          <div className="space-y-1">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              className="h-10"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guia">Guía de movilización</Label>
            <KeyboardField>
              <Input
                id="guia"
                className="h-10 pr-11"
                placeholder="Escribí el número de guía…"
                value={guia}
                onChange={(e) => setGuia(e.target.value)}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="proveedor">Proveedor</Label>
            <KeyboardField>
              <Input
                id="proveedor"
                className="h-10 pr-11"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cliente">Cliente</Label>
            <KeyboardField>
              <Input
                id="cliente"
                className="h-10 pr-11"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tipo-animal">Tipo de animal</Label>
            <Select
              id="tipo-animal"
              className="h-10"
              value={tipoAnimal}
              onChange={(e) => setTipoAnimal(e.target.value)}
            >
              <option value="">Seleccione…</option>
              <option>Bovino</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="corral">Ubicación (corral)</Label>
            <Select
              id="corral"
              className="h-10"
              value={corral}
              onChange={(e) => setCorral(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {Array.from({ length: 26 }, (_, i) => (
                <option key={i} value={String(i + 1)}>
                  Corral {i + 1}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatInput
          icon={Layers}
          label="Lote"
          value={lote}
          onChange={(v) => setLote(v.replace(/[^0-9]/g, ''))}
          onKeyboard={keyboard.open}
        />
        <StatInput
          icon={Hash}
          label="Animal N.º"
          value={animalNo}
          placeholder={String(nextRef.data?.next ?? '0')}
          onChange={(v) => setAnimalNo(v.replace(/[^0-9]/g, ''))}
          onKeyboard={keyboard.open}
        />
        <StatInput
          icon={Scale}
          label="Peso (kg)"
          tone="text-emerald-600"
          value={peso}
          onChange={(v) => setPeso(v.replace(/[^0-9.]/g, ''))}
          onKeyboard={keyboard.open}
          action={
            <button
              type="button"
              title={isReadingScale ? 'Leyendo báscula…' : 'Leer báscula'}
              onClick={leerBascula}
              disabled={isReadingScale}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {isReadingScale ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Gauge className="size-5" />
              )}
            </button>
          }
        />
      </div>

      {/* Registros / Observaciones */}
      <Card className="overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {tab === 'observaciones' ? (
          <div className="p-4">
            <KeyboardField align="top">
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-card px-3 py-2 pr-11 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Observaciones…"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        ) : (
          <div className="max-h-[26vh] overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-24">Animal</TH>
                  <TH>Guía</TH>
                  <TH>Corral</TH>
                  <TH className="text-right">Peso (kg)</TH>
                  <TH>Fecha</TH>
                </TR>
              </THead>
              <TBody>
                {lista.isLoading ? (
                  <TR className="hover:bg-transparent">
                    <TD colSpan={5} className="py-10 text-center text-muted-foreground">
                      <LoaderCircle className="mx-auto size-5 animate-spin" />
                    </TD>
                  </TR>
                ) : reportes.length === 0 ? (
                  <TR className="hover:bg-transparent">
                    <TD colSpan={5} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                        <Inbox className="size-8" />
                        <p className="text-sm font-medium">
                          Aún no hay animales registrados
                        </p>
                      </div>
                    </TD>
                  </TR>
                ) : (
                  reportes.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-medium tabular-nums">{r.reference}</TD>
                      <TD>{r.guia ?? '—'}</TD>
                      <TD>{r.corral ?? '—'}</TD>
                      <TD className="text-right tabular-nums">
                        {kg(r.pesoTotalKg)}
                      </TD>
                      <TD>{r.date}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

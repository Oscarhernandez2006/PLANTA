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
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { readScale } from '@/lib/device';
import {
  usePesoEnPieList,
  useCreatePesoEnPie,
  useClosePesoEnPieGuide,
} from './api';
import { usePesoCamionAbiertas, type PesoCamionGuia } from '../peso-en-camion/api';

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
  const [procedencia, setProcedencia] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [cliente, setCliente] = useState('');
  const [placa, setPlaca] = useState('');
  const [conductor, setConductor] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [entrada, setEntrada] = useState('');
  const [salida, setSalida] = useState('');
  const [tipoAnimal, setTipoAnimal] = useState('');
  const [corral, setCorral] = useState('');
  const [peso, setPeso] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [tab, setTab] = useState('registro');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isReadingScale, setIsReadingScale] = useState(false);
  const [processClosed, setProcessClosed] = useState(false);
  const scaleTimerRef = useRef<number | null>(null);

  const lista = usePesoEnPieList();
  const guiasCamion = usePesoCamionAbiertas();
  const crear = useCreatePesoEnPie();
  const cerrarProceso = useClosePesoEnPieGuide();

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
  const reportesGuia = reportes.filter(
    (reporte) => reporte.guia === guia && reporte.date === fecha,
  );
  const animalesRegistrados = reportesGuia.reduce(
    (total, reporte) => total + reporte.animalCount,
    0,
  );
  const animalesObjetivo = cantidad ? num(cantidad) : 0;
  const totalKg = reportesGuia.reduce(
    (total, reporte) => total + (reporte.pesoTotalKg ?? 0),
    0,
  );
  const tabs: TabItem[] = [
    { value: 'registro', label: 'Registro de animales' },
    { value: 'observaciones', label: 'Observaciones' },
    { value: 'guias', label: `Guías Abiertas: ${guiasCamion.data?.length ?? 0}` },
  ];

  const guiaSeleccionada = guia.trim().length > 0 && animalesObjetivo > 0;
  const guiaCompleta = guiaSeleccionada && animalesRegistrados >= animalesObjetivo;
  const camposFaltantes = [
    !guiaSeleccionada && 'Guía de movilización',
    !corral.trim() && 'Corral',
    !tipoAnimal.trim() && 'Tipo de animal',
    pesoNum <= 0 && 'Peso',
  ].filter((campo): campo is string => Boolean(campo));
  function limpiar() {
    setGuia('');
    setProcedencia('');
    setProveedor('');
    setCliente('');
    setPlaca('');
    setConductor('');
    setCantidad('');
    setEntrada('');
    setSalida('');
    setTipoAnimal('');
    setCorral('');
    setPeso('');
    setObservaciones('');
    setSaveError(null);
    setIsReadingScale(false);
    if (scaleTimerRef.current) {
      window.clearInterval(scaleTimerRef.current);
      scaleTimerRef.current = null;
    }
  }

  function limpiarCaptura() {
    setTipoAnimal('');
    setCorral('');
    setPeso('');
    setObservaciones('');
    setSaveError(null);
    setIsReadingScale(false);
    if (scaleTimerRef.current) {
      window.clearInterval(scaleTimerRef.current);
      scaleTimerRef.current = null;
    }
  }

  function seleccionarGuia(guiaCamion: PesoCamionGuia) {
    setFecha(guiaCamion.date);
    setGuia(guiaCamion.guia ?? '');
    setProcedencia(guiaCamion.procedencia ?? '');
    setProveedor(guiaCamion.proveedor ?? '');
    setCliente(guiaCamion.cliente ?? '');
    setPlaca(guiaCamion.placa ?? '');
    setConductor(guiaCamion.conductor ?? '');
    setCantidad(guiaCamion.cantidad == null ? '' : String(guiaCamion.cantidad));
    setEntrada(guiaCamion.entrada == null ? '' : String(guiaCamion.entrada));
    setSalida(guiaCamion.salida == null ? '' : String(guiaCamion.salida));
    setProcessClosed(false);
    setTab('registro');
    setNotice(`Guía ${guiaCamion.guia ?? guiaCamion.reference} cargada para asignar animales.`);
  }

  async function cerrarProcesoPeso() {
    if (!guiaCompleta || processClosed || cerrarProceso.isPending) return;
    setSaveError(null);
    try {
      await cerrarProceso.mutateAsync({ date: fecha, guia: guia.trim() });
      setProcessClosed(true);
      setNotice(`Proceso de la guía ${guia} cerrado correctamente.`);
    } catch (error) {
      const response = (
        error as { response?: { data?: { message?: string | string[] } } }
      ).response;
      const detail = response?.data?.message;
      setSaveError(
        Array.isArray(detail)
          ? detail.join(' ')
          : detail || 'No se pudo cerrar el proceso.',
      );
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
    if (processClosed) {
      setSaveError('El proceso de esta guía ya está cerrado.');
      return;
    }
    if (camposFaltantes.length > 0) {
      setSaveError(`Faltan campos obligatorios: ${camposFaltantes.join(', ')}.`);
      return;
    }
    if (guiaCompleta) {
      setSaveError(`Esta guía ya tiene registrados sus ${animalesObjetivo} animales.`);
      return;
    }
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
        cantidad: cantidad ? Number(cantidad) : undefined,
        entrada: entrada ? Number(entrada) : undefined,
        salida: salida ? Number(salida) : undefined,
        corral: corral.trim() || undefined,
        tipoAnimal: tipoAnimal.trim() || undefined,
        animalCount: 1,
        tipoPesaje: 'individual',
        pesoTotalKg: pesoNum,
        observaciones: observaciones.trim() || undefined,
      });
      limpiarCaptura();
      const siguiente = animalesRegistrados + 1;
      setNotice(
        `Animal N.º ${created.reference} guardado. ${siguiente} de ${animalesObjetivo} animales de la guía.`,
      );
      window.setTimeout(() => setNotice(null), 3500);
    } catch (error) {
      const response = (
        error as {
          response?: { data?: { message?: string | string[] } };
        }
      ).response;
      const detail = response?.data?.message;
      setSaveError(
        Array.isArray(detail)
          ? detail.join(' ')
          : detail || 'No se pudo guardar el reporte.',
      );
    }
  }

  function imprimir() {
    window.print();
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
            disabled={crear.isPending || guiaCompleta || processClosed}
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
            onClick={imprimir}
          >
            <Printer className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Bloquear registro"
            onClick={cerrarProcesoPeso}
            disabled={!guiaCompleta || processClosed || cerrarProceso.isPending}
          >
            {cerrarProceso.isPending ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Lock className="size-5" />
            )}
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
              readOnly
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guia">Guía de movilización</Label>
            <Input
              id="guia"
              value={guia}
              readOnly
              className="h-11 bg-muted/40"
              placeholder="Seleccione una guía abierta…"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 p-0 md:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="procedencia">Procedencia:</Label><Input id="procedencia" value={procedencia} readOnly className="h-12 bg-muted/40 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="proveedor">Proveedor:</Label><Input id="proveedor" value={proveedor} readOnly className="h-12 bg-muted/40 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="cliente">Cliente:</Label><Input id="cliente" value={cliente} readOnly className="h-12 bg-muted/40 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="placa">Placa:</Label><Input id="placa" value={placa} readOnly className="h-12 bg-muted/40 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="conductor">Conductor:</Label><Input id="conductor" value={conductor} readOnly className="h-12 bg-muted/40 text-lg" /></div>
          <div className="space-y-1"><Label htmlFor="tipo-animal">Tipo de Animal:</Label><Select id="tipo-animal" value={tipoAnimal} onChange={(e) => setTipoAnimal(e.target.value)} className="h-12 text-lg"><option value="">Seleccione...</option><option value="MACHO">MACHO</option><option value="HEMBRA">HEMBRA</option><option value="BUFALO">BUFALO</option><option value="BUFALA">BUFALA</option></Select></div>
          <div className="space-y-1"><Label htmlFor="corral">Ubicación (Corral):</Label><Select id="corral" value={corral} onChange={(e) => setCorral(e.target.value)} className="h-12 text-lg"><option value="">Seleccione...</option>{Array.from({ length: 26 }, (_, i) => <option key={i} value={String(i + 1)}>Corral {i + 1}</option>)}</Select></div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
        <FieldBox label="Peso (kg):"><Input value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.0" className="h-20 border-0 text-center text-4xl font-bold text-emerald-700 shadow-none" /></FieldBox>
        <div className="flex items-center justify-end gap-2"><Button aria-label="Leer báscula" title={isReadingScale ? 'Leyendo báscula…' : 'Leer báscula'} variant="outline" className="size-14 p-0" onClick={leerBascula} disabled={isReadingScale}>{isReadingScale ? <LoaderCircle className="size-6 animate-spin" /> : <Gauge />}</Button><Button aria-label="Imprimir" title="Imprimir" variant="outline" className="size-14 p-0" onClick={imprimir}><Printer /></Button></div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Animales de la guía</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{animalesRegistrados} / {animalesObjetivo || '—'}</p>
        </div>
        <div className="border-l border-border pl-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total kg</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{kg(totalKg)} kg</p>
        </div>
      </div>

      {guiaCompleta && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Esta guía ya tiene registrados sus {animalesObjetivo} animales.
        </div>
      )}
      {!guiaSeleccionada && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Selecciona una guía abierta para comenzar a pesar sus animales.
        </div>
      )}

      <Card className="min-h-64 overflow-hidden rounded-sm">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="bg-muted/40" />
        {tab === 'observaciones' ? <div className="p-4"><Input aria-label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones" className="h-32 items-start py-3" /></div> : tab === 'guias' ? <GuiasCamionList guias={guiasCamion.data ?? []} loading={guiasCamion.isLoading} onSelect={seleccionarGuia} /> : null}
        {tab === 'registro' && lista.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : tab === 'registro' && !reportesGuia.length ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-8" /> Aún no hay animales registrados para esta guía.
          </div>
        ) : tab === 'registro' ? (
          <div className="max-h-[36vh] overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Animal</TH>
                  <TH>Tipo</TH>
                  <TH>Corral</TH>
                  <TH>Fecha</TH>
                  <TH className="text-right">Peso (kg)</TH>
                </TR>
              </THead>
              <TBody>
                {reportesGuia.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-semibold tabular-nums">N.º {r.reference}</TD>
                    <TD>{r.tipoAnimal ?? '—'}</TD>
                    <TD>{r.corral ? `Corral ${r.corral}` : '—'}</TD>
                    <TD className="text-muted-foreground">{r.date}</TD>
                    <TD className="text-right font-semibold tabular-nums">
                      {kg(r.pesoTotalKg)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function GuiasCamionList({
  guias,
  loading,
  onSelect,
}: {
  guias: PesoCamionGuia[];
  loading: boolean;
  onSelect: (guia: PesoCamionGuia) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Cargando guías de Peso en Camión…
      </div>
    );
  }

  if (!guias.length) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <Inbox className="size-8" />
        <p className="font-medium">No hay guías abiertas</p>
        <p>Registra una guía en Peso en Camión para asignarle animales.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {guias.map((guia) => (
        <button
          key={guia.id}
          type="button"
          onClick={() => onSelect(guia)}
          className="rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">
              Guía {guia.guia ?? `Ref. ${guia.reference}`}
            </span>
            <span className="text-xs text-muted-foreground">{guia.date}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Placa: {guia.placa ?? '—'}</span>
            <span>Animales: {guia.cantidad ?? '—'}</span>
            <span>Entrada: {guia.entrada ?? '—'} kg</span>
            <span>Salida: {guia.salida ?? '—'} kg</span>
          </div>
          <div className="mt-2 text-xs font-medium text-primary">
            Clic para asignar animales
          </div>
        </button>
      ))}
    </div>
  );
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="relative rounded-sm border-2 border-border bg-card pt-2"><span className="absolute -top-3 left-3 bg-background px-2 text-xl font-medium">{label}</span>{children}</div>;
}

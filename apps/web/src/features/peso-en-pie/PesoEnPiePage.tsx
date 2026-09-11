import { useEffect, useState } from 'react';
import {
  Beef,
  Check,
  Eraser,
  Gauge,
  Hash,
  Inbox,
  LoaderCircle,
  Lock,
  Package,
  Printer,
  RefreshCw,
  Scale,
  Sigma,
  Tag,
  Weight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { StatValue, StatInput } from '@/components/ui/stat';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { cn } from '@/lib/utils';
import { readScale } from '@/lib/device';
import { useAuth } from '@/features/auth/auth-context';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { downloadReciboPiePdf } from './recibo-print';
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
  const [tab, setTab] = useState('guias');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isReadingScale, setIsReadingScale] = useState(false);
  const [processClosed, setProcessClosed] = useState(false);

  const { user } = useAuth();
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
  // Corral del primer animal registrado en la guía: se usa como valor por
  // defecto para los siguientes animales (editable).
  const corralGuia =
    reportesGuia
      .slice()
      .sort((a, b) => a.reference - b.reference)
      .map((reporte) => reporte.corral?.trim())
      .find((valor): valor is string => Boolean(valor)) ?? '';

  useEffect(() => {
    if (corralGuia && !corral) setCorral(corralGuia);
  }, [corralGuia, corral]);

  const tabs: TabItem[] = [
    { value: 'guias', label: `Guías Abiertas: ${guiasCamion.data?.length ?? 0}` },
    { value: 'registro', label: 'Registro de animales' },
    { value: 'observaciones', label: 'Observaciones' },
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
  }

  function limpiarCaptura() {
    setTipoAnimal('');
    setCorral('');
    setPeso('');
    setObservaciones('');
    setSaveError(null);
    setIsReadingScale(false);
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
    setCorral('');
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
    setSaveError(null);
    setIsReadingScale(true);

    try {
      const result = await readScale({ timeoutMs: 4000 });
      if (result.ok && result.value !== null) {
        setPeso(result.value.toFixed(2));
        return;
      }
      throw new Error(result.error ?? 'scale_not_found');
    } catch (e) {
      setSaveError(
        (e as Error)?.message === 'scale_not_found'
          ? 'No se detectó la báscula. Revisa la conexión y el puerto COM.'
          : 'No se pudo leer la báscula. Revisa la conexión y el puerto COM.',
      );
    } finally {
      setIsReadingScale(false);
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
    const entradaNum = num(entrada);
    const salidaNum = num(salida);
    const netoNum = entradaNum - salidaNum;
    const cantNum = num(cantidad);
    const promNum = cantNum > 0 ? netoNum / cantNum : 0;
    const referencia = reportesGuia.length
      ? String(Math.min(...reportesGuia.map((r) => r.reference)))
      : '';
    void downloadReciboPiePdf({
      guia,
      fecha,
      proveedor,
      procedencia,
      ciudad: '',
      cliente,
      referencia,
      placa,
      conductor,
      entrada: kg(entradaNum),
      salida: kg(salidaNum),
      neto: kg(netoNum),
      cantidad: cantidad || '0',
      prom: kg(promNum),
      observaciones,
      animales: reportesGuia
        .slice()
        .sort((a, b) => a.reference - b.reference)
        .map((r) => ({
          registro: `N.º ${r.reference}`,
          animal: r.animalNo ?? String(r.reference),
          tipo: r.tipoAnimal ?? '',
          cantidad: r.pesoTotalKg ?? 0,
          corral: r.corral ? `Corral ${r.corral}` : '',
          observaciones: r.observaciones ?? '',
        })),
      operario: user?.fullName ?? '',
      impreso: new Date().toLocaleString('es-CO'),
      logoUrl: new URL(logoSantaCruz, window.location.href).href,
    });
  }

  function imprimirPrecinto() {
    if (!guiaSeleccionada) {
      setSaveError('Selecciona una guía abierta para imprimir precintos.');
      return;
    }
    setSaveError(null);
    setNotice('Enviando precinto a la impresora de etiquetas…');
    window.setTimeout(() => setNotice(null), 3000);
  }

  return (
    <div className="space-y-4">
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
            className="h-9 px-5"
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
            className="size-9"
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
            className="size-9"
            title="Imprimir registro"
            onClick={imprimir}
          >
            <Printer className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
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
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            title="Actualizar"
            onClick={() => {
              lista.refetch();
              guiasCamion.refetch();
            }}
            disabled={lista.isFetching || guiasCamion.isFetching}
          >
            <RefreshCw
              className={cn(
                'size-5',
                (lista.isFetching || guiasCamion.isFetching) && 'animate-spin',
              )}
            />
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

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr]">
          <div className="space-y-1">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              className="h-9"
              value={fecha}
              min={fecha}
              max={fecha}
              onKeyDown={(e) => e.preventDefault()}
              onChange={() => {}}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guia">Guía de movilización</Label>
            <Input
              id="guia"
              value={guia}
              readOnly
              className="h-9 bg-muted/40"
              placeholder="Seleccione una guía abierta…"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="procedencia">Procedencia</Label>
            <Input id="procedencia" value={procedencia} readOnly className="h-9 bg-muted/40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="proveedor">Proveedor</Label>
            <Input id="proveedor" value={proveedor} readOnly className="h-9 bg-muted/40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cliente">Cliente</Label>
            <Input id="cliente" value={cliente} readOnly className="h-9 bg-muted/40" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="placa">Placa</Label>
            <Input id="placa" value={placa} readOnly className="h-9 bg-muted/40" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="conductor">Conductor</Label>
            <Input id="conductor" value={conductor} readOnly className="h-9 bg-muted/40" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tipo-animal">Tipo de Animal</Label>
            <Select id="tipo-animal" value={tipoAnimal} onChange={(e) => setTipoAnimal(e.target.value)} className="h-9">
              <option value="">Seleccione...</option>
              <option value="MACHO">MACHO</option>
              <option value="HEMBRA">HEMBRA</option>
              <option value="BUFALO">BUFALO</option>
              <option value="BUFALA">BUFALA</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="corral">Ubicación (Corral)</Label>
            <Select id="corral" value={corral} onChange={(e) => setCorral(e.target.value)} className="h-9">
              <option value="">Seleccione...</option>
              {Array.from({ length: 26 }, (_, i) => <option key={i} value={String(i + 1)}>Corral {i + 1}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatValue
          icon={Hash}
          label="Referencia"
          value={animalesObjetivo ? String(animalesRegistrados + 1) : '—'}
        />
        <StatValue
          icon={Package}
          label="Cant."
          value={animalesObjetivo ? String(animalesObjetivo) : '0'}
        />
        <StatValue
          icon={Beef}
          label="Registrados"
          value={String(animalesRegistrados)}
        />
        <StatValue
          icon={Scale}
          label="Total (kg)"
          tone="text-emerald-600"
          value={kg(totalKg)}
        />
        <StatValue
          icon={Sigma}
          label="Prom. (kg)"
          value={kg(animalesRegistrados > 0 ? totalKg / animalesRegistrados : 0)}
        />
        <StatInput
          icon={Weight}
          label="Peso (kg)"
          tone="text-emerald-700"
          value={peso}
          onChange={(v) => setPeso(v.replace(/[^0-9.]/g, ''))}
          onKeyboard={leerBascula}
          placeholder="0.00"
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Leer báscula"
                title={isReadingScale ? 'Leyendo báscula…' : 'Leer báscula'}
                onClick={leerBascula}
                disabled={isReadingScale}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {isReadingScale ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Gauge className="size-4" />
                )}
              </button>
              <button
                type="button"
                aria-label="Imprimir precinto"
                title="Imprimir precinto / etiqueta"
                onClick={imprimirPrecinto}
                className="text-muted-foreground hover:text-foreground"
              >
                <Tag className="size-4" />
              </button>
            </div>
          }
        />
      </div>

      {guiaCompleta && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
          Esta guía ya tiene registrados sus {animalesObjetivo} animales.
        </div>
      )}
      {!guiaSeleccionada && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
          Selecciona una guía abierta para comenzar a pesar sus animales.
        </div>
      )}

      <Card className="overflow-hidden rounded-sm">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="bg-muted/40" />
        {tab === 'observaciones' ? <div className="p-4"><Input aria-label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones" className="h-32 items-start py-3" /></div> : tab === 'guias' ? <GuiasCamionList guias={guiasCamion.data ?? []} loading={guiasCamion.isLoading} onSelect={seleccionarGuia} /> : null}
        {tab === 'registro' && lista.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : tab === 'registro' && !reportesGuia.length ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <Inbox className="size-8" /> Aún no hay animales registrados para esta guía.
          </div>
        ) : tab === 'registro' ? (
          <div className="max-h-[26vh] overflow-auto">
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
      <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <Inbox className="size-8" />
        <p className="font-medium">No hay guías abiertas</p>
        <p>Registra una guía en Peso en Camión para asignarle animales.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[26vh] overflow-auto">
      <Table>
        <THead>
          <TR>
            <TH>Guía</TH>
            <TH>Cliente</TH>
            <TH>Fecha</TH>
            <TH>Placa</TH>
            <TH className="text-right">Animales</TH>
            <TH className="text-right">Entrada (kg)</TH>
            <TH className="text-right">Salida (kg)</TH>
            <TH className="text-right">Acción</TH>
          </TR>
        </THead>
        <TBody>
          {guias.map((guia) => (
            <TR
              key={guia.id}
              className="cursor-pointer"
              onClick={() => onSelect(guia)}
            >
              <TD className="font-semibold">
                {guia.guia ?? `Ref. ${guia.reference}`}
              </TD>
              <TD className="font-medium">{guia.cliente ?? '—'}</TD>
              <TD className="text-muted-foreground">{guia.date}</TD>
              <TD>{guia.placa ?? '—'}</TD>
              <TD className="text-right tabular-nums">{guia.cantidad ?? '—'}</TD>
              <TD className="text-right tabular-nums">{guia.entrada ?? '—'}</TD>
              <TD className="text-right tabular-nums">{guia.salida ?? '—'}</TD>
              <TD className="text-right text-sm font-medium text-primary">
                Asignar animales
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}


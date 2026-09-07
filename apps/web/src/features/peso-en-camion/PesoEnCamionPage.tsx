import { useEffect, useRef, useState } from 'react';
import {
  Save,
  Eraser,
  Pencil,
  Printer,
  Lock,
  Hash,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Sigma,
  Inbox,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { PesoEnCamionIcon } from '@/components/icons/PesoEnCamionIcon';
import { useAuth } from '@/features/auth/auth-context';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { ProcedenciaModal } from './ProcedenciaModal';
import { ProveedorModal } from './ProveedorModal';
import { ClienteModal } from './ClienteModal';
import { ConductorModal } from './ConductorModal';
import {
  usePesoCamionAbiertas,
  usePesoCamionNextReference,
  useCreatePesoCamion,
  useUpdatePesoCamion,
  type PesoCamionGuia,
  type SavePesoCamionInput,
} from './api';
import { downloadReciboPdf } from './recibo-print';
import { cn } from '@/lib/utils';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function kg(n: number) {
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

const fieldClass = 'h-11 pr-11';
const areaClass = cn(
  'flex min-h-[64px] w-full rounded-md border border-input bg-card px-3 py-2 pr-11 text-sm shadow-sm transition-colors',
  'placeholder:text-muted-foreground resize-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

function num(s: string) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function PesoEnCamionPage() {
  const keyboard = useKeyboard();
  const { user } = useAuth();
  const [tab, setTab] = useState('guias');

  const [fecha, setFecha] = useState(today());
  const [guia, setGuia] = useState('');
  const [procedencia, setProcedencia] = useState('');
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [proveedor, setProveedor] = useState('');
  const [provModalOpen, setProvModalOpen] = useState(false);
  const [cliente, setCliente] = useState('');
  const [cliModalOpen, setCliModalOpen] = useState(false);
  const [placa, setPlaca] = useState('');
  const [conductor, setConductor] = useState('');
  const [condModalOpen, setCondModalOpen] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [entrada, setEntrada] = useState('');
  const [salida, setSalida] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Aviso breve de confirmación tras guardar (el formulario se limpia enseguida).
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  // Guía cargada en el formulario para editar (null = guía nueva).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadedReference, setLoadedReference] = useState<number | null>(null);
  // Guía resaltada en la lista (para editar / imprimir / bloquear).
  const [selectedGuia, setSelectedGuia] = useState<PesoCamionGuia | null>(null);

  const abiertas = usePesoCamionAbiertas();
  const nextRef = usePesoCamionNextReference(fecha, !editingId);
  const createGuia = useCreatePesoCamion();
  const updateGuia = useUpdatePesoCamion();

  // Referencia (orden de llegada del día): la de la guía cargada o el próximo.
  const referencia = editingId
    ? loadedReference != null
      ? String(loadedReference)
      : '—'
    : String(nextRef.data?.next ?? '—');

  // Totales derivados.
  const neto = num(entrada) - num(salida);
  const cantNum = num(cantidad);
  const prom = cantNum > 0 ? neto / cantNum : 0;

  // Al editar cualquier campo, el guardado deja de estar vigente.
  useEffect(() => {
    setSaved(false);
  }, [
    fecha,
    guia,
    procedencia,
    proveedor,
    cliente,
    placa,
    conductor,
    observaciones,
    cantidad,
    entrada,
    salida,
  ]);

  const savedText = saved ? 'text-emerald-600 font-medium' : undefined;

  function buildInput(): SavePesoCamionInput {
    return {
      date: fecha || undefined,
      guia: guia.trim() || undefined,
      procedencia: procedencia.trim() || undefined,
      proveedor: proveedor.trim() || undefined,
      cliente: cliente.trim() || undefined,
      placa: placa.trim() || undefined,
      conductor: conductor.trim() || undefined,
      observaciones: observaciones.trim() || undefined,
      cantidad: cantidad ? parseInt(cantidad, 10) : undefined,
      entrada: entrada ? parseFloat(entrada) : undefined,
      salida: salida ? parseFloat(salida) : undefined,
    };
  }

  // Vacía el formulario para empezar una guía nueva.
  function resetForm() {
    setEditingId(null);
    setSelectedGuia(null);
    setLoadedReference(null);
    setFecha(today());
    setGuia('');
    setProcedencia('');
    setProveedor('');
    setCliente('');
    setPlaca('');
    setConductor('');
    setObservaciones('');
    setCantidad('');
    setEntrada('');
    setSalida('');
    setSaved(false);
    setSaveError(null);
  }

  function showNotice(msg: string) {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  async function guardar() {
    setSaveError(null);
    try {
      let ref: number;
      if (editingId) {
        const updated = await updateGuia.mutateAsync({
          id: editingId,
          input: buildInput(),
        });
        ref = updated.reference;
      } else {
        const created = await createGuia.mutateAsync(buildInput());
        ref = created.reference;
      }
      // Limpia enseguida para poder capturar la siguiente guía.
      resetForm();
      showNotice(`Guía N.º ${ref} guardada. Listo para la siguiente.`);
    } catch {
      setSaveError('No se pudo guardar la guía.');
    }
  }

  function loadGuia(g: PesoCamionGuia) {
    setEditingId(g.id);
    setSelectedGuia(g);
    setLoadedReference(g.reference);
    setFecha(g.date);
    setGuia(g.guia ?? '');
    setProcedencia(g.procedencia ?? '');
    setProveedor(g.proveedor ?? '');
    setCliente(g.cliente ?? '');
    setPlaca(g.placa ?? '');
    setConductor(g.conductor ?? '');
    setObservaciones(g.observaciones ?? '');
    setCantidad(g.cantidad != null ? String(g.cantidad) : '');
    setEntrada(g.entrada != null ? String(g.entrada) : '');
    setSalida(g.salida != null ? String(g.salida) : '');
    setSaveError(null);
    setNotice(null);
  }

  function limpiar() {
    resetForm();
    setNotice(null);
  }

  // El lápiz carga la guía seleccionada en el formulario para editarla.
  function editar() {
    if (selectedGuia) loadGuia(selectedGuia);
  }

  function reciboFromForm() {
    return {
      guia,
      fecha,
      proveedor,
      procedencia,
      ciudad: '',
      cliente,
      referencia,
      placa,
      conductor,
      entrada: kg(num(entrada)),
      salida: kg(num(salida)),
      neto: kg(neto),
      cantidad: cantidad || '0',
      prom: kg(prom),
      observaciones,
      operario: user?.fullName ?? '',
      impreso: new Date().toLocaleString('es-CO'),
      logoUrl: new URL(logoSantaCruz, window.location.href).href,
    };
  }

  function reciboFromGuia(g: PesoCamionGuia) {
    const gNeto = (g.entrada ?? 0) - (g.salida ?? 0);
    const gProm = g.cantidad && g.cantidad > 0 ? gNeto / g.cantidad : 0;
    return {
      guia: g.guia ?? '',
      fecha: g.date,
      proveedor: g.proveedor ?? '',
      procedencia: g.procedencia ?? '',
      ciudad: '',
      cliente: g.cliente ?? '',
      referencia: String(g.reference),
      placa: g.placa ?? '',
      conductor: g.conductor ?? '',
      entrada: kg(g.entrada ?? 0),
      salida: kg(g.salida ?? 0),
      neto: kg(gNeto),
      cantidad: g.cantidad != null ? String(g.cantidad) : '0',
      prom: kg(gProm),
      observaciones: g.observaciones ?? '',
      operario: user?.fullName ?? '',
      impreso: new Date().toLocaleString('es-CO'),
      logoUrl: new URL(logoSantaCruz, window.location.href).href,
    };
  }

  // Imprime la guía seleccionada (o el formulario si se está editando/creando).
  function imprimir() {
    const data =
      !editingId && selectedGuia ? reciboFromGuia(selectedGuia) : reciboFromForm();
    void downloadReciboPdf(data);
  }

  const guiasAbiertas = abiertas.data ?? [];
  const tabs: TabItem[] = [
    { value: 'guias', label: `Guías abiertas (${guiasAbiertas.length})` },
    { value: 'observaciones', label: 'Observaciones' },
  ];
  const saving = createGuia.isPending || updateGuia.isPending;

  return (
    <div className="space-y-6">
      {/* Encabezado + barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PesoEnCamionIcon className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Peso En Camión
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Recibo de materia prima — pesaje en camión.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="lg"
            className="h-11 px-5"
            title="Guardar toda la información"
            onClick={guardar}
            disabled={saving}
          >
            {saving ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Save className="size-5" />
            )}
            {editingId ? 'Actualizar' : 'Guardar'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Nueva guía / limpiar"
            onClick={limpiar}
          >
            <Eraser className="size-5" />
          </Button>
          <span className="mx-1 h-8 w-px bg-border" />
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Editar guía seleccionada"
            onClick={editar}
            disabled={!selectedGuia}
          >
            <Pencil className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            title="Imprimir recibo (PDF)"
            onClick={imprimir}
          >
            <Printer className="size-5" />
          </Button>
          <Button variant="outline" size="icon" className="size-11" title="Bloquear">
            <Lock className="size-5" />
          </Button>
        </div>
      </div>

      {/* Aviso de guardado / edición / error */}
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
      {editingId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Editando la guía de referencia N.º {loadedReference}. Guardá para
          aplicar los cambios.
        </div>
      )}
      {!editingId && selectedGuia && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
          Guía N.º {selectedGuia.reference} seleccionada. Usá el lápiz para
          editarla, o el botón imprimir.
        </div>
      )}

      {/* Datos de la guía */}
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              className={fieldClass}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guia">Guía de movilización</Label>
            <KeyboardField>
              <Input
                id="guia"
                className={cn(fieldClass, savedText)}
                placeholder="Escribí el número de guía…"
                value={guia}
                onChange={(e) => setGuia(e.target.value)}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="procedencia">Procedencia</Label>
            <textarea
              id="procedencia"
              className={cn(areaClass, 'cursor-pointer pr-3', savedText)}
              readOnly
              placeholder="Tocá para seleccionar la procedencia…"
              value={procedencia}
              onClick={() => setProcModalOpen(true)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proveedor">Proveedor</Label>
            <textarea
              id="proveedor"
              className={cn(areaClass, 'cursor-pointer pr-3', savedText)}
              readOnly
              placeholder="Tocá para seleccionar el proveedor…"
              value={proveedor}
              onClick={() => setProvModalOpen(true)}
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="cliente">Cliente</Label>
          <textarea
            id="cliente"
            className={cn(areaClass, 'cursor-pointer pr-3', savedText)}
            readOnly
            placeholder="Tocá para seleccionar el cliente…"
            value={cliente}
            onClick={() => setCliModalOpen(true)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="placa">Placa</Label>
            <KeyboardField>
              <Input
                id="placa"
                className={cn(fieldClass, savedText)}
                placeholder="Placa del vehículo"
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conductor">Conductor</Label>
            <Input
              id="conductor"
              className={cn(fieldClass, 'cursor-pointer', savedText)}
              readOnly
              placeholder="Doble clic para seleccionar el conductor…"
              value={conductor}
              onDoubleClick={() => setCondModalOpen(true)}
            />
          </div>
        </div>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Referencia: orden de llegada del día (automático) */}
        <StatValue icon={Hash} label="Referencia" value={referencia} />
        <StatInput
          icon={Package}
          label="Cant."
          value={cantidad}
          onChange={(v) => setCantidad(v.replace(/[^\d]/g, ''))}
          onKeyboard={keyboard.open}
        />
        <StatInput
          icon={ArrowDownToLine}
          label="Entrada (kg)"
          tone="text-red-600"
          value={entrada}
          onChange={(v) => setEntrada(v.replace(/[^\d.]/g, ''))}
          onKeyboard={keyboard.open}
        />
        <StatInput
          icon={ArrowUpFromLine}
          label="Salida (kg)"
          tone="text-blue-600"
          value={salida}
          onChange={(v) => setSalida(v.replace(/[^\d.]/g, ''))}
          onKeyboard={keyboard.open}
        />
        {/* Calculados */}
        <StatValue
          icon={Scale}
          label="Neto (kg)"
          tone="text-emerald-600"
          value={fmt(neto)}
        />
        <StatValue icon={Sigma} label="Prom. (kg)" value={fmt(prom)} />
      </div>

      {/* Guías abiertas / Observaciones */}
      <Card className="overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {tab === 'guias' ? (
          <Table>
            <THead>
              <TR>
                <TH className="w-24">Ref.</TH>
                <TH>Placa</TH>
                <TH>Guía</TH>
                <TH>Procedencia</TH>
              </TR>
            </THead>
            <TBody>
              {guiasAbiertas.length === 0 ? (
                <TR className="hover:bg-transparent">
                  <TD colSpan={4} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                      <Inbox className="size-8" />
                      <p className="text-sm font-medium">
                        No hay guías abiertas
                      </p>
                      <p className="text-sm">
                        Guardá una guía y aparecerá acá para seleccionarla.
                      </p>
                    </div>
                  </TD>
                </TR>
              ) : (
                guiasAbiertas.map((g) => (
                  <TR
                    key={g.id}
                    onClick={() =>
                      setSelectedGuia((cur) => (cur?.id === g.id ? null : g))
                    }
                    className={cn(
                      'cursor-pointer',
                      g.id === selectedGuia?.id &&
                        'bg-sky-100 hover:bg-sky-100',
                    )}
                  >
                    <TD className="font-medium tabular-nums">{g.reference}</TD>
                    <TD>{g.placa ?? '—'}</TD>
                    <TD>{g.guia ?? '—'}</TD>
                    <TD>{g.procedencia ?? '—'}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        ) : (
          <div className="p-4">
            <KeyboardField align="top">
              <textarea
                className={cn(areaClass, 'min-h-[160px]', savedText)}
                placeholder="Observaciones de la guía…"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        )}
      </Card>

      <ProcedenciaModal
        open={procModalOpen}
        onClose={() => setProcModalOpen(false)}
        value={procedencia}
        onConfirm={(v) => {
          setProcedencia(v);
          setProcModalOpen(false);
        }}
      />

      <ProveedorModal
        open={provModalOpen}
        onClose={() => setProvModalOpen(false)}
        value={proveedor}
        onConfirm={(v) => {
          setProveedor(v);
          setProvModalOpen(false);
        }}
      />

      <ClienteModal
        open={cliModalOpen}
        onClose={() => setCliModalOpen(false)}
        value={cliente}
        onConfirm={(v) => {
          setCliente(v);
          setCliModalOpen(false);
        }}
      />

      <ConductorModal
        open={condModalOpen}
        onClose={() => setCondModalOpen(false)}
        value={conductor}
        onConfirm={(v) => {
          setConductor(v);
          setCondModalOpen(false);
        }}
      />
    </div>
  );
}

type IconType = React.ComponentType<{ className?: string }>;

function StatCard({
  icon: Icon,
  label,
  children,
}: {
  icon: IconType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </Card>
  );
}

function StatInput({
  icon,
  label,
  value,
  onChange,
  onKeyboard,
  tone,
}: {
  icon: IconType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onKeyboard: () => void;
  tone?: string;
}) {
  return (
    <StatCard icon={icon} label={label}>
      <input
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onDoubleClick={onKeyboard}
        className={cn(
          'mt-2 w-full bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40',
          tone,
        )}
      />
    </StatCard>
  );
}

function StatValue({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconType;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <StatCard icon={icon} label={label}>
      <p className={cn('mt-2 text-3xl font-semibold tabular-nums', tone)}>
        {value}
      </p>
    </StatCard>
  );
}


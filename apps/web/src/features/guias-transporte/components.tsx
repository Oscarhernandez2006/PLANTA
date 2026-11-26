import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { Building2, FileDown, LoaderCircle, Lock, MapPin, Plus, ScrollText, Search, Store, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '../auth/auth-context';
import { usePuntosEnvio } from '../clientes/api';
import { useConductores } from '../peso-en-camion/api';
import { useCerrarDespachoCanales } from '../registrar/despacho-canales-api';
import {
  descargarGuiaDespacho,
  formatGM,
  useGuiasTransporte,
  useNextGuiaNumber,
  useTiendasRemision,
  type GuiaInput,
  type GuiaTransporte,
  type TiendaRemision,
} from './api';

export function mensajeApi(err: unknown, porDefecto: string) {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
}

export const hoyISO = () => new Date().toLocaleDateString('en-CA');

export interface GuiaValores {
  fecha: string;
  tipoVehiculo: string;
  placa: string;
  conductor: string;
  cedula: string;
  observacion: string;
}

export const guiaVacia = (): GuiaValores => ({
  fecha: hoyISO(),
  tipoVehiculo: '',
  placa: '',
  conductor: '',
  cedula: '',
  observacion: '',
});

export const guiaValida = (v: GuiaValores) =>
  TIPOS_VEHICULO.includes(v.tipoVehiculo) && v.placa.trim().length >= 3 && v.conductor.trim().length >= 3;

export const guiaPayload = (v: GuiaValores): GuiaInput => ({
  fecha: v.fecha || undefined,
  tipoVehiculo: v.tipoVehiculo.trim(),
  placa: v.placa.trim(),
  conductor: v.conductor.trim(),
  cedula: v.cedula.trim(),
  observacion: v.observacion.trim(),
});

const TIPOS_VEHICULO = ['CAMIÓN', 'FURGÓN', 'TURBO', 'TRACTOMULA', 'CAMIONETA', 'SENCILLO', 'DOBLETROQUE'];

/** Campos de la guía de transporte (vehículo y conductor), compartidos por el módulo y el cierre. */
export function GuiaCampos({
  valores,
  onChange,
  numero,
}: {
  valores: GuiaValores;
  onChange: (v: GuiaValores) => void;
  numero?: string;
}) {
  const conductores = useConductores('');
  const opcionesConductor = useMemo(() => {
    const nombres = new Set((conductores.data ?? []).map((c) => c.concepto.trim().toUpperCase()));
    // Una guía guardada con un conductor que ya no está en la lista lo conserva.
    if (valores.conductor.trim()) nombres.add(valores.conductor.trim().toUpperCase());
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es')).map((n) => ({ value: n, label: n }));
  }, [conductores.data, valores.conductor]);
  const set = (k: keyof GuiaValores) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...valores, [k]: e.target.value });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="guia-numero">Guía No.</Label>
        <Input id="guia-numero" className="h-10 font-bold tabular-nums" value={numero ?? '—'} disabled />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guia-fecha">Fecha</Label>
        <Input id="guia-fecha" type="date" className="h-10" value={valores.fecha} onChange={set('fecha')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guia-tipo">Tipo de vehículo</Label>
        <Combobox
          id="guia-tipo"
          inputClassName="h-10"
          options={TIPOS_VEHICULO.map((t) => ({ value: t, label: t }))}
          value={valores.tipoVehiculo}
          onChange={(tipoVehiculo) => onChange({ ...valores, tipoVehiculo })}
          placeholder="Buscar tipo de vehículo…"
          emptyText="No hay un tipo de vehículo con ese nombre"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guia-placa">Placa</Label>
        <Input
          id="guia-placa"
          className="h-10 font-semibold uppercase tracking-wider"
          value={valores.placa}
          onChange={set('placa')}
          maxLength={12}
        />
      </div>
      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="guia-conductor">Conductor</Label>
        <Combobox
          id="guia-conductor"
          inputClassName="h-10"
          options={opcionesConductor}
          value={valores.conductor.trim().toUpperCase()}
          onChange={(conductor) => onChange({ ...valores, conductor })}
          placeholder={conductores.isLoading ? 'Cargando conductores…' : 'Buscar conductor…'}
          emptyText="No hay un conductor registrado con ese nombre"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guia-cedula">Cédula conductor</Label>
        <Input
          id="guia-cedula"
          className="h-10 tabular-nums"
          value={valores.cedula}
          onChange={set('cedula')}
          maxLength={20}
          placeholder="N/A"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
        <Label htmlFor="guia-observacion">Observaciones</Label>
        <textarea
          id="guia-observacion"
          className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={valores.observacion}
          onChange={set('observacion')}
          maxLength={500}
        />
      </div>
    </div>
  );
}

function Opcion({
  activo,
  onClick,
  icono: Icono,
  titulo,
  detalle,
}: {
  activo: boolean;
  onClick: () => void;
  icono: React.ComponentType<{ className?: string }>;
  titulo: string;
  detalle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors',
        activo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
      )}
    >
      <Icono className={cn('mt-0.5 size-5 shrink-0', activo ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0">
        <span className="block font-semibold uppercase">{titulo}</span>
        {detalle && <span className="block truncate text-xs text-muted-foreground">{detalle}</span>}
      </span>
    </button>
  );
}

/** Camión de un despacho con remisiones por tienda: una guía existente o una nueva. */
interface Camion {
  key: number;
  nueva: boolean;
  guiaId: string | null;
  valores: GuiaValores;
}

const camionValido = (c: Camion) => (c.nueva ? guiaValida(c.valores) : !!c.guiaId);

/** Guía sin ninguna orden de despacho: es la única que se puede escoger al cerrar. */
const guiaLibre = (g: GuiaTransporte) => g.despachos.length === 0;

/** Una guía usada no se repite, pero sus datos (vehículo y conductor) se copian a la nueva. */
function CopiarGuia({ guias, onCopiar }: { guias: GuiaTransporte[]; onCopiar: (v: GuiaValores) => void }) {
  const [id, setId] = useState('');
  if (!guias.length) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="guia-copiar">Copiar datos de una guía anterior (opcional)</Label>
      <Combobox
        id="guia-copiar"
        inputClassName="h-10"
        options={guias.map((g) => ({
          value: g.id,
          label: `${formatGM(g.numero)} · ${g.placa} · ${g.conductor} · ${g.tipoVehiculo}`,
        }))}
        value={id}
        onChange={(v) => {
          setId(v);
          const g = guias.find((x) => x.id === v);
          if (g) {
            onCopiar({
              ...guiaVacia(),
              tipoVehiculo: g.tipoVehiculo,
              placa: g.placa,
              conductor: g.conductor,
              cedula: g.cedula ?? '',
            });
          }
        }}
        placeholder="Buscar guía por número, placa o conductor…"
        emptyText="No hay una guía con ese dato"
      />
    </div>
  );
}

/**
 * Despacho posta al cliente con tiendas: una remisión por tienda. Cada camión es una guía de
 * movilidad (existente o nueva) y lleva una o varias tiendas.
 */
function CamionesTiendas({
  tiendas,
  recientes,
  anteriores,
  siguiente,
  camiones,
  setCamiones,
  asignacion,
  setAsignacion,
}: {
  tiendas: TiendaRemision[];
  /** Guías libres (sin despacho) que se pueden escoger. */
  recientes: GuiaTransporte[];
  /** Guías recientes de las que se pueden copiar los datos del camión. */
  anteriores: GuiaTransporte[];
  siguiente: number | undefined;
  camiones: Camion[];
  setCamiones: (c: Camion[]) => void;
  asignacion: Record<string, number>;
  setAsignacion: (a: Record<string, number>) => void;
}) {
  const [activo, setActivo] = useState(0);
  const sel = Math.min(activo, camiones.length - 1);
  const c = camiones[sel];
  const actualizar = (cambio: Partial<Camion>) =>
    setCamiones(camiones.map((x, k) => (k === sel ? { ...x, ...cambio } : x)));
  const tiendasDe = (k: number) => tiendas.filter((t) => asignacion[t.pickingId] === k);
  // Número de guía que tomará cada camión nuevo (en orden), solo de referencia.
  const numeroNueva = (k: number) =>
    siguiente != null ? siguiente + camiones.slice(0, k).filter((x) => x.nueva).length : undefined;
  const ocupadas = new Set(camiones.flatMap((x, k) => (k !== sel && !x.nueva && x.guiaId ? [x.guiaId] : [])));

  function agregar() {
    setCamiones([...camiones, { key: Date.now(), nueva: true, guiaId: null, valores: guiaVacia() }]);
    setActivo(camiones.length);
  }

  function quitar(k: number) {
    setCamiones(camiones.filter((_, i) => i !== k));
    // Las tiendas del camión quitado pasan al primero; las de los siguientes corren un lugar.
    setAsignacion(
      Object.fromEntries(
        Object.entries(asignacion).map(([id, g]) => [id, g === k ? 0 : g > k ? g - 1 : g]),
      ),
    );
    setActivo(0);
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-primary/5 px-3 py-2 text-sm">
        Este despacho lleva <b>{tiendas.length} tiendas</b>: sale <b>una remisión por tienda</b>. Indica en
        qué camión va cada una; cada camión es una guía de movilidad.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {camiones.map((x, k) => {
          const n = tiendasDe(k).length;
          const guia = x.nueva ? numeroNueva(k) : recientes.find((g) => g.id === x.guiaId)?.numero;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => setActivo(k)}
              className={cn(
                'flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-left text-sm transition-colors',
                k === sel ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                !camionValido(x) || !n ? 'border-dashed' : '',
              )}
            >
              <Truck className={cn('size-4', k === sel ? 'text-primary' : 'text-muted-foreground')} />
              <span>
                <span className="block font-semibold">
                  Camión {k + 1}
                  {guia != null && <span className="font-normal text-muted-foreground"> · {formatGM(guia)}</span>}
                </span>
                <span className={cn('block text-xs', n ? 'text-muted-foreground' : 'text-destructive')}>
                  {n} tienda{n === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          );
        })}
        <Button variant="outline" size="sm" onClick={agregar}>
          <Plus className="size-4" /> Agregar camión
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase">Guía de movilidad del camión {sel + 1}</p>
          {camiones.length > 1 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              onClick={() => quitar(sel)}
            >
              <Trash2 className="size-3.5" /> Quitar camión
            </button>
          )}
        </div>
        {recientes.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
            {[false, true].map((n) => (
              <button
                key={String(n)}
                type="button"
                onClick={() => actualizar({ nueva: n })}
                className={cn(
                  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md font-semibold transition-colors',
                  c.nueva === n ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n ? <Plus className="size-4" /> : <ScrollText className="size-4" />}
                {n ? 'Nueva guía' : 'Guía existente'}
              </button>
            ))}
          </div>
        )}
        {c.nueva || recientes.length === 0 ? (
          <div className="space-y-3">
            <CopiarGuia
              key={c.key}
              guias={anteriores}
              onCopiar={(v) => actualizar({ valores: { ...v, fecha: c.valores.fecha } })}
            />
            <GuiaCampos
              key={c.key}
              valores={c.valores}
              onChange={(valores) => actualizar({ valores })}
              numero={numeroNueva(sel) != null ? `${formatGM(numeroNueva(sel)!)} (al guardar)` : undefined}
            />
          </div>
        ) : (
          <div className="scrollbar-app grid max-h-60 gap-2 overflow-auto sm:grid-cols-2">
            {recientes
              .filter((g) => !ocupadas.has(g.id))
              .map((g) => (
                <Opcion
                  key={g.id}
                  activo={c.guiaId === g.id}
                  onClick={() => actualizar({ guiaId: g.id })}
                  icono={ScrollText}
                  titulo={`${formatGM(g.numero)} · ${g.placa}`}
                  detalle={`${g.fecha} · ${g.conductor}`}
                />
              ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold uppercase">
          <Store className="size-4 text-primary" /> Tiendas y su camión
        </p>
        <div className="scrollbar-app max-h-[40vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Remisión</th>
                <th className="px-3 py-2">Tienda</th>
                <th className="px-3 py-2 text-right">Empaques</th>
                <th className="px-3 py-2 text-right">Kg</th>
                <th className="px-3 py-2">Camión</th>
              </tr>
            </thead>
            <tbody>
              {tiendas.map((t, i) => (
                <tr key={t.pickingId} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold tabular-nums">T{String(i + 1).padStart(2, '0')}</td>
                  <td className="px-3 py-2">
                    <span className="block font-semibold uppercase">
                      {[t.tiendaCodigo, t.tiendaNombre].filter(Boolean).join(' - ') || t.nombre}
                    </span>
                    {t.ocNumero && <span className="block text-xs text-muted-foreground">OC {t.ocNumero}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.empaques}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.kg.toLocaleString('es-CO')}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {camiones.map((x, k) => (
                        <button
                          key={x.key}
                          type="button"
                          title={`Camión ${k + 1}`}
                          onClick={() => setAsignacion({ ...asignacion, [t.pickingId]: k })}
                          className={cn(
                            'h-7 min-w-9 rounded-md border px-2 text-xs font-semibold transition-colors',
                            asignacion[t.pickingId] === k
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/50',
                          )}
                        >
                          C{k + 1}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Cierre de una orden de despacho de canales (caliente, frío o posta):
 * 1) a dónde se envía (al cliente o a uno de sus puntos de envío),
 * 2) la guía de transporte (una existente o una nueva). Al cerrar descarga la guía en PDF.
 *    Posta al cliente con tiendas: una remisión por tienda, cada una en la guía de su camión.
 */
export function CierreDespachoDialog({
  ordenId,
  numero,
  cliente,
  resumen,
  onClose,
  onCerrada,
  onError,
  pin,
}: {
  ordenId: string;
  numero: string;
  cliente: { id: string; concepto: string; nit: string | null };
  resumen: React.ReactNode;
  onClose: () => void;
  onCerrada: (mensaje: string) => void;
  onError: (mensaje: string) => void;
  /** Clave del supervisor que autorizó cerrar con pre-órdenes incompletas. */
  pin?: string;
}) {
  const { user } = useAuth();
  const cerrar = useCerrarDespachoCanales();
  const puntos = usePuntosEnvio(cliente.id);
  const activos = (puntos.data ?? []).filter((p) => p.active);
  const desde = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toLocaleDateString('en-CA');
  }, []);
  const guias = useGuiasTransporte({ desde });
  const next = useNextGuiaNumber();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [puntoId, setPuntoId] = useState<string | null>(null);
  const [guiaId, setGuiaId] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [valores, setValores] = useState<GuiaValores>(guiaVacia);
  const [descargando, setDescargando] = useState(false);
  const [buscar, setBuscar] = useState('');
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return activos;
    return activos.filter((p) =>
      [p.razonSocial, p.nit, p.direccion, p.municipio, p.departamento, p.telefono].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [activos, buscar]);
  const anteriores = guias.data ?? [];
  const recientes = anteriores.filter(guiaLibre);
  const usarNueva = nueva || (!guias.isLoading && recientes.length === 0);
  const destino = puntoId ? activos.find((p) => p.id === puntoId) : null;
  const tiendasRemision = useTiendasRemision(ordenId, true);
  const porTienda = !puntoId && !!tiendasRemision.data?.porTienda;
  const tiendas = tiendasRemision.data?.tiendas ?? [];
  const sinTienda = tiendasRemision.data?.sinTienda ?? 0;
  const [camiones, setCamiones] = useState<Camion[]>(() => [{ key: 0, nueva: true, guiaId: null, valores: guiaVacia() }]);
  const [asignacion, setAsignacion] = useState<Record<string, number>>({});
  // Por defecto todas las tiendas van en el camión 1.
  const asignadas = useMemo(
    () => Object.fromEntries(tiendas.map((t) => [t.pickingId, asignacion[t.pickingId] ?? 0])),
    [tiendas, asignacion],
  );
  const camionesListos =
    !sinTienda &&
    camiones.every((c, k) => camionValido(recientes.length ? c : { ...c, nueva: true }) && tiendas.some((t) => asignadas[t.pickingId] === k));
  const listo = porTienda ? camionesListos : usarNueva ? guiaValida(valores) : !!guiaId;
  const ocupado = cerrar.isPending || descargando;

  async function confirmar() {
    if (porTienda) {
      let r;
      try {
        r = await cerrar.mutateAsync({
          dcId: ordenId,
          pin,
          guias: camiones.map((c) =>
            c.nueva || !recientes.length ? { nuevaGuia: guiaPayload(c.valores) } : { guiaTransporteId: c.guiaId! },
          ),
          remisiones: tiendas.map((t) => ({ pickingId: t.pickingId, guia: asignadas[t.pickingId] })),
        });
      } catch (err) {
        onError(mensajeApi(err, 'No se pudo cerrar la orden.'));
        return;
      }
      onCerrada(
        `Orden ${numero} cerrada: ${r.remisiones} remisiones (una por tienda) en ${camiones.length} guía(s) de movilidad. Consúltalas en Informes → Despachos.`,
      );
      return;
    }
    try {
      await cerrar.mutateAsync({
        dcId: ordenId,
        pin,
        puntoEnvioId: puntoId ?? undefined,
        ...(usarNueva ? { nuevaGuia: guiaPayload(valores) } : { guiaTransporteId: guiaId! }),
      });
    } catch (err) {
      onError(mensajeApi(err, 'No se pudo cerrar la orden.'));
      return;
    }
    setDescargando(true);
    try {
      await descargarGuiaDespacho(ordenId, user?.fullName ?? '');
      onCerrada(`Orden ${numero} cerrada. Se descargó la guía de transporte.`);
    } catch {
      onCerrada(`Orden ${numero} cerrada. No se pudo descargar la guía: descárgala en Informes → Despachos.`);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Dialog
      open
      onClose={ocupado ? () => undefined : onClose}
      title={`Cerrar orden ${numero}`}
      description={
        paso === 1
          ? 'Paso 1 de 2 · ¿A dónde se envía el despacho?'
          : porTienda
            ? 'Paso 2 de 2 · Remisiones por tienda y guías de movilidad'
            : 'Paso 2 de 2 · Guía de transporte'
      }
      className="max-w-5xl"
    >
      <div className="space-y-4">
        {paso === 1 ? (
          <>
            <div className="text-sm">{resumen}</div>
            <Opcion
              activo={!puntoId}
              onClick={() => setPuntoId(null)}
              icono={Building2}
              titulo={cliente.concepto}
              detalle={cliente.nit ? `NIT ${cliente.nit}` : undefined}
            />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold uppercase">
                  <MapPin className="size-4 text-primary" /> Punto de envío:
                </p>
                <div className="relative w-full sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Buscar por nombre, NIT, dirección o municipio…"
                    className="pl-9"
                  />
                </div>
              </div>
              {puntos.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Cargando puntos de envío…
                </p>
              ) : activos.length === 0 ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Este cliente no tiene puntos de envío. Se configuran en Clientes → Puntos de envío.
                </p>
              ) : (
                <div className="scrollbar-app max-h-[45vh] overflow-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2" />
                        <th className="px-3 py-2">Razón social</th>
                        <th className="px-3 py-2">NIT</th>
                        <th className="px-3 py-2">Dirección</th>
                        <th className="px-3 py-2">Municipio / Depto.</th>
                        <th className="px-3 py-2">Teléfono</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                            Ningún punto de envío coincide con la búsqueda.
                          </td>
                        </tr>
                      ) : (
                        filtrados.map((p) => {
                          const sel = puntoId === p.id;
                          return (
                            <tr
                              key={p.id}
                              onClick={() => setPuntoId(sel ? null : p.id)}
                              className={cn(
                                'cursor-pointer border-t border-border transition-colors',
                                sel ? 'bg-primary/10' : 'hover:bg-muted/50',
                              )}
                            >
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    'flex size-4 items-center justify-center rounded-full border-2',
                                    sel ? 'border-primary' : 'border-muted-foreground/40',
                                  )}
                                >
                                  {sel && <span className="size-2 rounded-full bg-primary" />}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-semibold uppercase">{p.razonSocial}</td>
                              <td className="px-3 py-2">{p.nit ?? '—'}</td>
                              <td className="px-3 py-2">{p.direccion ?? '—'}</td>
                              <td className="px-3 py-2">
                                {[p.municipio, p.departamento].filter(Boolean).join(' - ') || '—'}
                              </td>
                              <td className="px-3 py-2">{p.telefono ?? '—'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Si no eliges un punto de envío, el despacho sale a nombre de {cliente.concepto}.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={() => setPaso(2)}>Siguiente</Button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Destino: <b className="uppercase">{destino ? destino.razonSocial : cliente.concepto}</b>
              {destino && <span className="text-muted-foreground"> (cliente de {cliente.concepto})</span>}
            </p>
            {porTienda ? (
              <>
                {sinTienda > 0 && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                    {sinTienda} producto(s) de la orden no tienen tienda. Quítalos y pistoléalos de nuevo eligiendo la
                    tienda para poder cerrar.
                  </p>
                )}
                <CamionesTiendas
                  tiendas={tiendas}
                  recientes={recientes}
                  anteriores={anteriores}
                  siguiente={next.data?.next}
                  camiones={camiones}
                  setCamiones={setCamiones}
                  asignacion={asignadas}
                  setAsignacion={setAsignacion}
                />
              </>
            ) : (
              <>
            {recientes.length > 0 && (
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
                {[false, true].map((n) => (
                  <button
                    key={String(n)}
                    type="button"
                    onClick={() => setNueva(n)}
                    className={cn(
                      'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md font-semibold transition-colors',
                      nueva === n ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {n ? <Plus className="size-4" /> : <ScrollText className="size-4" />}
                    {n ? 'Nueva guía' : 'Guía existente'}
                  </button>
                ))}
              </div>
            )}
            {usarNueva ? (
              <div className="space-y-3">
                <CopiarGuia guias={anteriores} onCopiar={(v) => setValores({ ...v, fecha: valores.fecha })} />
                <GuiaCampos
                  valores={valores}
                  onChange={setValores}
                  numero={next.data ? `${formatGM(next.data.next)} (al guardar)` : undefined}
                />
              </div>
            ) : (
              <div className="scrollbar-app grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
                {recientes.map((g) => (
                  <Opcion
                    key={g.id}
                    activo={guiaId === g.id}
                    onClick={() => setGuiaId(g.id)}
                    icono={ScrollText}
                    titulo={`${formatGM(g.numero)} · ${g.placa}`}
                    detalle={`${g.fecha} · ${g.conductor}`}
                  />
                ))}
              </div>
            )}
              </>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setPaso(1)} disabled={ocupado}>
                Atrás
              </Button>
              <Button disabled={!listo || ocupado} onClick={() => void confirmar()}>
                {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Lock className="size-4" />}
                {cerrar.isPending
                  ? 'Cerrando…'
                  : descargando
                    ? 'Generando guía…'
                    : porTienda
                      ? `Cerrar y generar ${tiendas.length} remisiones`
                      : 'Cerrar y generar guía'}
                {!ocupado && <FileDown className="size-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

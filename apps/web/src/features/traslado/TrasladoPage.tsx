import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Gauge,
  Inbox,
  Layers,
  LayoutGrid,
  List,
  LoaderCircle,
  Lock,
  RefreshCw,
  ScanBarcode,
  Search,
  Trash2,
  Truck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { cn, formatFechaDia, soloDecimal } from '@/lib/utils';
import {
  TIPO_ORDEN_TRASLADO,
  formatOT,
  useCerrarTraslado,
  useItemsTraslado,
  useOrdenesTrasladoActivas,
  useQuitarTraslado,
  type ItemTraslado,
  type OrdenTraslado,
} from '../registrar/orden-traslado-api';
import { Mensaje } from '../rotulado/ui';
import { SupervisorPinDialog } from '@/components/ui/SupervisorPinDialog';
import { PreordenesDialog } from '../picking/PreordenesDialog';
import {
  autorizarCierre,
  useAgregarArrume,
  useArrumeAbierto,
  useCancelarArrume,
  useIniciarArrume,
  useInvalidarArrume,
  usePicking,
  useRepesarArrume,
  useTerminarArrume,
  type Arrume,
  type TipoPicking,
} from '../picking/picking-api';
import { CierreDespachoDialog } from '../guias-transporte/components';

const TARAS = [1.5, 1.75, 1.8, 2.02, 0];

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

/** La API rechaza la etiqueta porque no está en el picking de la orden (se puede autorizar con PIN). */
const esFueraDePicking = (err: unknown) => isAxiosError(err) && err.response?.data?.error === 'FUERA_DE_PICKING';

/** Registros agrupados por producto: empaques (etiquetas), unidades y kilos netos. */
function agrupar(items: ItemTraslado[]) {
  const porProducto = new Map<
    string,
    { codigo: string; producto: string; empaques: number; unds: number; kg: number }
  >();
  for (const i of items) {
    const g = porProducto.get(i.productoCodigo) ?? {
      codigo: i.productoCodigo,
      producto: i.productoNombre,
      empaques: 0,
      unds: 0,
      kg: 0,
    };
    g.empaques += 1;
    g.unds += i.unds;
    g.kg += i.netoKg;
    porProducto.set(i.productoCodigo, g);
  }
  return [...porProducto.values()].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'es', { numeric: true }),
  );
}

/** Un renglón por barcode pistoleado (pieza o canastilla), sin consolidar; el mismo producto queda junto. */
function TablaProductos({ items, movimiento }: { items: ItemTraslado[]; movimiento?: boolean }) {
  const filas = [...items].sort(
    (a, b) =>
      a.productoCodigo.localeCompare(b.productoCodigo, 'es', { numeric: true }) ||
      a.createdAt.localeCompare(b.createdAt),
  );
  if (!filas.length) return <Mensaje text="Aún no hay productos registrados en esta orden." />;
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <tr className="[&>th]:h-10 [&>th]:px-3">
          <th className="w-36">Código de barras</th>
          <th className="w-28">Tipo</th>
          <th className="w-24">Código</th>
          <th>Producto</th>
          <th className="w-20 text-center">Unds</th>
          <th className="w-32 text-right">Peso (kg)</th>
          {movimiento && <th className="w-32 text-center">Movimiento</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {filas.map((f) => (
          <tr key={f.id} className="h-11 hover:bg-muted/40 [&>td]:px-3">
            <td className="font-mono font-semibold text-primary">{f.codigo}</td>
            <td>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
                  f.tipo === 'canastilla' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground',
                )}
              >
                {f.tipo}
              </span>
            </td>
            <td className="text-muted-foreground">{f.productoCodigo}</td>
            <td className="font-semibold uppercase">{f.productoNombre}</td>
            <td className="text-center">{f.unds}</td>
            <td className="text-right font-bold">{kg(f.netoKg)}</td>
            {movimiento && (
              <td className="text-center">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">SALIDA</span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dato({ label, valor, className }: { label: string; valor: React.ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={cn('truncate text-lg font-bold tabular-nums', className)}>{valor}</p>
    </div>
  );
}

const VISTA_KEY = 'registroProductos.vistaOrdenes';

/** Lista de órdenes activas con el mismo diseño de los módulos de Beneficio (lista o tarjetas). */
export function ListaOrdenes<O extends OrdenRegistro>({
  config,
  cargando,
  ordenes,
  seleccionadaId,
  onElegir,
  refrescando,
  onRefrescar,
  estadoTexto = 'activa(s)',
}: {
  config: Pick<ConfigRegistroProductos<O>, 'icono' | 'numero' | 'tipoTexto' | 'sinOrdenes'>;
  cargando: boolean;
  ordenes: O[];
  seleccionadaId: string | null;
  onElegir: (o: O) => void;
  refrescando: boolean;
  onRefrescar: () => void;
  estadoTexto?: string;
}) {
  const Icono = config.icono;
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'lista' | 'tarjetas'>(() =>
    localStorage.getItem(VISTA_KEY) === 'tarjetas' ? 'tarjetas' : 'lista',
  );
  function cambiarVista(v: 'lista' | 'tarjetas') {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }
  const q = busqueda.trim().toUpperCase();
  const visibles = q
    ? ordenes.filter((o) => [config.numero(o), o.cliente.concepto, o.cliente.nit ?? ''].join(' ').toUpperCase().includes(q))
    : ordenes;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icono className="size-6" />
        </span>
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar orden, cliente o NIT"
            className="h-11 pl-10 text-base"
          />
        </div>
        <span className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
          <b className="tabular-nums text-foreground">{visibles.length}</b> orden(es) {estadoTexto}
        </span>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => cambiarVista('lista')}
            title="Ver en lista"
            aria-pressed={vista === 'lista'}
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'lista' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <List className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => cambiarVista('tarjetas')}
            title="Ver en tarjetas"
            aria-pressed={vista === 'tarjetas'}
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'tarjetas' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <LayoutGrid className="size-5" />
          </button>
        </div>
        <Button variant="outline" className="size-11 p-0" onClick={onRefrescar} disabled={refrescando} title="Actualizar">
          <RefreshCw className={cn('size-5', refrescando && 'animate-spin')} />
        </Button>
      </div>

      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : !visibles.length ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Inbox className="size-8" />
            {q ? 'Ninguna orden coincide con la búsqueda.' : config.sinOrdenes}
          </div>
        ) : vista === 'lista' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH className="h-10 w-32">Orden</TH>
                  <TH className="h-10">Cliente</TH>
                  <TH className="h-10">Tipo</TH>
                  <TH className="h-10 w-40">Fecha de proceso</TH>
                  <TH className="h-10 w-12" />
                </TR>
              </THead>
              <TBody>
                {visibles.map((o) => (
                  <TR
                    key={o.id}
                    onClick={() => onElegir(o)}
                    className={cn('h-16 cursor-pointer', o.id === seleccionadaId && 'bg-primary/5')}
                  >
                    <TD className="relative py-2">
                      <span className="absolute inset-y-0 left-0 w-1 bg-primary" />
                      <span className="text-lg font-bold tabular-nums text-primary">{config.numero(o)}</span>
                    </TD>
                    <TD className="max-w-96 py-2">
                      <div className="truncate text-base font-semibold uppercase">{o.cliente.concepto}</div>
                      <div className="text-xs text-muted-foreground">{o.cliente.nit ? `NIT ${o.cliente.nit}` : 'Sin NIT'}</div>
                    </TD>
                    <TD className="py-2 text-sm uppercase text-muted-foreground">{config.tipoTexto}</TD>
                    <TD className="py-2 text-base tabular-nums">{formatFechaDia(o.processDate)}</TD>
                    <TD className="py-2 text-muted-foreground">
                      <ChevronRight className="size-5" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {visibles.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => onElegir(o)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.995]',
                    o.id === seleccionadaId ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                  )}
                >
                  <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">{config.numero(o)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold uppercase">{o.cliente.concepto}</div>
                    <div className="text-sm text-muted-foreground">
                      {config.tipoTexto} · Proceso {formatFechaDia(o.processDate)}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-primary-foreground group-hover:bg-primary/90">
                    Abrir
                    <ChevronRight className="size-5" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function TrasladoPage() {
  return <RegistroProductosPage config={CONFIG_TRASLADO} />;
}

export interface OrdenRegistro {
  id: string;
  processDate: string;
  cliente: { id?: string; concepto: string; nit: string | null };
}

type Mutacion<V> = {
  mutate: (v: V, opts?: { onSuccess?: () => void; onError?: (err: unknown) => void }) => void;
  mutateAsync: (v: V) => Promise<unknown>;
  isPending: boolean;
};

/** Lo que cambia entre Traslado y Despacho Posta (misma pantalla, distinta orden). */
export interface ConfigRegistroProductos<O extends OrdenRegistro> {
  icono: React.ComponentType<{ className?: string }>;
  tabOrdenes: string;
  tipoTexto: string;
  numero: (o: O) => string;
  sinOrdenes: string;
  tituloCierre: string;
  /** Indicadores de Registro como en Despacho: Canastillas, Unds, Tara, Neto, Bruto, Diff. */
  indicadoresDespacho?: boolean;
  useOrdenes: () => { data?: O[]; isLoading: boolean; isFetching: boolean; refetch: () => unknown };
  useItems: (ordenId: string | null) => { data?: ItemTraslado[] };
  useQuitar: (ordenId: string) => Mutacion<string>;
  /** Cierre simple (confirmación). Si no está, se cierra con `cierreDespacho`. */
  useCerrar?: () => Mutacion<{ id: string; pin?: string }>;
  /** Orden de despacho a cliente: al cerrar se elige el punto de envío y la guía de transporte. */
  cierreDespacho?: boolean;
  /** La orden se alista con picking en la terminal y se despacha por arrumes pesados en la báscula. */
  pickingTipo: TipoPicking;
}

const CONFIG_TRASLADO: ConfigRegistroProductos<OrdenTraslado> = {
  icono: Truck,
  tabOrdenes: 'Órdenes de traslado',
  tipoTexto: TIPO_ORDEN_TRASLADO,
  numero: (o) => formatOT(o.otNumber),
  sinOrdenes: 'No hay órdenes de traslado activas. Créalas en Administrativo → Orden de Traslado.',
  tituloCierre: 'Cerrar orden de traslado',
  useOrdenes: useOrdenesTrasladoActivas,
  useItems: useItemsTraslado,
  useQuitar: useQuitarTraslado,
  useCerrar: useCerrarTraslado,
  pickingTipo: 'traslado',
};

const SIN_CIERRE: Mutacion<{ id: string; pin?: string }> = {
  mutate: () => undefined,
  mutateAsync: async () => undefined,
  isPending: false,
};
const useSinCierre = () => SIN_CIERRE;

/** Registro a quitar de la orden (del listado o de la lista del arrume). */
type PorQuitar = { id: string; codigo: string; productoCodigo: string; productoNombre: string; unds: number; kg: number };

const excede = (a: Arrume) => Math.abs(a.diferenciaKg) > a.toleranciaKg;
const tolerancia = (a: Arrume) => a.toleranciaKg.toFixed(1);

export function RegistroProductosPage<O extends OrdenRegistro>({
  config,
}: {
  config: ConfigRegistroProductos<O>;
}) {
  const tipo = config.pickingTipo;
  const [vista, setVista] = useState<'ordenes' | 'orden'>('ordenes');
  const [orden, setOrden] = useState<O | null>(null);
  const ordenId = orden?.id ?? '';
  const ordenes = config.useOrdenes();
  const items = config.useItems(orden?.id ?? null);
  const quitar = config.useQuitar(ordenId);
  const cerrar = (config.useCerrar ?? useSinCierre)();

  const arrumeQ = useArrumeAbierto(tipo, orden?.id ?? null);
  const arrume = arrumeQ.data ?? null;
  const iniciar = useIniciarArrume(tipo, ordenId);
  const repesar = useRepesarArrume(tipo, ordenId);
  const agregar = useAgregarArrume(tipo, ordenId);
  const terminar = useTerminarArrume(tipo, ordenId);
  const cancelarArrume = useCancelarArrume(tipo, ordenId);
  const invalidarArrume = useInvalidarArrume(tipo, ordenId);

  const [codigo, setCodigo] = useState('');
  const { peso, setPeso, leyendo, error: errorBascula, leerBascula } = useBascula('0.00');
  const [tara, setTara] = useState(TARAS[0]);
  const [estiba, setEstiba] = useState('0');
  const [tecladoPeso, setTecladoPeso] = useState(false);
  const [repesando, setRepesando] = useState(false);
  const [alerta, setAlerta] = useState<{ id: number; texto: string; ok?: boolean } | null>(null);
  const [alertaDiferencia, setAlertaDiferencia] = useState<string | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState<PorQuitar | null>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  // Cierre con pre-órdenes sin alistar al 100 %: pide la clave del supervisor antes de cerrar.
  const [pedirPinCierre, setPedirPinCierre] = useState(false);
  const [pinCierre, setPinCierre] = useState<string | undefined>(undefined);
  const [ordenCompra, setOrdenCompra] = useState(false);
  // Etiqueta fuera del picking esperando la clave del supervisor.
  const [fueraPicking, setFueraPicking] = useState<{ codigo: string; mensaje: string } | null>(null);
  const picking = usePicking(tipo, orden?.id ?? null);
  // Posta con varias pre-órdenes (tiendas): la canastilla autorizada va a la remisión de una tienda.
  const tiendasFuera = tipo === 'posta' ? (picking.data?.preordenes ?? []) : [];
  const elegirTienda = tiendasFuera.length >= 2;
  const [tiendaFuera, setTiendaFuera] = useState('');
  const preordenesIncompletas = (picking.data?.preordenes ?? []).filter(
    (p) => p.porcentaje != null && p.porcentaje < 100,
  );
  const codigoRef = useRef<HTMLInputElement>(null);

  const lista = items.data ?? [];
  const pesoKg = Number(peso) || 0;
  const estibaKg = Number(estiba) || 0;
  const totales = useMemo(
    () => ({
      empaques: lista.length,
      unds: lista.reduce((s, i) => s + i.unds, 0),
      kg: lista.reduce((s, i) => s + i.netoKg, 0),
      tara: lista.reduce((s, i) => s + i.taraKg, 0),
      bruto: lista.reduce((s, i) => s + i.pesoKg, 0),
      // Diferencia entre el peso de los arrumes y lo que decían las etiquetas.
      diff: lista.reduce((s, i) => s + (i.netoKg - i.netoEtiquetaKg), 0),
    }),
    [lista],
  );

  useEffect(() => {
    if (errorBascula) setAlerta({ id: Date.now(), texto: errorBascula });
  }, [errorBascula]);

  useEffect(() => {
    if (!alerta) return;
    const t = setTimeout(() => setAlerta(null), 3500);
    return () => clearTimeout(t);
  }, [alerta]);

  function avisar(texto: string, ok = false) {
    setAlerta({ id: Date.now(), texto, ok });
  }

  function enfocarCodigo() {
    setTimeout(() => codigoRef.current?.focus(), 0);
  }

  function elegirOrden(o: O) {
    setOrden(o);
    setCodigo('');
    setRepesando(false);
    setPeso('0.00');
    setEstiba('0');
    setVista('orden');
  }

  /** Paso 1: el arrume completo está en la báscula; se guarda su peso y sus taras. */
  function guardarPeso() {
    if (pesoKg <= 0) return avisar('Sube el arrume a la báscula y captura el peso.');
    const dto = { pesoBrutoKg: pesoKg, taraCanastillaKg: tara, taraEstibaKg: estibaKg };
    const opts = {
      onSuccess: (a: Arrume) => {
        avisar(
          repesando ? `Arrume N.º ${a.numero} pesado de nuevo: ${kg(a.pesoBrutoKg)} kg.` : `Arrume N.º ${a.numero} pesado: ahora pistolea sus canastillas.`,
          true,
        );
        setRepesando(false);
        setPeso('0.00');
        enfocarCodigo();
      },
      onError: (err: unknown) => avisar(mensajeApi(err, 'No se pudo guardar el peso del arrume.')),
    };
    if (arrume) repesar.mutate({ id: arrume.id, ...dto }, opts);
    else iniciar.mutate(dto, opts);
  }

  function empezarRepesaje() {
    if (!arrume) return;
    setPeso(arrume.pesoBrutoKg.toFixed(2));
    setTara(arrume.taraCanastillaKg);
    setEstiba(String(arrume.taraEstibaKg));
    setRepesando(true);
  }

  /** Paso 2: cada canastilla pistoleada entra a la orden con el neto de su etiqueta. */
  async function pistolear(valor: string, pin?: string, pickingId?: string) {
    if (!arrume) {
      avisar('Primero sube el arrume a la báscula y captura el peso.');
      return null;
    }
    try {
      const r = await agregar.mutateAsync({ id: arrume.id, codigo: valor, pin, pickingId });
      setCodigo('');
      avisar(`${r.item.productoNombre} · ${kg(r.item.netoEtiquetaKg)} kg en el arrume.`, true);
      if (r.advertenciaInventario) setTimeout(() => avisar(r.advertenciaInventario!), 1500);
      enfocarCodigo();
      return null;
    } catch (err) {
      if (!pin && esFueraDePicking(err)) {
        setTiendaFuera('');
        setFueraPicking({ codigo: valor, mensaje: mensajeApi(err, `${valor} no fue prealistada en el picking.`) });
        return null;
      }
      const texto = mensajeApi(err, 'No se pudo registrar la canastilla.');
      if (!pin) {
        setCodigo('');
        avisar(texto);
        enfocarCodigo();
      }
      return texto;
    }
  }

  function leerCodigo() {
    const valor = codigo.trim().toUpperCase();
    if (valor && !agregar.isPending) void pistolear(valor);
  }

  /** El supervisor autoriza meter una canastilla que no está en el picking. */
  async function autorizarFueraPicking(pin: string) {
    if (!fueraPicking) return null;
    if (elegirTienda && !tiendaFuera) return 'Elige la tienda a la que va la canastilla.';
    const error = await pistolear(fueraPicking.codigo, pin, tiendaFuera || undefined);
    if (!error) setFueraPicking(null);
    return error;
  }

  /** Paso 3: cuadra el arrume; con más de 1 kg de diferencia no se termina. */
  function terminarArrume() {
    if (!arrume) return;
    if (!arrume.canastillas) return avisar('Pistolea las canastillas del arrume antes de terminarlo.');
    if (excede(arrume)) {
      return setAlertaDiferencia(
        `Hay una diferencia superior a ${tolerancia(arrume)} kilos (${kg(arrume.diferenciaKg)} kg) entre el peso del arrume y el de las etiquetas.`,
      );
    }
    terminar.mutate(arrume.id, {
      onSuccess: (a) => {
        avisar(
          `Arrume N.º ${a.numero} terminado: ${a.canastillas} canastilla(s) · neto ${kg(a.netoKg)} kg (diferencia ${kg(a.diferenciaKg)} kg).`,
          true,
        );
        setPeso('0.00');
        setEstiba('0');
      },
      onError: (err) =>
        isAxiosError(err) && err.response?.data?.error === 'DIFERENCIA_ARRUME'
          ? setAlertaDiferencia(mensajeApi(err, 'Hay una diferencia superior a 1.0 kilos.'))
          : avisar(mensajeApi(err, 'No se pudo terminar el arrume.')),
    });
  }

  function pedirCierre() {
    if (arrume) {
      return setAlertaDiferencia(
        arrume.canastillas && excede(arrume)
          ? `No se puede cerrar la orden. Hay una diferencia superior a ${tolerancia(arrume)} kilos (${kg(arrume.diferenciaKg)} kg) en el arrume N.º ${arrume.numero}. Corrige la diferencia y termina el arrume.`
          : `No se puede cerrar la orden: el arrume N.º ${arrume.numero} no está terminado. Termínalo o cancélalo.`,
      );
    }
    setPinCierre(undefined);
    if (preordenesIncompletas.length) return setPedirPinCierre(true);
    setConfirmarCierre(true);
  }

  async function autorizarCierreConPin(pin: string) {
    if (!orden) return null;
    try {
      await autorizarCierre(tipo, orden.id, pin);
    } catch (err) {
      return mensajeApi(err, 'No se pudo validar la clave del supervisor.');
    }
    setPinCierre(pin);
    setPedirPinCierre(false);
    setConfirmarCierre(true);
    return null;
  }

  const indicadores = config.indicadoresDespacho
    ? [
        { label: 'Canastillas', valor: String(totales.empaques) },
        { label: 'Unds', valor: String(totales.unds) },
        { label: 'Tara (kg)', valor: kg(totales.tara) },
        { label: 'Neto (kg)', valor: kg(totales.kg), color: 'text-emerald-700' },
        { label: 'Bruto (kg)', valor: kg(totales.bruto), color: 'text-red-600' },
        { label: 'Diferencia (kg)', valor: kg(totales.diff), color: 'text-blue-700' },
      ]
    : [
        { label: 'Empaques', valor: String(totales.empaques) },
        { label: 'Unds', valor: String(totales.unds) },
        { label: 'Total tara (kg)', valor: kg(totales.tara) },
        { label: 'Neto (kg)', valor: kg(totales.kg), color: 'text-emerald-700' },
        { label: 'Bruto (kg)', valor: kg(totales.bruto), color: 'text-red-600' },
        { label: 'Diferencia (kg)', valor: kg(totales.diff), color: 'text-blue-700' },
      ];

  const guardandoPeso = iniciar.isPending || repesar.isPending;

  /** Peso del arrume en la báscula y sus taras (al iniciarlo o al volver a pesarlo). */
  const bloquePeso = (
    <>
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peso bruto del arrume</span>
        <div className="relative mt-1 flex items-baseline justify-center gap-2 rounded-xl border-2 border-primary/40 bg-muted/30 px-4 py-3 focus-within:border-primary">
          <input
            value={peso}
            onChange={(e) => setPeso(soloDecimal(e.target.value))}
            onClick={() => setTecladoPeso(true)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardarPeso();
            }}
            inputMode="none"
            aria-label="Peso bruto del arrume en kg"
            className="w-full min-w-0 bg-transparent text-right text-5xl font-bold tabular-nums text-foreground outline-none"
          />
          <span className="text-2xl font-semibold text-muted-foreground">kg</span>
          {tecladoPeso && <NumericKeypad value={peso} onChange={setPeso} onClose={() => setTecladoPeso(false)} />}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tara por canastilla (kg)</span>
          <div className="mt-1 grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
            {TARAS.map((t) => (
              <button
                key={t}
                onClick={() => setTara(t)}
                aria-pressed={tara === t}
                className={cn(
                  'h-10 rounded-md text-sm font-bold tabular-nums transition-colors',
                  tara === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {t === 0 ? '0.0' : t.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estiba (kg)</span>
          <Input
            value={estiba}
            onChange={(e) => setEstiba(soloDecimal(e.target.value))}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 h-12 text-right text-lg font-bold tabular-nums"
            aria-label="Tara de la estiba en kg"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-14 text-base" onClick={leerBascula} disabled={leyendo}>
          {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
          Leer báscula
        </Button>
        <Button className="h-14 text-base" onClick={guardarPeso} disabled={pesoKg <= 0 || guardandoPeso}>
          {guardandoPeso ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
          {arrume ? 'Guardar peso' : 'Capturar peso'}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {alerta && (
        <div key={alerta.id} className="pointer-events-none fixed left-1/2 top-24 z-50 flex w-[30rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 flex-col">
          <div
            role="alert"
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-lg animate-in fade-in-0 slide-in-from-top-2',
              alerta.ok ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700',
            )}
          >
            {alerta.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <TriangleAlert className="size-4 shrink-0" />}
            <span className="flex-1">{alerta.texto}</span>
            <button type="button" onClick={() => setAlerta(null)} aria-label="Cerrar" className="shrink-0 opacity-60 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {vista === 'ordenes' || !orden ? (
        <ListaOrdenes
          config={config}
          cargando={ordenes.isLoading}
          ordenes={ordenes.data ?? []}
          seleccionadaId={orden?.id ?? null}
          onElegir={elegirOrden}
          refrescando={ordenes.isFetching}
          onRefrescar={() => void ordenes.refetch()}
        />
      ) : (
        <>
          {/* Encabezado de la orden abierta */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setVista('ordenes')}>
              <ArrowLeft className="size-5" />
              Órdenes
            </Button>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">{config.numero(orden)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold uppercase">{orden.cliente.concepto}</div>
              <div className="text-sm text-muted-foreground">
                {config.tipoTexto} · <b className="tabular-nums text-foreground">{totales.empaques}</b> empaque(s) ·{' '}
                <b className="tabular-nums text-foreground">{kg(totales.kg)}</b> kg
              </div>
            </div>
            <Button
              variant="outline"
              className="h-12 px-5 text-base"
              onClick={() => setOrdenCompra(true)}
              title="Órdenes de compra del cliente (una pre-orden por tienda): la terminal muestra el avance del picking"
            >
              <ClipboardList className="size-5" />
              Pre-órdenes
              {!!picking.data?.preordenes.length && (
                <span className="rounded-md bg-muted px-1.5 text-sm tabular-nums">
                  {picking.data.preordenes.length}
                  {picking.data.porcentaje != null ? ` · ${picking.data.porcentaje.toLocaleString('es-CO')}%` : ''}
                </span>
              )}
            </Button>
            <Button
              variant={lista.length && !arrume ? 'default' : 'outline'}
              className="h-12 px-5 text-base"
              onClick={pedirCierre}
              disabled={!lista.length || cerrar.isPending}
              title={lista.length ? 'Cerrar la orden' : 'La orden no tiene productos'}
            >
              {cerrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Lock className="size-5" />}
              Cerrar orden
            </Button>
          </div>

          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_440px]">
            {/* Productos registrados */}
            <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
              <h3 className="shrink-0 px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Productos <span className="tabular-nums text-foreground">({lista.length} registro(s) · {agrupar(lista).length} referencia(s))</span>
              </h3>
              <div className="scrollbar-app m-4 mt-2 min-h-0 flex-1 overflow-auto rounded-lg border border-border">
                <TablaProductos items={lista} />
              </div>
              <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-border p-3 xl:grid-cols-6">
                {indicadores.map((c) => (
                  <div key={c.label} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
                    <p className={cn('text-right text-xl font-bold tabular-nums', c.color)}>{c.valor}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrume: peso en la báscula y canastillas pistoleadas */}
            <div className="scrollbar-app flex min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-5 shadow-sm">
              {arrumeQ.isLoading ? (
                <Mensaje text="Cargando…" />
              ) : !arrume ? (
                <>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-bold">
                      <Layers className="size-5 text-primary" />
                      Nuevo arrume
                    </h3>
                    <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
                      <li>Sube el arrume completo a la báscula y captura el peso.</li>
                      <li>Pistolea todas sus canastillas.</li>
                      <li>Termina el arrume: la diferencia no puede superar 1,0 kg.</li>
                    </ol>
                  </div>
                  {bloquePeso}
                  <Button
                    variant="outline"
                    className="mt-auto h-11 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() =>
                      lista[0] &&
                      setConfirmarQuitar({ ...lista[0], kg: lista[0].netoKg })
                    }
                    disabled={!lista.length || quitar.isPending}
                  >
                    <Trash2 className="size-4" />
                    Quitar último registro
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h3 className="flex flex-1 items-center gap-2 text-base font-bold">
                      <Layers className="size-5 text-primary" />
                      Arrume N.º {arrume.numero}
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">ABIERTO</span>
                    </h3>
                    {!repesando && (
                      <Button variant="outline" size="sm" onClick={empezarRepesaje}>
                        <RefreshCw className="size-4" />
                        Volver a pesar
                      </Button>
                    )}
                  </div>

                  {repesando ? (
                    <>
                      {bloquePeso}
                      <Button variant="ghost" onClick={() => setRepesando(false)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <Dato label="Bruto" valor={kg(arrume.pesoBrutoKg)} />
                        <Dato
                          label={`Tara (${arrume.canastillas}×${arrume.taraCanastillaKg}${arrume.taraEstibaKg ? ` + ${arrume.taraEstibaKg}` : ''})`}
                          valor={kg(arrume.taraTotalKg)}
                        />
                        <Dato label="Neto báscula" valor={kg(arrume.netoKg)} className="text-emerald-700" />
                        <Dato label="Canastillas" valor={arrume.canastillas} />
                        <Dato label="Neto etiquetas" valor={kg(arrume.netoEtiquetasKg)} />
                        <Dato
                          label="Diferencia"
                          valor={kg(arrume.diferenciaKg)}
                          className={excede(arrume) ? 'text-red-600' : 'text-emerald-700'}
                        />
                      </div>
                      {arrume.canastillas > 0 && (
                        <p
                          role="status"
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
                            excede(arrume) ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {excede(arrume) ? <TriangleAlert className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
                          {excede(arrume)
                            ? `Diferencia superior a ${tolerancia(arrume)} kg: pistolea las que faltan o revisa el arrume.`
                            : `Diferencia dentro de ${tolerancia(arrume)} kg: puedes terminar el arrume.`}
                        </p>
                      )}

                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Código de barras</span>
                        <div className="mt-1 flex h-14 items-center gap-2 rounded-xl border-2 border-input bg-background px-3 focus-within:border-primary">
                          <ScanBarcode className="size-6 shrink-0 text-muted-foreground" />
                          <input
                            ref={codigoRef}
                            value={codigo}
                            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^0-9ACRP-]/g, ''))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') leerCodigo();
                            }}
                            autoFocus
                            placeholder="Pistolea las canastillas del arrume"
                            className="h-full w-full min-w-0 bg-transparent text-xl font-bold tabular-nums outline-none placeholder:text-base placeholder:font-normal"
                          />
                          {agregar.isPending && <LoaderCircle className="size-5 shrink-0 animate-spin text-muted-foreground" />}
                        </div>
                      </label>

                      <div className="scrollbar-app min-h-24 flex-1 overflow-auto rounded-lg border border-border">
                        {arrume.items.length ? (
                          <ul className="divide-y divide-border text-sm">
                            {arrume.items.map((i) => (
                              <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold uppercase">{i.productoNombre}</p>
                                  <p className="text-xs tabular-nums text-muted-foreground">
                                    {i.codigo} · {i.unds} und
                                  </p>
                                </div>
                                <span className="font-bold tabular-nums">{kg(i.netoEtiquetaKg)}</span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmarQuitar({ ...i, kg: i.netoEtiquetaKg })}
                                  aria-label={`Quitar ${i.codigo}`}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                >
                                  <X className="size-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                            Pistolea las canastillas que están en la báscula.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                        <Button
                          variant="outline"
                          className="h-14 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setConfirmarCancelar(true)}
                          disabled={cancelarArrume.isPending}
                        >
                          <Trash2 className="size-4" />
                          Cancelar
                        </Button>
                        <Button className="h-14 text-base" onClick={terminarArrume} disabled={terminar.isPending || !arrume.canastillas}>
                          {terminar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
                          Terminar arrume
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {ordenCompra && orden && (
        <PreordenesDialog
          tipo={tipo}
          ordenId={orden.id}
          numero={config.numero(orden)}
          onClose={() => {
            setOrdenCompra(false);
            enfocarCodigo();
          }}
          onMensaje={(texto) => avisar(texto, true)}
        />
      )}

      {fueraPicking && (
        <SupervisorPinDialog
          open
          title="Canastilla no prealistada"
          description={
            <div className="space-y-2">
              <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 font-medium text-red-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {fueraPicking.mensaje}
              </p>
              <p>
                No se registra en la orden. Si la encontraron después del alistamiento y debe ir a este
                cliente, un supervisor puede autorizarla con su clave.
              </p>
              {elegirTienda && (
                <div className="space-y-1.5 pt-1 text-left">
                  <label htmlFor="tienda-fuera" className="text-sm font-semibold text-foreground">
                    ¿A qué tienda va?
                  </label>
                  <Combobox
                    id="tienda-fuera"
                    inputClassName="h-10"
                    options={tiendasFuera.map((p) => ({
                      value: p.id,
                      label: [p.tiendaCodigo, p.tiendaNombre].filter(Boolean).join(' - ') || p.nombre,
                    }))}
                    value={tiendaFuera}
                    onChange={setTiendaFuera}
                    placeholder="Buscar tienda…"
                    emptyText="No hay una tienda con ese nombre en las pre-órdenes"
                  />
                </div>
              )}
            </div>
          }
          accion="Autorizar"
          onClose={() => {
            setFueraPicking(null);
            setCodigo('');
            enfocarCodigo();
          }}
          onConfirm={autorizarFueraPicking}
        />
      )}

      {alertaDiferencia && (
        <Dialog open onClose={() => setAlertaDiferencia(null)} title="Diferencia en el arrume" className="max-w-lg">
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-3 text-base font-semibold text-red-700">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              {alertaDiferencia}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Pistolea las canastillas del arrume que falten.</li>
              <li>Quita las que no están en la báscula.</li>
              <li>Si se movió el arrume, vuelve a pesarlo o revisa las taras.</li>
            </ul>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setAlertaDiferencia(null);
                  enfocarCodigo();
                }}
              >
                Entendido
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {confirmarCancelar && arrume && (
        <Dialog open onClose={() => setConfirmarCancelar(false)} title={`¿Cancelar el arrume N.º ${arrume.numero}?`} className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              Se borra el peso del arrume
              {arrume.canastillas ? (
                <>
                  {' '}y salen de la orden sus <b>{arrume.canastillas}</b> canastilla(s) pistoleada(s)
                </>
              ) : null}
              .
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarCancelar(false)}>
                No
              </Button>
              <Button
                variant="destructive"
                disabled={cancelarArrume.isPending}
                onClick={() =>
                  cancelarArrume.mutate(arrume.id, {
                    onSuccess: () => {
                      setConfirmarCancelar(false);
                      setRepesando(false);
                      avisar('Arrume cancelado.', true);
                    },
                    onError: (err) => {
                      setConfirmarCancelar(false);
                      avisar(mensajeApi(err, 'No se pudo cancelar el arrume.'));
                    },
                  })
                }
              >
                <Trash2 className="size-4" />
                Sí, cancelar
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {confirmarQuitar && (
        <Dialog open onClose={() => setConfirmarQuitar(null)} title="¿Quitar el registro?" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              {confirmarQuitar.productoCodigo} · <b>{confirmarQuitar.productoNombre}</b> ·{' '}
              {confirmarQuitar.unds} und · {kg(confirmarQuitar.kg)} kg ({confirmarQuitar.codigo}). Sale de la orden y
              vuelve a quedar disponible en el inventario. Si era de un arrume ya terminado, el arrume se
              abre de nuevo para volver a pesarlo.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarQuitar(null)}>
                No
              </Button>
              <Button
                variant="destructive"
                disabled={quitar.isPending}
                onClick={() =>
                  quitar.mutate(confirmarQuitar.id, {
                    onSuccess: () => {
                      setConfirmarQuitar(null);
                      invalidarArrume();
                      avisar('Registro quitado.', true);
                    },
                    onError: (err) => {
                      setConfirmarQuitar(null);
                      avisar(mensajeApi(err, 'No se pudo quitar el registro.'));
                    },
                  })
                }
              >
                <Trash2 className="size-4" />
                Sí, quitar
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {pedirPinCierre && orden && (
        <SupervisorPinDialog
          open
          title="Pre-órdenes sin completar"
          description={
            <div className="space-y-2">
              <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 font-medium text-red-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                La orden {config.numero(orden)} no se puede cerrar: hay {preordenesIncompletas.length} pre-orden(es)
                sin alistar al 100 %.
              </p>
              <ul className="scrollbar-app max-h-48 space-y-1 overflow-auto rounded-lg border border-border px-3 py-2">
                {preordenesIncompletas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold uppercase text-foreground">{p.nombre}</span>
                    <span className="shrink-0 font-bold tabular-nums text-red-600">
                      {(p.porcentaje ?? 0).toLocaleString('es-CO')} %
                    </span>
                  </li>
                ))}
              </ul>
              <p>Para cerrarla así, un supervisor debe autorizarlo con su clave.</p>
            </div>
          }
          accion="Autorizar cierre"
          onClose={() => setPedirPinCierre(false)}
          onConfirm={autorizarCierreConPin}
        />
      )}

      {confirmarCierre && orden && config.cierreDespacho && orden.cliente.id && (
        <CierreDespachoDialog
          ordenId={orden.id}
          pin={pinCierre}
          numero={config.numero(orden)}
          cliente={{ id: orden.cliente.id, concepto: orden.cliente.concepto, nit: orden.cliente.nit }}
          resumen={
            <p>
              Lleva {totales.empaques} canastilla(s)/empaque(s), {totales.unds} pieza(s) y {kg(totales.kg)} kg.
              Al cerrarla queda finalizada y ya no se le pueden agregar ni quitar productos.
            </p>
          }
          onClose={() => setConfirmarCierre(false)}
          onCerrada={(texto) => {
            setConfirmarCierre(false);
            avisar(texto, true);
            setOrden(null);
            setCodigo('');
            setVista('ordenes');
          }}
          onError={(texto) => {
            setConfirmarCierre(false);
            avisar(texto);
          }}
        />
      )}

      {confirmarCierre && orden && !config.cierreDespacho && (
        <Dialog open onClose={() => setConfirmarCierre(false)} title={config.tituloCierre} className="max-w-lg">
          <div className="space-y-4">
            <p className="text-lg font-semibold">
              ¿Está seguro de cerrar la orden con consecutivo{' '}
              <span className="text-red-600">{config.numero(orden)}</span>?
            </p>
            <p className="text-base">
              Lleva {totales.empaques} canastilla(s)/empaque(s), {totales.unds} pieza(s) y {kg(totales.kg)} kg.
              Al cerrarla queda finalizada, sale de la lista de órdenes y ya no se le pueden
              agregar ni quitar productos.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarCierre(false)}>
                Cancelar
              </Button>
              <Button
                disabled={cerrar.isPending}
                onClick={() =>
                  cerrar.mutate({ id: orden.id, pin: pinCierre }, {
                    onSuccess: () => {
                      setConfirmarCierre(false);
                      avisar(`Orden ${config.numero(orden)} cerrada.`, true);
                      setOrden(null);
                      setCodigo('');
                      setVista('ordenes');
                    },
                    onError: (err) => {
                      setConfirmarCierre(false);
                      if (isAxiosError(err) && err.response?.data?.error === 'PREORDENES_INCOMPLETAS') {
                        void picking.refetch();
                        return setPedirPinCierre(true);
                      }
                      avisar(mensajeApi(err, 'No se pudo cerrar la orden.'));
                    },
                  })
                }
              >
                <Lock className="size-4" />
                Cerrar orden
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

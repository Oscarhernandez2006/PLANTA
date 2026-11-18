import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Inbox,
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
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { cn, formatFechaDia, soloDecimal } from '@/lib/utils';
import {
  TIPO_ORDEN_TRASLADO,
  buscarEtiquetaTraslado,
  formatOT,
  useCerrarTraslado,
  useItemsTraslado,
  useOrdenesTrasladoActivas,
  useQuitarTraslado,
  useRegistrarTraslado,
  type EtiquetaPorTrasladar,
  type ItemTraslado,
  type OrdenTraslado,
} from '../registrar/orden-traslado-api';
import { Mensaje } from '../rotulado/ui';

const TARAS = [1.5, 1.75, 1.8, 2.02, 0];

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

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

function TablaProductos({ items, movimiento }: { items: ItemTraslado[]; movimiento?: boolean }) {
  const filas = agrupar(items);
  if (!filas.length) return <Mensaje text="Aún no hay productos registrados en esta orden." />;
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <tr className="[&>th]:h-10 [&>th]:px-3">
          <th className="w-28 text-center">Empaques</th>
          <th className="w-24">Código</th>
          <th>Producto</th>
          <th className="w-20 text-center">Unds</th>
          <th className="w-32 text-right">Peso (kg)</th>
          {movimiento && <th className="w-32 text-center">Movimiento</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {filas.map((f) => (
          <tr key={f.codigo} className="h-11 hover:bg-muted/40 [&>td]:px-3">
            <td className="text-center font-semibold">{f.empaques}</td>
            <td className="text-muted-foreground">{f.codigo}</td>
            <td className="font-semibold uppercase">{f.producto}</td>
            <td className="text-center">{f.unds}</td>
            <td className="text-right font-bold">{kg(f.kg)}</td>
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
}: {
  config: Pick<ConfigRegistroProductos<O>, 'icono' | 'numero' | 'tipoTexto' | 'sinOrdenes'>;
  cargando: boolean;
  ordenes: O[];
  seleccionadaId: string | null;
  onElegir: (o: O) => void;
  refrescando: boolean;
  onRefrescar: () => void;
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
          <b className="tabular-nums text-foreground">{visibles.length}</b> orden(es) activa(s)
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
  cliente: { concepto: string; nit: string | null };
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
  useRegistrar: (ordenId: string) => Mutacion<{ codigo: string; pesoKg: number; taraKg: number }>;
  useQuitar: (ordenId: string) => Mutacion<string>;
  useCerrar: () => Mutacion<string>;
  buscar: (ordenId: string, codigo: string) => Promise<EtiquetaPorTrasladar>;
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
  useRegistrar: useRegistrarTraslado,
  useQuitar: useQuitarTraslado,
  useCerrar: useCerrarTraslado,
  buscar: buscarEtiquetaTraslado,
};

export function RegistroProductosPage<O extends OrdenRegistro>({
  config,
}: {
  config: ConfigRegistroProductos<O>;
}) {
  const [vista, setVista] = useState<'ordenes' | 'orden'>('ordenes');
  const [orden, setOrden] = useState<O | null>(null);
  const ordenes = config.useOrdenes();
  const items = config.useItems(orden?.id ?? null);
  const registrar = config.useRegistrar(orden?.id ?? '');
  const quitar = config.useQuitar(orden?.id ?? '');
  const cerrar = config.useCerrar();

  const [codigo, setCodigo] = useState('');
  const [pendiente, setPendiente] = useState<EtiquetaPorTrasladar | null>(null);
  const [buscando, setBuscando] = useState(false);
  const { peso, setPeso, leyendo, error: errorBascula, leerBascula } = useBascula('0.00');
  const [tara, setTara] = useState(0);
  const [tecladoPeso, setTecladoPeso] = useState(false);
  const [alerta, setAlerta] = useState<{ id: number; texto: string; ok?: boolean } | null>(null);
  const [confirmarDiferencia, setConfirmarDiferencia] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState<ItemTraslado | null>(null);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const codigoRef = useRef<HTMLInputElement>(null);

  const lista = items.data ?? [];
  const pesoKg = Number(peso) || 0;
  const netoKg = Math.max(Number((pesoKg - tara).toFixed(2)), 0);
  const totales = useMemo(
    () => ({
      empaques: lista.length,
      unds: lista.reduce((s, i) => s + i.unds, 0),
      kg: lista.reduce((s, i) => s + i.netoKg, 0),
      tara: lista.reduce((s, i) => s + i.taraKg, 0),
      bruto: lista.reduce((s, i) => s + i.pesoKg, 0),
      // Diferencia entre el repesaje y lo que decían las etiquetas.
      diff: lista.reduce((s, i) => s + (i.netoKg - i.netoEtiquetaKg), 0),
    }),
    [lista],
  );

  useEffect(() => {
    if (errorBascula) setAlerta({ id: Date.now(), texto: errorBascula });
  }, [errorBascula]);

  useEffect(() => {
    if (!alerta) return;
    const t = setTimeout(() => setAlerta(null), 3000);
    return () => clearTimeout(t);
  }, [alerta]);

  function avisar(texto: string, ok = false) {
    setAlerta({ id: Date.now(), texto, ok });
  }

  function limpiarLectura() {
    setCodigo('');
    setPendiente(null);
    setPeso('0.00');
    codigoRef.current?.focus();
  }

  function elegirOrden(o: O) {
    setOrden(o);
    limpiarLectura();
    setVista('orden');
  }

  async function buscar() {
    const valor = codigo.trim().toUpperCase();
    if (!valor) return;
    if (!orden) return avisar('Selecciona primero una orden.');
    setBuscando(true);
    try {
      setPendiente(await config.buscar(orden.id, valor));
    } catch (err) {
      setPendiente(null);
      avisar(mensajeApi(err, 'No se pudo consultar la etiqueta.'));
    } finally {
      setBuscando(false);
    }
  }

  function confirmar() {
    if (!orden) return avisar('Selecciona primero una orden.');
    if (!pendiente) return avisar('Pistolea el código de barras de la etiqueta.');
    if (netoKg <= 0) return avisar('Toma el peso: el neto debe ser mayor que cero.');
    if (Math.abs(netoKg - pendiente.netoEtiquetaKg) > 0.009) {
      setConfirmarDiferencia(true);
      return;
    }
    void guardar();
  }

  async function guardar() {
    if (!pendiente) return;
    setConfirmarDiferencia(false);
    try {
      await registrar.mutateAsync({ codigo: pendiente.codigo, pesoKg, taraKg: tara });
      avisar(`${pendiente.productoNombre} registrado (${kg(netoKg)} kg).`, true);
      limpiarLectura();
    } catch (err) {
      avisar(mensajeApi(err, 'No se pudo registrar el producto.'));
    }
  }

  function cancelar() {
    if (pendiente || codigo) return limpiarLectura();
    setOrden(null);
    setVista('ordenes');
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
              variant={lista.length ? 'default' : 'outline'}
              className="h-12 px-5 text-base"
              onClick={() => setConfirmarCierre(true)}
              disabled={!lista.length || cerrar.isPending}
              title={lista.length ? 'Cerrar la orden' : 'La orden no tiene productos'}
            >
              {cerrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Lock className="size-5" />}
              Cerrar orden
            </Button>
          </div>

          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
            {/* Productos registrados */}
            <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
              <h3 className="shrink-0 px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Productos <span className="tabular-nums text-foreground">({agrupar(lista).length})</span>
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

            {/* Lectura y báscula */}
            <div className="scrollbar-app flex min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-5 shadow-sm">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Código de barras</span>
                <div className="mt-1 flex h-14 items-center gap-2 rounded-xl border-2 border-input bg-background px-3 focus-within:border-primary">
                  <ScanBarcode className="size-6 shrink-0 text-muted-foreground" />
                  <input
                    ref={codigoRef}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^0-9AC-]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void buscar();
                    }}
                    autoFocus
                    placeholder="Pistolea la etiqueta"
                    className="h-full w-full min-w-0 bg-transparent text-xl font-bold tabular-nums outline-none placeholder:text-base placeholder:font-normal"
                  />
                  {buscando && <LoaderCircle className="size-5 shrink-0 animate-spin text-muted-foreground" />}
                </div>
              </label>

              {pendiente ? (
                <div className="rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
                  <p className="truncate text-base font-bold uppercase">
                    {pendiente.productoCodigo} · {pendiente.productoNombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pendiente.tipo === 'canastilla'
                      ? `Canastilla N.º ${pendiente.canastillaNumero}`
                      : `Pieza #${pendiente.pieza}${pendiente.canastillaNumero ? ` · canastilla N.º ${pendiente.canastillaNumero}` : ''}`}
                    {' · '}
                    {pendiente.codigo}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Dato label="Unds" valor={pendiente.unds} />
                    <Dato label="Neto etiqueta" valor={kg(pendiente.netoEtiquetaKg)} />
                    <Dato label="Neto nuevo" valor={kg(netoKg)} className="text-emerald-700" />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Pistolea la etiqueta o canastilla, toma el peso y registra.
                </div>
              )}

              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peso</span>
                <div
                  className={cn(
                    'relative mt-1 flex items-baseline justify-center gap-2 rounded-xl border-2 bg-muted/30 px-4 py-3 transition-colors',
                    pendiente ? 'border-primary/40 focus-within:border-primary' : 'border-border',
                  )}
                >
                  <input
                    value={peso}
                    onChange={(e) => setPeso(soloDecimal(e.target.value))}
                    onClick={() => setTecladoPeso(true)}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmar();
                    }}
                    inputMode="none"
                    aria-label="Peso en kg"
                    className="w-full min-w-0 bg-transparent text-right text-5xl font-bold tabular-nums text-foreground outline-none"
                  />
                  <span className="text-2xl font-semibold text-muted-foreground">kg</span>
                  {tecladoPeso && <NumericKeypad value={peso} onChange={setPeso} onClose={() => setTecladoPeso(false)} />}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tara (kg)</span>
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

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-16 text-base" onClick={leerBascula} disabled={leyendo}>
                  {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
                  Leer báscula
                </Button>
                <Button className="h-16 text-base" onClick={confirmar} disabled={!pendiente || registrar.isPending}>
                  {registrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
                  Registrar
                </Button>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-11" onClick={cancelar} disabled={!pendiente && !codigo}>
                  <X className="size-4" />
                  Cancelar lectura
                </Button>
                <Button
                  variant="outline"
                  className="h-11 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => lista[0] && setConfirmarQuitar(lista[0])}
                  disabled={!lista.length || quitar.isPending}
                >
                  <Trash2 className="size-4" />
                  Quitar último
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmarDiferencia && pendiente && (
        <Dialog open onClose={() => setConfirmarDiferencia(false)} title="Peso diferente al de la etiqueta" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              El peso neto nuevo de <b>{pendiente.productoNombre}</b> es <b>{kg(netoKg)} kg</b> y la
              etiqueta dice <b>{kg(pendiente.netoEtiquetaKg)} kg</b> (diferencia{' '}
              {kg(netoKg - pendiente.netoEtiquetaKg)} kg).
            </p>
            <p className="font-semibold">¿Desea registrar el producto con el peso nuevo?</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarDiferencia(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void guardar()} disabled={registrar.isPending}>
                <Check className="size-4" />
                Aceptar
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {confirmarQuitar && (
        <Dialog open onClose={() => setConfirmarQuitar(null)} title="¿Quitar el último registro?" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              {confirmarQuitar.productoCodigo} · <b>{confirmarQuitar.productoNombre}</b> ·{' '}
              {confirmarQuitar.unds} und · {kg(confirmarQuitar.netoKg)} kg ({confirmarQuitar.codigo}). Vuelve a
              quedar disponible en el inventario.
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

      {confirmarCierre && orden && (
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
                  cerrar.mutate(orden.id, {
                    onSuccess: () => {
                      setConfirmarCierre(false);
                      avisar(`Orden ${config.numero(orden)} cerrada.`, true);
                      setOrden(null);
                      limpiarLectura();
                      setVista('ordenes');
                    },
                    onError: (err) => {
                      setConfirmarCierre(false);
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

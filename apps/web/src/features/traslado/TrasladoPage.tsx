import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Gauge,
  LoaderCircle,
  Lock,
  Trash2,
  Truck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn, soloDecimal } from '@/lib/utils';
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
import { FieldBox, Mensaje } from '../rotulado/ui';

type Tab = 'ordenes' | 'registro' | 'totales';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'Órdenes de traslado' },
  { key: 'registro', label: 'Registro' },
  { key: 'totales', label: 'Totales' },
];

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
  const th = 'border border-border px-3 py-2 text-left font-semibold';
  const td = 'border border-border px-3 py-1.5';
  return (
    <table className="w-full border-collapse text-sm tabular-nums">
      <thead className="sticky top-0 bg-muted">
        <tr>
          <th className={th}>Empaques</th>
          <th className={th}>Código</th>
          <th className={th}>Producto</th>
          <th className={th}>Unds</th>
          <th className={cn(th, 'text-right')}>Peso(kg)</th>
          {movimiento && <th className={th}>Movimiento</th>}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.codigo} className="odd:bg-muted/30">
            <td className={td}>{f.empaques}</td>
            <td className={td}>{f.codigo}</td>
            <td className={cn(td, 'uppercase')}>{f.producto}</td>
            <td className={td}>{f.unds}</td>
            <td className={cn(td, 'text-right')}>{kg(f.kg)}</td>
            {movimiento && <td className={td}>SALIDA</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TrasladoPage() {
  return <RegistroProductosPage config={CONFIG_TRASLADO} />;
}

export interface OrdenRegistro {
  id: string;
  cliente: { concepto: string };
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
  useOrdenes: () => { data?: O[]; isLoading: boolean };
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
  const Icono = config.icono;
  const tabs = TABS.map((t) => (t.key === 'ordenes' ? { ...t, label: config.tabOrdenes } : t));
  const [tab, setTab] = useState<Tab>('ordenes');
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    setTab('registro');
  }

  async function buscar() {
    const valor = codigo.trim().toUpperCase();
    if (!valor) return;
    if (!orden) return avisar('Selecciona primero una orden.');
    setBuscando(true);
    try {
      setPendiente(await config.buscar(orden.id, valor));
      setTab('registro');
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
    setTab('ordenes');
  }

  const botonIcono =
    'flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-foreground/70 bg-card hover:bg-muted disabled:opacity-40';

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col gap-3 p-2">
      {alerta && (
        <div key={alerta.id} className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div
            role="alert"
            className={cn(
              'flex max-w-md items-start gap-3 rounded-md border-2 bg-card px-5 py-4 shadow-2xl',
              alerta.ok ? 'border-emerald-500' : 'border-amber-400',
            )}
          >
            {alerta.ok ? (
              <Check className="mt-0.5 size-7 shrink-0 text-emerald-600" />
            ) : (
              <TriangleAlert className="mt-0.5 size-7 shrink-0 text-amber-500" />
            )}
            <p className="text-base font-semibold text-foreground">{alerta.texto}</p>
          </div>
        </div>
      )}

      {/* Orden y cliente */}
      <div className="flex items-stretch gap-2 pt-3">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <Icono className="size-10" />
        </div>
        <FieldBox label="Orden No.:" className="w-48">
          <div className="flex h-9 items-center justify-center text-2xl font-bold tabular-nums text-red-600">
            {orden ? config.numero(orden) : ''}
          </div>
        </FieldBox>
        <FieldBox label="Cliente:" className="min-w-0 flex-1">
          <div className="flex h-9 items-center truncate text-xl font-medium uppercase">
            {orden ? `${orden.cliente.concepto} (${config.tipoTexto})` : ''}
          </div>
        </FieldBox>
      </div>

      {/* Lectura, peso y taras */}
      <div className="flex items-stretch gap-2 pt-2">
        <FieldBox label="Código de Barras:" className="w-60">
          <input
            ref={codigoRef}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^0-9AC-]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void buscar();
            }}
            disabled={!orden}
            placeholder={orden ? 'Pistolea la etiqueta' : ''}
            className="h-9 w-full bg-transparent text-lg font-bold tabular-nums outline-none"
          />
        </FieldBox>
        <button
          onClick={() => lista[0] && setConfirmarQuitar(lista[0])}
          disabled={!orden || !lista.length || quitar.isPending}
          title="Quitar el último registro"
          className={botonIcono}
        >
          <Trash2 className="size-7" />
        </button>
        <FieldBox label="Peso(kg):" className="w-32">
          <input
            value={peso}
            onChange={(e) => setPeso(soloDecimal(e.target.value))}
            onClick={() => setTecladoPeso(true)}
            inputMode="none"
            className="h-9 w-full bg-transparent text-center text-2xl font-bold tabular-nums outline-none"
          />
          {tecladoPeso && (
            <NumericKeypad value={peso} onChange={setPeso} onClose={() => setTecladoPeso(false)} />
          )}
        </FieldBox>
        <button onClick={leerBascula} disabled={leyendo} title="Leer báscula" className={botonIcono}>
          {leyendo ? <LoaderCircle className="size-7 animate-spin" /> : <Gauge className="size-8" />}
        </button>
        <FieldBox label="Taras Frecuentes:" className="flex-1">
          <div className="flex h-9 items-center gap-1.5">
            {TARAS.map((t) => (
              <button
                key={t}
                onClick={() => setTara(t)}
                aria-pressed={tara === t}
                className={cn(
                  'h-8 flex-1 border-2 text-base font-medium tabular-nums',
                  tara === t
                    ? 'border-foreground bg-red-600 text-white'
                    : 'border-foreground/70 bg-card hover:bg-muted',
                )}
              >
                {t === 0 ? '0.0' : t.toFixed(2)}
              </button>
            ))}
          </div>
        </FieldBox>
        <button
          onClick={confirmar}
          disabled={!pendiente || registrar.isPending}
          title="Registrar producto"
          className={cn(botonIcono, 'text-emerald-700')}
        >
          {registrar.isPending ? <LoaderCircle className="size-7 animate-spin" /> : <Check className="size-9" />}
        </button>
        <button
          onClick={cancelar}
          title={pendiente || codigo ? 'Cancelar lectura' : 'Salir de la orden'}
          className="flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-red-800 bg-red-600 text-white hover:bg-red-700"
        >
          <X className="size-8" />
        </button>
      </div>

      {/* Pestañas */}
      <div className="flex overflow-hidden rounded-sm border-2 border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 border-r-2 border-border px-3 py-3 text-center text-sm font-semibold uppercase tracking-wide transition-colors last:border-r-0',
              tab === t.key
                ? 'bg-background text-foreground shadow-[inset_0_-3px_0_0] shadow-emerald-600'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-sm border-2 border-border bg-card">
        {tab === 'ordenes' ? (
          ordenes.isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : !ordenes.data?.length ? (
            <Mensaje text={config.sinOrdenes} />
          ) : (
            <ul className="flex flex-col gap-2 p-2">
              {ordenes.data.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => elegirOrden(o)}
                    className={cn(
                      'w-full rounded-sm border-2 px-4 py-3 text-left text-lg font-medium uppercase transition-colors',
                      orden?.id === o.id ? 'border-sky-600 bg-sky-100' : 'border-border bg-card hover:bg-muted/50',
                    )}
                  >
                    <span className="font-bold tabular-nums">{config.numero(o)}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    {o.cliente.concepto} ({config.tipoTexto})
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'registro' ? (
          <div className="flex h-full flex-col gap-3 p-3">
            {pendiente && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 rounded-md border-2 border-sky-500 bg-sky-50 px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold uppercase">
                    {pendiente.productoCodigo} · {pendiente.productoNombre}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pendiente.tipo === 'canastilla'
                      ? `Canastilla N.º ${pendiente.canastillaNumero}`
                      : `Pieza #${pendiente.pieza}${pendiente.canastillaNumero ? ` · canastilla N.º ${pendiente.canastillaNumero}` : ''}`}
                    {' · '}
                    {pendiente.codigo}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Unds</p>
                  <p className="text-xl font-bold tabular-nums">{pendiente.unds}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Neto etiqueta</p>
                  <p className="text-xl font-bold tabular-nums">{kg(pendiente.netoEtiquetaKg)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Neto nuevo</p>
                  <p className="text-xl font-bold tabular-nums text-emerald-700">{kg(netoKg)}</p>
                </div>
              </div>
            )}
            {buscando && <LoaderCircle className="mx-auto size-6 animate-spin text-muted-foreground" />}
            <p className="text-base font-medium">Productos:</p>
            <div className="min-h-0 flex-1 overflow-auto">
              {orden ? (
                <TablaProductos items={lista} />
              ) : (
                <Mensaje text={`Selecciona una orden en la pestaña ${config.tabOrdenes.toUpperCase()}.`} />
              )}
            </div>
            <div className={cn('grid gap-2 pt-2', config.indicadoresDespacho ? 'grid-cols-6' : 'grid-cols-7')}>
              {(config.indicadoresDespacho
                ? [
                    { label: 'Canastillas:', valor: String(totales.empaques), color: '' },
                    { label: 'Unds:', valor: String(totales.unds), color: '' },
                    { label: 'Tara(kg):', valor: kg(totales.tara), color: '' },
                    { label: 'Neto(kg):', valor: kg(totales.kg), color: 'text-emerald-700' },
                    { label: 'Bruto (kg):', valor: kg(totales.bruto), color: 'text-red-600' },
                    { label: 'Diff.(kg):', valor: kg(totales.diff), color: 'text-blue-700' },
                  ]
                : [
                    { label: 'Emp.:', valor: String(totales.empaques), color: '' },
                    { label: 'Unds:', valor: String(totales.unds), color: '' },
                    { label: 'Tara:', valor: tara.toFixed(2), color: '' },
                    { label: 'Total Tara(kg):', valor: kg(totales.tara), color: '' },
                    { label: 'Neto(kg):', valor: kg(totales.kg), color: 'text-emerald-700' },
                    { label: 'Bruto (kg):', valor: kg(totales.bruto), color: 'text-red-600' },
                    { label: 'Diff.(kg):', valor: kg(totales.diff), color: 'text-blue-700' },
                  ]
              ).map((c) => (
                <FieldBox key={c.label} label={c.label}>
                  <div className={cn('flex h-10 items-center justify-end text-2xl font-bold tabular-nums', c.color)}>
                    {c.valor}
                  </div>
                </FieldBox>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3 p-3">
            <p className="text-base font-medium">Productos:</p>
            <div className="min-h-0 flex-1 overflow-auto">
              {orden ? (
                <TablaProductos items={lista} movimiento />
              ) : (
                <Mensaje text={`Selecciona una orden en la pestaña ${config.tabOrdenes.toUpperCase()}.`} />
              )}
            </div>
            <div className="flex items-stretch justify-end gap-2 pt-2">
              <FieldBox label="Canastillas:" className="w-36">
                <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums">
                  {totales.empaques}
                </div>
              </FieldBox>
              {!config.indicadoresDespacho && (
                <FieldBox label="Piezas:" className="w-36">
                  <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums">
                    {totales.unds}
                  </div>
                </FieldBox>
              )}
              <FieldBox label="Neto (kg):" className="w-48">
                <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums">
                  {kg(totales.kg)}
                </div>
              </FieldBox>
              <button
                onClick={() => setConfirmarCierre(true)}
                disabled={!orden || cerrar.isPending}
                title="Cerrar la orden"
                className={cn(botonIcono, 'size-14')}
              >
                <Lock className="size-8" />
              </button>
            </div>
          </div>
        )}
      </div>

      {tab === 'ordenes' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: -220, behavior: 'smooth' })}
            className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
            aria-label="Subir"
          >
            <ChevronUp className="size-7" />
          </button>
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: 220, behavior: 'smooth' })}
            className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
            aria-label="Bajar"
          >
            <ChevronDown className="size-7" />
          </button>
        </div>
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
                      setTab('ordenes');
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

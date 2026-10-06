import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  Beef,
  ChevronDown,
  ChevronUp,
  Gauge,
  LoaderCircle,
  Lock,
  Pencil,
  RefreshCw,
  ThermometerSnowflake,
  ThermometerSun,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn, soloDecimal } from '@/lib/utils';
import { FieldBox, Mensaje, RegistroTab, TotalesTab } from '../canal-fria/CanalFriaPage';
import type { ItemDespacho } from '../canal-fria/api';
import {
  buscarProductoPosta,
  formatDC,
  useAgregarItemDespachoCanales,
  useCerrarDespachoCanales,
  useDespachosCanalesActivos,
  useDespachosPostaActivos,
  useItemsDespachoCanales,
  usePesarItemDespachoCanales,
  useProductosPosta,
  useQuitarItemDespachoCanales,
  useQuitarProductoPosta,
  useRegistrarProductoPosta,
  type OrdenDespachoCanales,
  type TipoDespachoCanales,
} from '../registrar/despacho-canales-api';
import { RegistroProductosPage, type ConfigRegistroProductos } from '../traslado/TrasladoPage';

export type TipoDespachoLogistica = TipoDespachoCanales;

const CONFIG: Record<
  TipoDespachoLogistica,
  { titulo: string; icono: React.ComponentType<{ className?: string }> }
> = {
  caliente: { titulo: 'Despacho Caliente', icono: ThermometerSun },
  frio: { titulo: 'Despacho Frío', icono: ThermometerSnowflake },
  posta: { titulo: 'Despacho Posta', icono: Beef },
};

type Tab = 'ordenes' | 'registro' | 'totales';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'Órdenes de despacho' },
  { key: 'registro', label: 'Registro' },
  { key: 'totales', label: 'Totales' },
];

const num = (n: number, dec = 1) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const botonIcono =
  'flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-foreground/70 bg-card hover:bg-muted disabled:opacity-40';

const CONFIG_POSTA: ConfigRegistroProductos<OrdenDespachoCanales> = {
  icono: Beef,
  tabOrdenes: 'Órdenes de despacho',
  tipoTexto: 'DESPACHO POSTA',
  numero: (o) => formatDC(o.dcNumber),
  sinOrdenes:
    'No hay órdenes de despacho posta activas. Créalas en Administrativo → Órdenes Despacho Canales.',
  tituloCierre: 'Cerrar orden de despacho',
  indicadoresDespacho: true,
  useOrdenes: useDespachosPostaActivos,
  useItems: useProductosPosta,
  useRegistrar: useRegistrarProductoPosta,
  useQuitar: useQuitarProductoPosta,
  useCerrar: useCerrarDespachoCanales,
  buscar: buscarProductoPosta,
};

export function DespachoLogisticaPage({ tipo }: { tipo: TipoDespachoLogistica }) {
  if (tipo === 'posta') return <RegistroProductosPage config={CONFIG_POSTA} />;
  return <DespachoCanales tipo={tipo} />;
}

/** Despacho caliente / frío: se pistolean canales en la orden DC y salen del inventario. */
function DespachoCanales({ tipo }: { tipo: TipoDespachoCanales }) {
  const { titulo, icono: Icono } = CONFIG[tipo];
  const [tab, setTab] = useState<Tab>('ordenes');
  const [orden, setOrden] = useState<OrdenDespachoCanales | null>(null);
  const ordenes = useDespachosCanalesActivos(tipo);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [barcode, setBarcode] = useState('');
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const itemsQuery = useItemsDespachoCanales(orden?.id ?? null);
  const items = itemsQuery.data ?? [];
  const agregar = useAgregarItemDespachoCanales(orden?.id ?? null);
  const quitar = useQuitarItemDespachoCanales(orden?.id ?? null);
  const pesar = usePesarItemDespachoCanales(orden?.id ?? null);
  const cerrar = useCerrarDespachoCanales();
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const totalNeto = items.reduce((s, i) => s + (i.despachoKg ?? i.pesoKg), 0);
  const sinPesar = items.filter((i) => i.despachoKg === null).length;
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = items.find((i) => i.itemId === seleccionadoId) ?? null;
  // Lote del último pistoleo o de la fila seleccionada.
  const ultimo = seleccionado ?? items[items.length - 1] ?? null;
  const [scanError, setScanErrorState] = useState<string | null>(null);
  const [alertaId, setAlertaId] = useState(0);
  const buscando = agregar.isPending;

  function setScanError(texto: string | null) {
    setScanErrorState(texto);
    if (texto) setAlertaId(Date.now());
  }

  // La alerta se quita sola a los 4 segundos.
  useEffect(() => {
    if (!scanError) return;
    const t = setTimeout(() => setScanErrorState(null), 4000);
    return () => clearTimeout(t);
  }, [scanError, alertaId]);

  useEffect(() => {
    if (error) setScanError(error);
  }, [error]);

  const mensajeApi = (err: unknown, porDefecto: string) => {
    const m = isAxiosError(err) ? err.response?.data?.message : null;
    return typeof m === 'string' ? m : porDefecto;
  };

  function seleccionar(item: ItemDespacho | null) {
    setSeleccionadoId(item?.itemId ?? null);
    setPeso('0.0');
    setScanError(null);
  }

  async function guardarPeso() {
    if (!seleccionado || pesar.isPending) return;
    const kg = Number(peso.replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) {
      setScanError('Toma un peso mayor a 0 antes de guardar.');
      return;
    }
    setScanError(null);
    try {
      await pesar.mutateAsync({ itemId: seleccionado.itemId, despachoKg: kg });
      const siguiente = items.find((i) => i.itemId !== seleccionado.itemId && i.despachoKg === null);
      seleccionar(siguiente ?? null);
    } catch (err) {
      setScanError(mensajeApi(err, 'No se pudo guardar el peso.'));
    }
  }

  async function escanear() {
    const codigo = barcode.trim();
    if (!codigo || !orden || buscando) return;
    setScanError(null);
    try {
      await agregar.mutateAsync(codigo);
      setBarcode('');
      setTab('registro');
    } catch (err) {
      setScanError(mensajeApi(err, 'No se pudo despachar la canal.'));
    }
  }

  function quitarItem(itemId: string) {
    setScanError(null);
    quitar.mutate(itemId, {
      onSuccess: () => {
        if (seleccionadoId === itemId) setSeleccionadoId(null);
      },
      onError: (err) => setScanError(mensajeApi(err, 'No se pudo quitar la canal.')),
    });
  }

  function elegirOrden(o: OrdenDespachoCanales | null) {
    setOrden(o);
    setSeleccionadoId(null);
    setScanError(null);
  }

  function cerrarOrden() {
    if (!orden) return;
    cerrar.mutate(orden.id, {
      onSuccess: () => {
        setConfirmarCierre(false);
        elegirOrden(null);
        setTab('ordenes');
      },
      onError: (err) => {
        setConfirmarCierre(false);
        setScanError(mensajeApi(err, 'No se pudo cerrar la orden.'));
      },
    });
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col gap-3 p-2">
      {/* Encabezado: orden y cliente */}
      <div className="flex items-stretch gap-2">
        <div
          title={titulo}
          className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2"
        >
          <Icono className="size-10 text-foreground" />
        </div>
        <FieldBox label="DC No.:" className="min-w-44">
          <div className="flex h-9 items-center text-xl font-bold tabular-nums text-red-600">
            {orden ? formatDC(orden.dcNumber) : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {orden?.cliente.concepto ?? '—'}
          </div>
        </FieldBox>
      </div>

      {/* Pistoleo y báscula */}
      <div className="flex flex-wrap items-stretch gap-2">
        <FieldBox label="Lote:" className="w-28">
          <div className="flex h-10 items-center justify-center text-xl font-bold tabular-nums">
            {ultimo?.reference ?? ''}
          </div>
        </FieldBox>
        <FieldBox label="Código de Barras:" className="min-w-48 flex-1">
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void escanear();
            }}
            disabled={!orden || buscando}
            autoFocus
            placeholder={orden ? 'Escanea el presinto y presiona Enter…' : 'Elige una orden'}
            className="h-10 w-full bg-transparent text-xl font-semibold outline-none disabled:opacity-50"
          />
        </FieldBox>
        <button
          onClick={() => {
            setBarcode('');
            setScanError(null);
          }}
          title="Limpiar código"
          className={botonIcono}
        >
          <Trash2 className="size-7" />
        </button>
        <button
          onClick={() => {
            setBarcode('');
            setPeso('0.0');
            elegirOrden(null);
            setTab('ordenes');
            void ordenes.refetch();
          }}
          title="Reiniciar"
          className={botonIcono}
        >
          <RefreshCw className="size-7" />
        </button>
        <FieldBox label="Peso (kg):" className="w-32">
          <input
            value={peso}
            onChange={(e) => setPeso(soloDecimal(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void guardarPeso();
            }}
            inputMode="decimal"
            disabled={!seleccionado}
            title={seleccionado ? 'Enter para guardar el peso' : 'Selecciona una fila de Productos'}
            className="h-10 w-full bg-transparent text-center text-2xl font-bold text-emerald-700 outline-none disabled:opacity-50"
          />
        </FieldBox>
        <button
          onClick={leerBascula}
          disabled={leyendo || !seleccionado}
          title="Leer báscula"
          className={botonIcono}
        >
          {leyendo ? <LoaderCircle className="size-7 animate-spin" /> : <Gauge className="size-7" />}
        </button>
        <button
          onClick={() => void guardarPeso()}
          disabled={!seleccionado || pesar.isPending}
          title="Guardar peso de despacho de la canal seleccionada"
          className={botonIcono}
        >
          {pesar.isPending ? <LoaderCircle className="size-7 animate-spin" /> : <Pencil className="size-7" />}
        </button>
        <FieldBox label="Gancho:" className="w-24">
          <div className="flex h-10 items-center justify-center text-2xl font-bold tabular-nums text-red-600">
            {seleccionado ? (seleccionado.turno ?? seleccionado.sequence) : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Cant.(kg):" className="w-28">
          <div className="flex h-10 items-center justify-center text-2xl font-bold tabular-nums">
            {seleccionado ? num(seleccionado.pesoKg, 1) : '—'}
          </div>
        </FieldBox>
        {scanError && (
          <div
            key={alertaId}
            className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
          >
            <div
              role="alert"
              className="flex max-w-lg items-start gap-3 rounded-md border-2 border-amber-400 bg-card px-5 py-4 shadow-2xl"
            >
              <TriangleAlert className="mt-0.5 size-7 shrink-0 text-amber-500" />
              <p className="text-base font-semibold text-foreground">{scanError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div className="flex overflow-hidden rounded-sm border-2 border-border">
        {TABS.map((t) => (
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

      {/* Contenido */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-sm border-2 border-border bg-card">
        {tab === 'ordenes' &&
          (ordenes.isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : !ordenes.data?.length ? (
            <Mensaje
              text={`No hay órdenes de ${titulo.toLowerCase()} activas. Créalas en Administrativo → Órdenes Despacho Canales.`}
            />
          ) : (
            <ul className="flex flex-col gap-2 p-2">
              {ordenes.data.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => {
                      elegirOrden(o);
                      setTab('registro');
                    }}
                    className={cn(
                      'w-full rounded-sm border-2 px-4 py-4 text-left text-lg font-medium transition-colors',
                      orden?.id === o.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-border bg-card hover:bg-muted/50',
                    )}
                  >
                    <span className="font-bold tabular-nums">{formatDC(o.dcNumber)}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    {o.cliente.nit ? `${o.cliente.nit} - ` : ''}
                    {o.cliente.concepto} ({titulo.toUpperCase()})
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'registro' &&
          (!orden ? (
            <Mensaje text="Selecciona una orden en la pestaña ÓRDENES DE DESPACHO." />
          ) : (
            <RegistroTab
              items={items}
              seleccionadoId={seleccionadoId}
              onSeleccionar={seleccionar}
              onQuitar={quitarItem}
              quitando={quitar.isPending}
            />
          ))}
        {tab === 'totales' &&
          (!orden ? (
            <Mensaje text="Selecciona una orden en la pestaña ÓRDENES DE DESPACHO." />
          ) : (
            <TotalesTab items={items} />
          ))}
      </div>

      {tab === 'totales' && orden && (
        <div className="flex items-stretch gap-2">
          <FieldBox label="Total Piezas:" className="w-40">
            <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums">
              {items.length}
            </div>
          </FieldBox>
          <FieldBox label="Total Neto(kg):" className="w-52">
            <div
              title="Peso de despacho; las canales sin pesar cuentan con su peso en caliente"
              className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums"
            >
              {num(totalNeto)}
            </div>
          </FieldBox>
          <button
            onClick={() => setConfirmarCierre(true)}
            disabled={!items.length || cerrar.isPending}
            title={items.length ? 'Cerrar la orden de despacho' : 'La orden no tiene canales'}
            className={cn(botonIcono, 'ml-auto self-center')}
          >
            <Lock className="size-8" />
          </button>
        </div>
      )}

      {confirmarCierre && orden && (
        <Dialog open onClose={() => setConfirmarCierre(false)} title="Cerrar orden" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              ¿Está seguro de cerrar la orden con consecutivo <b>{formatDC(orden.dcNumber)}</b>?
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Las {items.length} canales ({num(totalNeto)} kg) quedan como despachadas y salen del
              inventario. El registro se conserva para consulta o devoluciones.
              {sinPesar > 0 &&
                ` Ojo: ${sinPesar} ${sinPesar === 1 ? 'canal no tiene' : 'canales no tienen'} peso de despacho.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarCierre(false)}>
                No
              </Button>
              <Button disabled={cerrar.isPending} onClick={cerrarOrden}>
                <Lock className="size-4" />
                {cerrar.isPending ? 'Cerrando…' : 'Sí, cerrar'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      <div className={cn('grid grid-cols-2 gap-2', tab === 'registro' && 'hidden')}>
        <button
          onClick={() => scrollList(-1)}
          className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
          aria-label="Subir"
        >
          <ChevronUp className="size-7" />
        </button>
        <button
          onClick={() => scrollList(1)}
          className="flex items-center justify-center rounded-sm border-2 border-border bg-card py-3 hover:bg-muted"
          aria-label="Bajar"
        >
          <ChevronDown className="size-7" />
        </button>
      </div>
    </div>
  );
}

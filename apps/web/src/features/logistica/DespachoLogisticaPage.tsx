import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  Beef,
  CheckCircle2,
  LoaderCircle,
  Lock,
  ThermometerSnowflake,
  ThermometerSun,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PIEZA_LABEL, PanelFria, TablaDespacho, TotalesFria } from '../canal-fria/CanalFriaPage';
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
import { ListaOrdenes, RegistroProductosPage, type ConfigRegistroProductos } from '../traslado/TrasladoPage';

export type TipoDespachoLogistica = TipoDespachoCanales;

const CONFIG: Record<
  TipoDespachoLogistica,
  { titulo: string; icono: React.ComponentType<{ className?: string }> }
> = {
  caliente: { titulo: 'Despacho Caliente', icono: ThermometerSun },
  frio: { titulo: 'Despacho Frío', icono: ThermometerSnowflake },
  posta: { titulo: 'Despacho Posta', icono: Beef },
};

type Vista = 'ordenes' | 'despacho' | 'totales';

const num = (n: number, dec = 1) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

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
  const [vista, setVista] = useState<Vista>('ordenes');
  const [orden, setOrden] = useState<OrdenDespachoCanales | null>(null);
  const ordenes = useDespachosCanalesActivos(tipo);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState('');
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const itemsQuery = useItemsDespachoCanales(orden?.id ?? null);
  const items = itemsQuery.data ?? [];
  const agregar = useAgregarItemDespachoCanales(orden?.id ?? null);
  const quitar = useQuitarItemDespachoCanales(orden?.id ?? null);
  const pesar = usePesarItemDespachoCanales(orden?.id ?? null);
  const cerrar = useCerrarDespachoCanales();
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = items.find((i) => i.itemId === seleccionadoId) ?? null;
  const [ultimo, setUltimo] = useState<ItemDespacho | null>(null);
  const buscando = agregar.isPending;
  const pesoKg = Number(peso.replace(',', '.'));
  const hayPeso = Number.isFinite(pesoKg) && pesoKg > 0;
  // Las canales sin pesar cuentan con su peso en caliente.
  const totalNeto = items.reduce((s, i) => s + (i.despachoKg ?? i.pesoKg), 0);
  const sinPesar = items.filter((i) => i.despachoKg === null).length;

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  function flash(type: 'success' | 'error', text: string) {
    setNotice({ type, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }

  const mensajeApi = (err: unknown, porDefecto: string) => {
    const m = isAxiosError(err) ? err.response?.data?.message : null;
    return typeof m === 'string' ? m : porDefecto;
  };

  function seleccionar(item: ItemDespacho | null) {
    setSeleccionadoId(item?.itemId ?? null);
    setPeso('0.0');
  }

  async function guardarPeso() {
    if (!seleccionado || pesar.isPending) return;
    if (!hayPeso) return flash('error', 'Toma un peso mayor a 0 antes de guardar.');
    try {
      await pesar.mutateAsync({ itemId: seleccionado.itemId, despachoKg: pesoKg });
      flash('success', `Peso del gancho ${seleccionado.turno ?? seleccionado.sequence} guardado: ${num(pesoKg)} kg.`);
      const siguiente = items.find((i) => i.itemId !== seleccionado.itemId && i.despachoKg === null);
      seleccionar(siguiente ?? null);
    } catch (err) {
      flash('error', mensajeApi(err, 'No se pudo guardar el peso.'));
    }
  }

  /** Agrega la canal; si hay peso en el campo, queda guardado como su peso de despacho. */
  async function escanear() {
    const codigo = barcode.trim();
    if (!codigo || !orden || buscando) return;
    try {
      let item = await agregar.mutateAsync(codigo);
      if (hayPeso) item = await pesar.mutateAsync({ itemId: item.itemId, despachoKg: pesoKg });
      setBarcode('');
      setPeso('0.0');
      setSeleccionadoId(null);
      setUltimo(item);
      flash(
        'success',
        `Gancho ${item.turno ?? item.sequence} (${PIEZA_LABEL[item.pieza]}) agregado${item.despachoKg != null ? `: ${num(item.despachoKg)} kg` : ''}.`,
      );
    } catch (err) {
      flash('error', mensajeApi(err, 'No se pudo despachar la canal.'));
    } finally {
      barcodeRef.current?.focus();
    }
  }

  function quitarItem(item: ItemDespacho) {
    quitar.mutate(item.itemId, {
      onSuccess: () => {
        seleccionar(null);
        flash('success', `Gancho ${item.turno ?? item.sequence} quitado de la orden: vuelve a ${item.cavaOrigen}.`);
      },
      onError: (err) => flash('error', mensajeApi(err, 'No se pudo quitar la canal.')),
    });
  }

  function elegirOrden(o: OrdenDespachoCanales | null) {
    setOrden(o);
    setSeleccionadoId(null);
    setUltimo(null);
  }

  function cerrarOrden() {
    if (!orden) return;
    const dc = formatDC(orden.dcNumber);
    cerrar.mutate(orden.id, {
      onSuccess: () => {
        setConfirmarCierre(false);
        elegirOrden(null);
        setPeso('0.0');
        setVista('ordenes');
        flash('success', `Orden ${dc} cerrada.`);
      },
      onError: (err) => {
        setConfirmarCierre(false);
        flash('error', mensajeApi(err, 'No se pudo cerrar la orden.'));
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="pointer-events-none fixed left-1/2 top-24 z-50 flex w-[30rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 flex-col gap-2">
        {(notice || error) && (
          <div
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-lg animate-in fade-in-0 slide-in-from-top-2',
              notice?.type === 'success' ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700',
            )}
          >
            {notice?.type === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <TriangleAlert className="size-4 shrink-0" />}
            <span className="flex-1">{notice?.text ?? error}</span>
            {notice && (
              <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar" className="shrink-0 opacity-60 hover:opacity-100">
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {vista === 'ordenes' || !orden ? (
        <ListaOrdenes
          config={{
            icono: Icono,
            numero: (o: OrdenDespachoCanales) => formatDC(o.dcNumber),
            tipoTexto: titulo.toUpperCase(),
            sinOrdenes: `No hay órdenes de ${titulo.toLowerCase()} activas. Créalas en Administrativo → Órdenes Despacho Canales.`,
          }}
          cargando={ordenes.isLoading}
          ordenes={ordenes.data ?? []}
          seleccionadaId={orden?.id ?? null}
          refrescando={ordenes.isFetching}
          onRefrescar={() => void ordenes.refetch()}
          onElegir={(o) => {
            elegirOrden(o);
            setVista('despacho');
          }}
        />
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setVista('ordenes')}>
              <ArrowLeft className="size-5" />
              Órdenes
            </Button>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">{formatDC(orden.dcNumber)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold uppercase">{orden.cliente.concepto}</div>
              <div className="text-sm text-muted-foreground">
                {titulo} · <b className="tabular-nums text-foreground">{items.length}</b> {items.length === 1 ? 'canal' : 'canales'} ·{' '}
                <b className="tabular-nums text-foreground">{num(totalNeto)}</b> kg
                {sinPesar > 0 && <span className="text-amber-700"> · {sinPesar} sin pesar</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {(['despacho', 'totales'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setVista(t)}
                  className={cn(
                    'flex h-10 items-center rounded-md px-4 text-sm font-semibold transition-colors',
                    vista === t ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'despacho' ? 'Despacho' : 'Totales'}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="h-12 px-5 text-base"
              onClick={() => setConfirmarCierre(true)}
              disabled={!items.length || cerrar.isPending}
              title={items.length ? 'Cerrar la orden de despacho' : 'La orden no tiene canales'}
            >
              {cerrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Lock className="size-5" />}
              Cerrar orden
            </Button>
          </div>

          {vista === 'despacho' ? (
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
              <TablaDespacho
                items={items}
                loading={itemsQuery.isLoading}
                seleccionadoId={seleccionadoId}
                onSeleccionar={(i) => seleccionar(seleccionadoId === i.itemId ? null : i)}
                pesoLabel="Despacho"
              />
              <PanelFria
                orden
                seleccionado={seleccionado}
                ultimo={ultimo}
                peso={peso}
                setPeso={setPeso}
                hayPeso={hayPeso}
                leyendo={leyendo}
                onLeer={() => void leerBascula()}
                barcode={barcode}
                setBarcode={setBarcode}
                barcodeRef={barcodeRef}
                buscando={buscando || pesar.isPending}
                onEscanear={() => void escanear()}
                guardando={pesar.isPending}
                onGuardarCorreccion={() => void guardarPeso()}
                quitando={quitar.isPending}
                onQuitar={() => seleccionado && quitarItem(seleccionado)}
                onCancelar={() => seleccionar(null)}
                pesoLabel="Peso de despacho"
                ayuda="Si hay un peso en el campo, la canal se agrega con ese peso de despacho; si no, sale con su peso en caliente y la puedes pesar después tocando la fila."
              />
            </div>
          ) : (
            <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
              <TotalesFria items={items} pesoLabel="Despacho" />
            </div>
          )}
        </>
      )}

      {confirmarCierre && orden && (
        <Dialog open onClose={() => setConfirmarCierre(false)} title="Cerrar orden" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              ¿Está seguro de cerrar la orden con consecutivo <b>{formatDC(orden.dcNumber)}</b>?
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Las {items.length} canales ({num(totalNeto)} kg) quedan como DESPACHADAS: salen de la
              cava y en Inventarios se ven marcadas con esta orden, con su trazabilidad.
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
    </div>
  );
}

import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Inbox,
  LayoutGrid,
  List,
  LoaderCircle,
  Lock,
  RefreshCw,
  Save,
  ScanBarcode,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn, formatFechaDia, soloDecimal } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import {
  useAgregarItemDespacho,
  useCerrarOrdenDespacho,
  useItemsDespacho,
  usePesarItemDespacho,
  useQuitarItemDespacho,
  type ItemDespacho,
} from './api';
import {
  formatOD,
  TIPO_ORDEN_DESPACHO,
  useOrdenesDespachoActivas,
  type OrdenDespacho,
} from '../registrar/orden-despacho-api';

export function FieldBox({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative rounded-sm border-2 border-border bg-card px-3 pb-1 pt-1',
        className,
      )}
    >
      <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Mensaje({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Inbox className="size-8" />
      <p className="max-w-sm text-sm">{text}</p>
    </div>
  );
}

export const PIEZA_LABEL: Record<ItemDespacho['pieza'], string> = {
  canal: 'CANAL',
  cizq: 'CIZQ',
  cder: 'CDER',
};

const num = (n: number, dec = 1) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Pestaña REGISTRO: piezas que salieron de cava hacia la orden y totales contra su peso en caliente. */
export function RegistroTab({
  items,
  seleccionadoId,
  onSeleccionar,
  onQuitar,
  quitando,
}: {
  items: ItemDespacho[];
  seleccionadoId: string | null;
  onSeleccionar: (item: ItemDespacho | null) => void;
  onQuitar: (itemId: string) => void;
  quitando: boolean;
}) {
  // Con una fila seleccionada, los totales muestran solo esa pieza; si no, toda la orden.
  const seleccion = items.filter((i) => i.itemId === seleccionadoId);
  const base = seleccion.length ? seleccion : items;
  const caliente = base.reduce((a, i) => a + i.pesoKg, 0);
  const despacho = base.reduce((a, i) => a + (i.despachoKg ?? 0), 0);
  // La diferencia solo cuenta las piezas que ya tienen peso de despacho.
  const calienteDespachado = base
    .filter((i) => (i.despachoKg ?? 0) > 0)
    .reduce((a, i) => a + i.pesoKg, 0);
  const diferencia = calienteDespachado - despacho;
  const pct = calienteDespachado > 0 ? (diferencia / calienteDespachado) * 100 : 0;
  const celda = 'whitespace-nowrap px-2 py-2';

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 p-3">
      <FieldBox label="Productos:" className="flex min-h-48 min-w-0 flex-1 flex-col pt-3">
        {items.length === 0 ? (
          <p className="m-auto text-sm text-muted-foreground">
            Escanea el código de barras de una canal para agregarla.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs font-semibold uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className={celda}>Barcode</th>
                <th className={celda}>Orden</th>
                <th className={celda}>Animal</th>
                <th className={celda}>Turno</th>
                <th className={celda}>Cliente</th>
                <th className={celda}>Fecha</th>
                <th className={celda}>Tipo</th>
                <th className={celda}>Pieza</th>
                <th className={celda}>Destino</th>
                <th className={celda}>Observación</th>
                <th className={celda}>Cava origen</th>
                <th className={cn(celda, 'text-right')}>Peso (kg)</th>
                <th className={cn(celda, 'text-right')}>Despacho (kg)</th>
                <th className={cn(celda, 'text-right')}>Merma (kg)</th>
                <th className={celda} aria-label="Quitar" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => (
                <tr
                  key={i.itemId}
                  onClick={() => onSeleccionar(seleccionadoId === i.itemId ? null : i)}
                  className={cn(
                    'cursor-pointer transition-colors',
                    seleccionadoId === i.itemId ? 'bg-emerald-50' : 'hover:bg-muted/40',
                  )}
                >
                  <td className={cn(celda, 'font-semibold tabular-nums')}>{i.barcode}</td>
                  <td className={cn(celda, 'tabular-nums')}>{i.recibida ? `RC${i.reference}` : formatOB(i.reference)}</td>
                  <td className={cn(celda, 'tabular-nums')}>
                    A{String(i.sequence).padStart(2, '0')}
                  </td>
                  <td className={cn(celda, 'tabular-nums')}>{i.turno ?? '—'}</td>
                  <td className={celda}>{i.cliente}</td>
                  <td className={cn(celda, 'tabular-nums')}>{i.date}</td>
                  <td className={cn(celda, 'text-xs uppercase')}>{i.canalAnimalTipo ?? '—'}</td>
                  <td className={cn(celda, 'text-xs font-semibold text-red-600')}>
                    {PIEZA_LABEL[i.pieza]}
                  </td>
                  <td className={celda}>{i.destino || '—'}</td>
                  <td className={celda}>{i.observaciones || '—'}</td>
                  <td className={celda}>{i.cavaOrigen}</td>
                  <td className={cn(celda, 'text-right font-semibold tabular-nums')}>
                    {num(i.pesoKg, 2)}
                  </td>
                  <td className={cn(celda, 'text-right font-semibold tabular-nums text-emerald-700')}>
                    {i.despachoKg !== null ? num(i.despachoKg, 2) : '—'}
                  </td>
                  <td className={cn(celda, 'text-right tabular-nums text-blue-700')}>
                    {i.despachoKg !== null ? num(i.pesoKg - i.despachoKg, 2) : '—'}
                  </td>
                  <td className={celda}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuitar(i.itemId);
                      }}
                      disabled={quitando}
                      title="Quitar de la orden (vuelve a su cava)"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-50"
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </FieldBox>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[0.7fr_1fr_1fr_1.3fr]">
        <FieldBox label="Piezas (Pza):">
          <div className="flex h-10 items-center justify-center text-3xl font-bold tabular-nums">
            {base.length}
          </div>
        </FieldBox>
        <FieldBox label="Canal Caliente (C.C. [kg]):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-red-600">
            {num(caliente)}
          </div>
        </FieldBox>
        <FieldBox label="Despacho (D.C. [kg]):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-emerald-700">
            {num(despacho)}
          </div>
        </FieldBox>
        <FieldBox label="Diferencia (kg) | (%):">
          <div className="flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap font-bold tabular-nums text-blue-700">
            <span className="text-2xl">{num(diferencia, 2)}</span>
            <span className="text-lg text-blue-400">|</span>
            <span className="text-xl">{num(pct, 2)}%</span>
          </div>
        </FieldBox>
      </div>
    </div>
  );
}

/** Merma de un grupo de piezas: solo cuenta las que ya tienen peso en frío. */
function resumen(items: ItemDespacho[]) {
  const pesadas = items.filter((i) => i.despachoKg !== null);
  const caliente = items.reduce((a, i) => a + i.pesoKg, 0);
  const calientePesadas = pesadas.reduce((a, i) => a + i.pesoKg, 0);
  const frio = pesadas.reduce((a, i) => a + (i.despachoKg ?? 0), 0);
  const merma = calientePesadas - frio;
  return {
    piezas: items.length,
    pesadas: pesadas.length,
    caliente,
    frio,
    merma,
    pct: calientePesadas > 0 ? (merma / calientePesadas) * 100 : 0,
  };
}

/** Pestaña TOTALES: cómo llegó cada canal (caliente) contra cómo salió (frío). */
export function TotalesTab({ items }: { items: ItemDespacho[] }) {
  if (!items.length) {
    return <Mensaje text="Esta orden aún no tiene canales. Escanéalas en REGISTRO." />;
  }
  const total = resumen(items);
  const porPieza = (Object.keys(PIEZA_LABEL) as ItemDespacho['pieza'][])
    .map((p) => ({ pieza: p, ...resumen(items.filter((i) => i.pieza === p)) }))
    .filter((g) => g.piezas > 0);
  const celda = 'whitespace-nowrap border border-border px-2 py-1.5';
  const faltan = total.piezas - total.pesadas;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <FieldBox label="Piezas:">
          <div className="flex h-10 items-center justify-center text-3xl font-bold tabular-nums">
            {total.piezas}
          </div>
        </FieldBox>
        <FieldBox label="Caliente (kg):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-red-600">
            {num(total.caliente)}
          </div>
        </FieldBox>
        <FieldBox label="Frío (kg):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-emerald-700">
            {num(total.frio)}
          </div>
        </FieldBox>
        <FieldBox label="Merma (kg):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-blue-700">
            {num(total.merma, 2)}
          </div>
        </FieldBox>
        <FieldBox label="Merma (%):">
          <div className="flex h-10 items-center justify-end text-3xl font-bold tabular-nums text-blue-700">
            {num(total.pct, 2)}
          </div>
        </FieldBox>
      </div>
      {faltan > 0 && (
        <p className="text-sm font-medium text-amber-700">
          {faltan} {faltan === 1 ? 'canal no tiene' : 'canales no tienen'} peso en frío: la merma
          solo cuenta las ya pesadas.
        </p>
      )}

      <div className="overflow-auto rounded-sm border-2 border-border">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-muted text-xs font-semibold uppercase">
            <tr>
              <th className={celda} rowSpan={2}>No.</th>
              <th className={celda} rowSpan={2}>Barcode</th>
              <th className={celda} rowSpan={2}>Animal</th>
              <th className={celda} rowSpan={2}>Pieza</th>
              <th className={celda} rowSpan={2}>Tipo</th>
              <th className={celda} rowSpan={2}>Cava origen</th>
              <th className={celda} colSpan={2}>Pesaje (kg)</th>
              <th className={celda} colSpan={2}>Merma</th>
            </tr>
            <tr>
              <th className={celda}>Caliente</th>
              <th className={celda}>Frío</th>
              <th className={celda}>kg</th>
              <th className={celda}>%</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => {
              const merma = i.despachoKg !== null ? i.pesoKg - i.despachoKg : null;
              return (
                <tr key={i.itemId} className="text-center tabular-nums">
                  <td className={celda}>{n + 1}</td>
                  <td className={cn(celda, 'font-semibold')}>{i.barcode}</td>
                  <td className={celda}>A{String(i.sequence).padStart(2, '0')}</td>
                  <td className={cn(celda, 'text-xs font-semibold text-red-600')}>
                    {PIEZA_LABEL[i.pieza]}
                  </td>
                  <td className={cn(celda, 'text-xs uppercase')}>{i.canalAnimalTipo ?? '—'}</td>
                  <td className={celda}>{i.cavaOrigen}</td>
                  <td className={cn(celda, 'text-right text-red-600')}>{num(i.pesoKg, 2)}</td>
                  <td className={cn(celda, 'text-right text-emerald-700')}>
                    {i.despachoKg !== null ? num(i.despachoKg, 2) : '—'}
                  </td>
                  <td className={cn(celda, 'text-right text-blue-700')}>
                    {merma !== null ? num(merma, 2) : '—'}
                  </td>
                  <td className={cn(celda, 'text-right text-blue-700')}>
                    {merma !== null && i.pesoKg > 0 ? num((merma / i.pesoKg) * 100, 2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/60 font-semibold tabular-nums">
            {porPieza.map((g) => (
              <tr key={g.pieza} className="text-center">
                <td className={cn(celda, 'text-left')} colSpan={6}>
                  Subtotal {PIEZA_LABEL[g.pieza]} ({g.piezas})
                </td>
                <td className={cn(celda, 'text-right text-red-600')}>{num(g.caliente, 2)}</td>
                <td className={cn(celda, 'text-right text-emerald-700')}>{num(g.frio, 2)}</td>
                <td className={cn(celda, 'text-right text-blue-700')}>{num(g.merma, 2)}</td>
                <td className={cn(celda, 'text-right text-blue-700')}>{num(g.pct, 2)}</td>
              </tr>
            ))}
            <tr className="text-center text-base">
              <td className={cn(celda, 'text-left')} colSpan={6}>
                TOTAL ({total.piezas} piezas · promedio caliente{' '}
                {num(total.caliente / total.piezas, 1)} kg)
              </td>
              <td className={cn(celda, 'text-right text-red-600')}>{num(total.caliente, 2)}</td>
              <td className={cn(celda, 'text-right text-emerald-700')}>{num(total.frio, 2)}</td>
              <td className={cn(celda, 'text-right text-blue-700')}>{num(total.merma, 2)}</td>
              <td className={cn(celda, 'text-right text-blue-700')}>{num(total.pct, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function CanalFriaPage() {
  const [tab, setTab] = useState<VistaFria>('ordenes');
  const [orden, setOrden] = useState<OrdenDespacho | null>(null);
  const ordenes = useOrdenesDespachoActivas();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState('');
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const itemsQuery = useItemsDespacho(orden?.id ?? null);
  const items = itemsQuery.data ?? [];
  const agregar = useAgregarItemDespacho(orden?.id ?? null);
  const quitar = useQuitarItemDespacho(orden?.id ?? null);
  const pesar = usePesarItemDespacho(orden?.id ?? null);
  const cerrar = useCerrarOrdenDespacho();
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = items.find((i) => i.itemId === seleccionadoId) ?? null;
  const [ultimo, setUltimo] = useState<ItemDespacho | null>(null);
  const buscando = agregar.isPending;
  const pesoKg = Number(peso.replace(',', '.'));
  const hayPeso = Number.isFinite(pesoKg) && pesoKg > 0;
  const sinPesar = items.filter((i) => i.despachoKg === null).length;
  const totales = resumen(items);

  // Aviso flotante (éxito o error); uno nuevo reinicia el temporizador.
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

  /** Lee la báscula y deja listo el código de barras para pistolear. */
  async function tomarPeso() {
    await leerBascula();
    if (!seleccionado) barcodeRef.current?.focus();
  }

  /** Corrige el peso en frío de la fila seleccionada y pasa a la siguiente sin pesar. */
  async function guardarPeso() {
    if (!seleccionado || pesar.isPending) return;
    if (!hayPeso) {
      flash('error', 'Toma un peso mayor a 0 antes de guardar la corrección.');
      return;
    }
    try {
      await pesar.mutateAsync({ itemId: seleccionado.itemId, despachoKg: pesoKg });
      flash('success', `Peso del gancho ${seleccionado.turno ?? seleccionado.sequence} corregido: ${num(pesoKg)} kg.`);
      const siguiente = items.find(
        (i) => i.itemId !== seleccionado.itemId && i.despachoKg === null,
      );
      seleccionar(siguiente ?? null);
    } catch (err) {
      flash('error', mensajeApi(err, 'No se pudo guardar el peso.'));
    }
  }

  /** Pistolea la canal: lee la báscula, muestra el peso y la inserta en la orden con ese peso en frío. */
  async function escanear() {
    const codigo = barcode.trim();
    if (!codigo || !orden || buscando || leyendo) return;
    // Si la báscula no responde, se usa el peso digitado a mano (si hay).
    const leido = await leerBascula();
    const kg = leido != null && leido > 0 ? leido : hayPeso ? pesoKg : null;
    if (kg == null) {
      flash('error', 'No se pudo leer un peso de la báscula. Revisa la báscula o digita el peso y vuelve a pistolear.');
      barcodeRef.current?.focus();
      return;
    }
    try {
      const item = await agregar.mutateAsync({ barcode: codigo, despachoKg: kg });
      setBarcode('');
      setSeleccionadoId(null);
      setUltimo(item);
      flash('success', `Gancho ${item.turno ?? item.sequence} (${PIEZA_LABEL[item.pieza]}) agregado: ${num(item.pesoKg)} → ${num(kg)} kg.`);
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

  function elegirOrden(o: OrdenDespacho | null) {
    setOrden(o);
    setSeleccionadoId(null);
    setUltimo(null);
  }

  function cerrarOrden() {
    if (!orden) return;
    const od = formatOD(orden.odNumber);
    cerrar.mutate(orden.id, {
      onSuccess: () => {
        setConfirmarCierre(false);
        elegirOrden(null);
        setPeso('0.0');
        setTab('ordenes');
        flash('success', `Orden ${od} cerrada.`);
      },
      onError: (err) => {
        setConfirmarCierre(false);
        flash('error', mensajeApi(err, 'No se pudo cerrar la orden.'));
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Avisos flotantes: no empujan el contenido */}
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

      {tab === 'ordenes' ? (
        <OrdenesFria
          loading={ordenes.isLoading}
          ordenes={ordenes.data ?? []}
          selectedId={orden?.id ?? null}
          refrescando={ordenes.isFetching}
          onRefresh={() => void ordenes.refetch()}
          onSelect={(o) => {
            elegirOrden(o);
            setTab('despacho');
          }}
        />
      ) : (
        <>
          {/* Encabezado de la orden abierta */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setTab('ordenes')}>
              <ArrowLeft className="size-5" />
              Órdenes
            </Button>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">
              {orden ? formatOD(orden.odNumber) : '—'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold uppercase">{orden?.cliente.concepto ?? '—'}</div>
              <div className="text-sm text-muted-foreground">
                <b className="tabular-nums text-foreground">{totales.piezas}</b>{' '}
                {totales.piezas === 1 ? 'canal' : 'canales'} · <b className="tabular-nums text-foreground">{num(totales.frio)}</b> kg frío
                {totales.pesadas > 0 && (
                  <>
                    {' · Merma '}
                    <b className={cn('tabular-nums', totales.pct > MERMA_MAX ? 'text-amber-700' : 'text-foreground')}>
                      {num(totales.pct, 2)} %
                    </b>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {(['despacho', 'totales'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex h-10 items-center rounded-md px-4 text-sm font-semibold transition-colors',
                    tab === t ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
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

          {tab === 'despacho' ? (
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
              <TablaDespacho
                items={items}
                loading={itemsQuery.isLoading}
                seleccionadoId={seleccionadoId}
                onSeleccionar={(i) => seleccionar(seleccionadoId === i.itemId ? null : i)}
              />
              <PanelFria
                orden={!!orden}
                seleccionado={seleccionado}
                ultimo={ultimo}
                peso={peso}
                setPeso={setPeso}
                hayPeso={hayPeso}
                leyendo={leyendo}
                onLeer={() => void tomarPeso()}
                barcode={barcode}
                setBarcode={setBarcode}
                barcodeRef={barcodeRef}
                buscando={buscando || leyendo}
                onEscanear={() => void escanear()}
                guardando={pesar.isPending}
                onGuardarCorreccion={() => void guardarPeso()}
                quitando={quitar.isPending}
                onQuitar={() => seleccionado && quitarItem(seleccionado)}
                onCancelar={() => seleccionar(null)}
              />
            </div>
          ) : (
            <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
              <TotalesFria items={items} />
            </div>
          )}
        </>
      )}

      {confirmarCierre && orden && (
        <Dialog open onClose={() => setConfirmarCierre(false)} title="Cerrar orden" className="max-w-lg">
          <div className="space-y-4">
            <p className="text-base">
              ¿Está seguro de cerrar la orden con consecutivo <b>{formatOD(orden.odNumber)}</b>?
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Las {items.length} canales ({num(totales.frio)} kg en frío) quedan en proceso y ya no se
              podrán agregar ni quitar canales. La orden de producción y el rotulado siguen
              funcionando con esta orden.
              {sinPesar > 0 &&
                ` Ojo: ${sinPesar} ${sinPesar === 1 ? 'canal no tiene' : 'canales no tienen'} peso en frío.`}
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

type VistaFria = 'ordenes' | 'despacho' | 'totales';

// Merma de oreo por encima de este % se resalta.
const MERMA_MAX = 3;

const VISTA_KEY = 'canalFria.vistaOrdenes';

function mermaDe(i: ItemDespacho) {
  if (i.despachoKg === null || i.pesoKg <= 0) return null;
  const kg = i.pesoKg - i.despachoKg;
  return { kg, pct: (kg / i.pesoKg) * 100 };
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function OrdenesFria({
  loading,
  ordenes,
  selectedId,
  refrescando,
  onRefresh,
  onSelect,
}: {
  loading: boolean;
  ordenes: OrdenDespacho[];
  selectedId: string | null;
  refrescando: boolean;
  onRefresh: () => void;
  onSelect: (o: OrdenDespacho) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'lista' | 'tarjetas'>(() =>
    localStorage.getItem(VISTA_KEY) === 'tarjetas' ? 'tarjetas' : 'lista',
  );
  const [filtro, setFiltro] = useState<'proceso' | 'pendiente' | null>(null);
  function cambiarVista(v: 'lista' | 'tarjetas') {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }
  const estado = (o: OrdenDespacho) => ((o.piezas ?? 0) > 0 ? 'proceso' : 'pendiente');
  const q = busqueda.trim().toUpperCase();
  const buscadas = q
    ? ordenes.filter((o) => [formatOD(o.odNumber), o.cliente.concepto, o.cliente.nit ?? ''].join(' ').toUpperCase().includes(q))
    : ordenes;
  const visibles = buscadas
    .filter((o) => !filtro || estado(o) === filtro)
    .sort((a, b) => (estado(a) === estado(b) ? b.odNumber - a.odNumber : estado(a) === 'proceso' ? -1 : 1));
  const filtros = [
    { key: null, texto: 'Todas', n: buscadas.length },
    { key: 'proceso' as const, texto: 'En proceso', n: buscadas.filter((o) => estado(o) === 'proceso').length },
    { key: 'pendiente' as const, texto: 'Sin iniciar', n: buscadas.filter((o) => estado(o) === 'pendiente').length },
  ];
  const merma = (o: OrdenDespacho) =>
    o.mermaPct != null ? (
      <span className={cn(o.mermaPct > MERMA_MAX && 'font-semibold text-amber-700')}>{num(o.mermaPct, 2)} %</span>
    ) : (
      '—'
    );

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar orden o cliente"
            className="h-11 pl-10 text-base"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {filtros.map((f) => (
            <button
              key={f.key ?? 'todas'}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                filtro === f.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.texto}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filtro === f.key ? 'bg-primary text-primary-foreground' : 'bg-background')}>
                {f.n}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => cambiarVista('lista')}
            title="Ver en lista"
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'lista' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <List className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => cambiarVista('tarjetas')}
            title="Ver en tarjetas"
            className={cn('flex size-9 items-center justify-center rounded-md', vista === 'tarjetas' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <LayoutGrid className="size-5" />
          </button>
        </div>
        <Button variant="outline" className="size-11 p-0" onClick={onRefresh} disabled={refrescando} title="Actualizar">
          <RefreshCw className={cn('size-5', refrescando && 'animate-spin')} />
        </Button>
      </div>

      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        ) : !visibles.length ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Inbox className="size-8" />
            {q || filtro
              ? 'Ninguna orden coincide con la búsqueda o el filtro.'
              : 'No hay órdenes de despacho activas. Créalas en Administrativo → Orden de Despacho.'}
          </div>
        ) : vista === 'lista' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-4">
                  <th className="w-28">Orden</th>
                  <th>Cliente</th>
                  <th>Proceso</th>
                  <th className="text-right">Canales</th>
                  <th className="text-right">Kg frío</th>
                  <th className="text-right">Merma</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => onSelect(o)}
                    className={cn('h-16 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:px-4', o.id === selectedId && 'bg-primary/5')}
                  >
                    <td className="relative">
                      <span className={cn('absolute inset-y-0 left-0 w-1', estado(o) === 'proceso' ? 'bg-amber-500' : 'bg-transparent')} />
                      <span className="text-lg font-bold tabular-nums text-primary">{formatOD(o.odNumber)}</span>
                    </td>
                    <td className="max-w-80">
                      <div className="truncate text-base font-semibold uppercase">{o.cliente.concepto}</div>
                      <div className="text-xs text-muted-foreground">{o.cliente.nit ? `NIT ${o.cliente.nit} · ` : ''}{TIPO_ORDEN_DESPACHO}</div>
                    </td>
                    <td className="tabular-nums">{formatFechaDia(o.processDate.slice(0, 10))}</td>
                    <td className="text-right text-base font-semibold tabular-nums">{o.piezas ?? 0}</td>
                    <td className="text-right text-base font-semibold tabular-nums">{num(o.frioKg ?? 0)}</td>
                    <td className="text-right tabular-nums">{merma(o)}</td>
                    <td className="text-muted-foreground">
                      <ChevronRight className="size-5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {visibles.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => onSelect(o)}
                  className={cn(
                    'group flex w-full flex-col gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md',
                    o.id === selectedId ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">
                      {formatOD(o.odNumber)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold uppercase">{o.cliente.concepto}</div>
                      <div className="text-sm text-muted-foreground">{TIPO_ORDEN_DESPACHO}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/40 px-4 py-3">
                    <Dato label="Canales">{o.piezas ?? 0}</Dato>
                    <Dato label="Kg frío">{num(o.frioKg ?? 0)}</Dato>
                    <Dato label="Merma">{merma(o)}</Dato>
                  </div>
                  <span className="flex items-center gap-1 self-end rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-primary-foreground group-hover:bg-primary/90">
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

export function TablaDespacho({
  items,
  loading,
  seleccionadoId,
  onSeleccionar,
  pesoLabel = 'Frío',
}: {
  items: ItemDespacho[];
  loading: boolean;
  seleccionadoId: string | null;
  onSeleccionar: (i: ItemDespacho) => void;
  pesoLabel?: string;
}) {
  // El más reciente arriba.
  const filas = [...items].sort((a, b) => b.despachadoAt.localeCompare(a.despachadoAt));
  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Canales despachadas <span className="tabular-nums text-foreground">({items.length})</span>
        </h3>
        {items.length > 0 && <span className="text-xs text-muted-foreground">Tocá una fila para corregir el peso o quitarla</span>}
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : !items.length ? (
        <div className="m-4 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
          <Inbox className="size-7" />
          Toma el peso y pistolea la primera canal.
        </div>
      ) : (
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:h-10 [&>th]:px-4">
                <th>Gancho</th>
                <th>Código de barras</th>
                <th>Pieza</th>
                <th>Tipo</th>
                <th>Cava origen</th>
                <th className="text-right">Caliente</th>
                <th className="text-right">{pesoLabel}</th>
                <th className="text-right">Merma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((i) => {
                const m = mermaDe(i);
                const sel = i.itemId === seleccionadoId;
                return (
                  <tr
                    key={i.itemId}
                    onClick={() => onSeleccionar(i)}
                    title={[i.destino && `Destino ${i.destino}`, i.observaciones].filter(Boolean).join(' · ') || undefined}
                    className={cn(
                      'h-12 cursor-pointer transition-colors [&>td]:px-4',
                      sel ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40',
                    )}
                  >
                    <td className="text-base font-bold tabular-nums">{i.turno ?? i.sequence}</td>
                    <td className={cn('font-mono text-sm font-semibold tabular-nums', !sel && 'text-foreground/80')}>{i.barcode}</td>
                    <td className="font-semibold">{PIEZA_LABEL[i.pieza]}</td>
                    <td className="uppercase">{i.canalAnimalTipo ?? '—'}</td>
                    <td className="uppercase">{i.cavaOrigen}</td>
                    <td className="text-right tabular-nums">{num(i.pesoKg)}</td>
                    <td className="text-right text-base font-semibold tabular-nums">
                      {i.despachoKg !== null ? num(i.despachoKg) : <span className={sel ? '' : 'text-amber-700'}>Sin peso</span>}
                    </td>
                    <td
                      className={cn(
                        'text-right tabular-nums',
                        !sel && m && m.pct > MERMA_MAX ? 'font-semibold text-amber-700' : !sel && 'text-muted-foreground',
                      )}
                    >
                      {m ? `${num(m.pct, 1)} %` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PanelFria({
  orden,
  seleccionado,
  ultimo,
  peso,
  setPeso,
  hayPeso,
  leyendo,
  onLeer,
  barcode,
  setBarcode,
  barcodeRef,
  buscando,
  onEscanear,
  guardando,
  onGuardarCorreccion,
  quitando,
  onQuitar,
  onCancelar,
  pesoLabel = 'Peso en frío',
  ayuda = 'Al pistolear se lee la báscula sola y la canal se agrega con ese peso.',
}: {
  orden: boolean;
  seleccionado: ItemDespacho | null;
  ultimo: ItemDespacho | null;
  peso: string;
  setPeso: (v: string) => void;
  hayPeso: boolean;
  leyendo: boolean;
  onLeer: () => void;
  barcode: string;
  setBarcode: (v: string) => void;
  barcodeRef: React.RefObject<HTMLInputElement | null>;
  buscando: boolean;
  onEscanear: () => void;
  guardando: boolean;
  onGuardarCorreccion: () => void;
  quitando: boolean;
  onQuitar: () => void;
  onCancelar: () => void;
  pesoLabel?: string;
  ayuda?: string;
}) {
  const campoPeso = (
    <div
      className={cn(
        'flex items-baseline justify-center gap-2 rounded-xl border-2 bg-muted/30 px-4 py-3 transition-colors focus-within:border-primary',
        hayPeso ? 'border-primary/40' : 'border-border',
      )}
    >
      <input
        value={peso}
        onChange={(e) => setPeso(soloDecimal(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (seleccionado) onGuardarCorreccion();
          else barcodeRef.current?.focus();
        }}
        inputMode="decimal"
        disabled={!orden}
        aria-label={`${pesoLabel} (kg)`}
        className="w-full min-w-0 bg-transparent text-right text-5xl font-bold tabular-nums outline-none"
      />
      <span className="text-xl font-semibold text-muted-foreground">kg</span>
    </div>
  );

  if (seleccionado) {
    const m = mermaDe(seleccionado);
    return (
      <div className="flex min-h-0 flex-col gap-4 overflow-auto rounded-xl border-2 border-primary/40 bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Corregir peso</div>
            <div className="text-4xl font-bold tabular-nums leading-tight">Gancho {seleccionado.turno ?? seleccionado.sequence}</div>
            <div className="text-sm text-muted-foreground">
              {PIEZA_LABEL[seleccionado.pieza]} · {seleccionado.canalAnimalTipo?.toUpperCase() ?? '—'} · {seleccionado.cavaOrigen}
            </div>
          </div>
          <Button variant="ghost" className="size-10 p-0" onClick={onCancelar} title="Cancelar">
            <X className="size-5" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 px-4 py-3">
          <Dato label="Caliente">{num(seleccionado.pesoKg)}</Dato>
          <Dato label="Peso actual">{seleccionado.despachoKg !== null ? num(seleccionado.despachoKg) : '—'}</Dato>
          <Dato label="Merma">{m ? `${num(m.pct, 1)} %` : '—'}</Dato>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nuevo {pesoLabel.toLowerCase()}</span>
          {campoPeso}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-14 text-base" onClick={onLeer} disabled={leyendo}>
            {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
            Leer báscula
          </Button>
          <Button className="h-14 text-base" onClick={onGuardarCorreccion} disabled={guardando}>
            {guardando ? <LoaderCircle className="size-5 animate-spin" /> : <Save className="size-5" />}
            Guardar corrección
          </Button>
        </div>
        <Button
          variant="outline"
          className="mt-auto h-12 border-red-200 text-base text-red-700 hover:bg-red-50"
          onClick={onQuitar}
          disabled={quitando}
        >
          {quitando ? <LoaderCircle className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
          Quitar de la orden (vuelve a {seleccionado.cavaOrigen})
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pistolear la canal</span>
        <div className="relative flex items-center rounded-xl border-2 border-primary/40 bg-background px-3 transition-colors focus-within:border-primary">
          <ScanBarcode className="size-6 shrink-0 text-muted-foreground" />
          <input
            ref={barcodeRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEscanear();
            }}
            disabled={!orden}
            readOnly={buscando}
            autoFocus
            placeholder="Pistolea la canal…"
            className="h-14 w-full min-w-0 bg-transparent px-3 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
          {buscando ? (
            <LoaderCircle className="size-5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            barcode && (
              <button type="button" onClick={() => setBarcode('')} title="Limpiar código" className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            )
          )}
        </div>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {pesoLabel}
          {leyendo && (
            <span className="flex items-center gap-1 normal-case text-primary">
              <LoaderCircle className="size-3.5 animate-spin" /> leyendo báscula…
            </span>
          )}
        </span>
        {campoPeso}
        <Button variant="outline" className="h-12 text-base" onClick={onLeer} disabled={leyendo || !orden}>
          {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
          Leer báscula
        </Button>
      </div>

      <div className="mt-auto rounded-lg bg-muted/50 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Última canal</div>
        {ultimo ? (
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold">
              Gancho {ultimo.turno ?? ultimo.sequence} · {PIEZA_LABEL[ultimo.pieza]}
            </span>
            <span className="tabular-nums text-sm">
              {num(ultimo.pesoKg)} → <b>{ultimo.despachoKg !== null ? num(ultimo.despachoKg) : '—'}</b> kg
            </span>
          </div>
        ) : (
          <div className="mt-1 text-sm text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
}

export function TotalesFria({ items, pesoLabel = 'Frío' }: { items: ItemDespacho[]; pesoLabel?: string }) {
  if (!items.length) {
    return <Mensaje text="Esta orden aún no tiene canales. Pistoléalas en Despacho." />;
  }
  const total = resumen(items);
  const faltan = total.piezas - total.pesadas;
  const grupos = (clave: (i: ItemDespacho) => string) => {
    const m = new Map<string, ItemDespacho[]>();
    for (const i of items) {
      const k = clave(i);
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m].map(([k, v]) => ({ k, ...resumen(v) }));
  };
  const porTipo = grupos((i) => (i.canalAnimalTipo ?? 'Sin tipo').toUpperCase());
  const porCava = grupos((i) => i.cavaOrigen.toUpperCase());
  const filas = [...items].sort((a, b) => (a.turno ?? a.sequence) - (b.turno ?? b.sequence));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 px-4 py-3 md:grid-cols-5">
        <Dato label="Canales">{total.piezas}</Dato>
        <Dato label="Caliente (kg)">{num(total.caliente)}</Dato>
        <Dato label={`${pesoLabel} (kg)`}>{num(total.frio)}</Dato>
        <Dato label="Merma (kg)">{num(total.merma, 2)}</Dato>
        <Dato label="Merma (%)">
          <span className={cn(total.pct > MERMA_MAX && 'text-amber-700')}>{num(total.pct, 2)} %</span>
        </Dato>
      </div>
      {faltan > 0 && (
        <p className="text-sm font-medium text-amber-700">
          {faltan} {faltan === 1 ? 'canal no tiene' : 'canales no tienen'} peso en frío: la merma solo cuenta las ya pesadas.
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        {[
          { titulo: 'Por tipo', g: porTipo },
          { titulo: 'Por cava de origen', g: porCava },
        ].map(({ titulo, g }) => (
          <div key={titulo} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
            <div className="flex flex-wrap gap-1.5">
              {g.map((x) => (
                <span key={x.k} className="rounded-md border border-border bg-background px-2.5 py-1 text-sm">
                  <b className="tabular-nums">{x.piezas}</b> {x.k} · {num(x.frio)} kg
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="[&>th]:h-10 [&>th]:px-4">
              <th>Gancho</th>
              <th>Código de barras</th>
              <th>Pieza</th>
              <th>Tipo</th>
              <th>Cava origen</th>
              <th className="text-right">Caliente</th>
              <th className="text-right">{pesoLabel}</th>
              <th className="text-right">Merma kg</th>
              <th className="text-right">Merma %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((i) => {
              const m = mermaDe(i);
              return (
                <tr key={i.itemId} className="h-11 [&>td]:px-4">
                  <td className="font-bold tabular-nums">{i.turno ?? i.sequence}</td>
                  <td className="tabular-nums">{i.barcode}</td>
                  <td className="font-semibold">{PIEZA_LABEL[i.pieza]}</td>
                  <td className="uppercase">{i.canalAnimalTipo ?? '—'}</td>
                  <td className="uppercase">{i.cavaOrigen}</td>
                  <td className="text-right tabular-nums">{num(i.pesoKg, 2)}</td>
                  <td className="text-right font-semibold tabular-nums">{i.despachoKg !== null ? num(i.despachoKg, 2) : '—'}</td>
                  <td className="text-right tabular-nums">{m ? num(m.kg, 2) : '—'}</td>
                  <td className={cn('text-right tabular-nums', m && m.pct > MERMA_MAX && 'font-semibold text-amber-700')}>
                    {m ? num(m.pct, 2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/60 font-semibold tabular-nums">
            <tr className="h-11 [&>td]:px-4">
              <td colSpan={5}>TOTAL ({total.piezas} canales)</td>
              <td className="text-right">{num(total.caliente, 2)}</td>
              <td className="text-right">{num(total.frio, 2)}</td>
              <td className="text-right">{num(total.merma, 2)}</td>
              <td className={cn('text-right', total.pct > MERMA_MAX && 'text-amber-700')}>{num(total.pct, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

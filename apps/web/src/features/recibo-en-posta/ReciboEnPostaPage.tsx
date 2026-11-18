import { useMemo, useRef, useState } from 'react';
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
  Minus,
  PackageSearch,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Snowflake,
  Tag,
  Thermometer,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SupervisorPinDialog } from '@/components/ui/SupervisorPinDialog';
import { printRaw } from '@/lib/device';
import { cn, formatFechaDia, plantToday, soloDecimal } from '@/lib/utils';
import { useDevice } from '../device/device-context';
import { useProducts, type Product } from '../products/api';
import { SIN_IMPRESORA, useImpresoraEtiquetas } from '../rotulado/ui';
import {
  CONSERVACION_LABEL,
  formatPiezaPosta,
  formatRP,
  registrarReimpresionPosta,
  useCerrarPostaReceipt,
  destinoPostaReceipt,
  useCreatePostaReceiptItem,
  useDeletePostaReceiptItem,
  usePostaReceiptItems,
  usePostaReceipts,
  type Conservacion,
  type PostaReceipt,
  type PostaReceiptItem,
} from '../recibo-posta/api';
import { generarRotuloPostaZpl } from '../recibo-posta/rotulo-posta-zpl';
import { CierreRecibo } from '../canal-recibo/CierreRecibo';

type Vista = 'ordenes' | 'recibo' | 'totales';

const TARAS_FRECUENTES = [0.9, 1.0, 1.45, 1.8, 2.05, 2.35];
const VISTA_KEY = 'reciboPosta.vistaOrdenes';

const kg = (n: number, dec = 1) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

/** 'YYYY-MM-DD…' → 'DD/MM/YYYY'. */
const fechaCorta = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}

function Contador({ value, onChange, min }: { value: number; onChange: (n: number) => void; min: number }) {
  return (
    <div className="flex h-11 items-stretch overflow-hidden rounded-lg border border-input bg-background">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="flex w-10 items-center justify-center hover:bg-muted" aria-label="Restar">
        <Minus className="size-4" />
      </button>
      <input
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value.replace(/\D/g, '').slice(0, 4)) || 0))}
        inputMode="numeric"
        className="w-full min-w-0 bg-transparent text-center text-lg font-bold tabular-nums outline-none"
      />
      <button type="button" onClick={() => onChange(value + 1)} className="flex w-10 items-center justify-center hover:bg-muted" aria-label="Sumar">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function ReciboEnPostaPage() {
  const [vista, setVista] = useState<Vista>('ordenes');
  const [orden, setOrden] = useState<PostaReceipt | null>(null);
  const ordenes = usePostaReceipts({ page: 1, pageSize: 100, status: 'activo' });
  const itemsQuery = usePostaReceiptItems(orden?.id ?? null);
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const crear = useCreatePostaReceiptItem(orden?.id ?? null);
  const borrar = useDeletePostaReceiptItem(orden?.id ?? null);
  const cerrar = useCerrarPostaReceipt();
  const impresora = useImpresoraEtiquetas();
  const equipo = useDevice();
  const keyboard = useKeyboard();

  const [busqueda, setBusqueda] = useState('');
  const productos = useProducts(busqueda);
  const [producto, setProducto] = useState<Product | null>(null);
  const [lote, setLote] = useState('');
  const [conservacion, setConservacion] = useState<Conservacion | null>(null);
  const [sacrificio, setSacrificio] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [dias, setDias] = useState('');
  const [taraUnit, setTaraUnit] = useState('0.00');
  const [empaques, setEmpaques] = useState(1);
  const [piezas, setPiezas] = useState(1);
  const { peso: bruto, setPeso: setBruto, leyendo, error: errorBascula, leerBascula } = useBascula('0.00');
  const [teclado, setTeclado] = useState<'bruto' | 'tara' | null>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [imprimirAlRegistrar, setImprimirAlRegistrar] = useState(true);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  const [pidiendoBorrado, setPidiendoBorrado] = useState<PostaReceiptItem | null>(null);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  function flash(type: 'success' | 'error', text: string) {
    setNotice({ type, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }

  const taraKg = Math.round((Number(taraUnit.replace(',', '.')) || 0) * empaques * 100) / 100;
  const brutoKg = Number(bruto.replace(',', '.')) || 0;
  const netoKg = Math.round((brutoKg - taraKg) * 100) / 100;
  const totalNeto = items.reduce((s, i) => s + Number(i.netoKg), 0);
  const ultimo = items.length ? items.reduce((a, b) => (a.codigo > b.codigo ? a : b)) : null;
  const siguiente = (ultimo?.codigo ?? 0) + 1;
  const seleccionado = items.find((i) => i.id === seleccionadoId) ?? null;
  const recibidoPorProducto = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.product.id, (m.get(i.product.id) ?? 0) + Number(i.netoKg));
    return m;
  }, [items]);

  function elegirOrden(o: PostaReceipt) {
    if (o.id !== orden?.id) {
      setProducto(null);
      setLote('');
      setConservacion(null);
      setSacrificio('');
      setVencimiento('');
      setDias('');
      setSeleccionadoId(null);
    }
    setOrden(o);
    setVista('recibo');
  }

  function cambiarDias(valor: string) {
    const d = valor.replace(/\D/g, '').slice(0, 3);
    setDias(d);
    if (d) setVencimiento(sumarDias(sacrificio || plantToday(), Number(d)));
  }

  async function imprimir(item: PostaReceiptItem, reimpresion: boolean) {
    if (!orden) return false;
    if (!impresora) {
      flash('error', SIN_IMPRESORA);
      return false;
    }
    setImprimiendo(true);
    try {
      const r = await printRaw(
        impresora,
        generarRotuloPostaZpl({
          receiptNumber: orden.receiptNumber,
          codigo: item.codigo,
          cliente: orden.cliente.concepto,
          productoCodigo: item.product.codigo,
          producto: item.product.nombre,
          netoKg: Number(item.netoKg),
          piezas: item.piezas,
          lote: item.lote ?? '',
          conservacion: item.conservacion ?? 'refrigerado',
          recibo: new Date(item.createdAt).toLocaleDateString('es-CO'),
          sacrificio: fechaCorta(item.fechaSacrificio) || undefined,
          vencimiento: fechaCorta(item.fechaVencimiento) || undefined,
        }),
      );
      if (!r.ok) {
        flash('error', r.error || 'No se pudo imprimir el rótulo.');
        return false;
      }
      if (reimpresion) {
        registrarReimpresionPosta(item.id, equipo.hostname);
        flash('success', `Rótulo ${formatPiezaPosta(orden.receiptNumber, item.codigo)} reimpreso.`);
      }
      return true;
    } catch {
      flash('error', 'No se pudo enviar el rótulo a la impresora.');
      return false;
    } finally {
      setImprimiendo(false);
    }
  }

  function registrar() {
    if (!orden || crear.isPending) return;
    const faltan: string[] = [];
    if (!producto) faltan.push('el producto');
    if (!lote.trim()) faltan.push('el lote');
    if (!conservacion) faltan.push('la conservación');
    if (brutoKg <= 0) faltan.push('el peso bruto');
    if (faltan.length) {
      const lista = faltan.length > 1 ? `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}` : faltan[0];
      flash('error', `Falta ${lista}.`);
      return;
    }
    if (netoKg <= 0) {
      flash('error', 'El peso bruto debe ser mayor que la tara.');
      return;
    }
    if (sacrificio && vencimiento && vencimiento < sacrificio) {
      flash('error', 'El vencimiento no puede ser anterior al sacrificio.');
      return;
    }
    if (imprimirAlRegistrar && !impresora) {
      flash('error', `${SIN_IMPRESORA} Desmarca "Imprimir rótulo" para registrar sin imprimir.`);
      return;
    }
    crear.mutate(
      {
        productId: producto!.id,
        taraKg,
        brutoKg,
        piezas,
        empaques,
        lote: lote.trim(),
        conservacion: conservacion!,
        fechaSacrificio: sacrificio || undefined,
        fechaVencimiento: vencimiento || undefined,
      },
      {
        onSuccess: async (item) => {
          const pieza = formatPiezaPosta(orden.receiptNumber, item.codigo);
          // Producto, lote, conservación, fechas y tara se conservan para la siguiente pesada.
          setBruto('0.00');
          setSeleccionadoId(null);
          const impreso = imprimirAlRegistrar ? await imprimir(item, false) : true;
          flash(
            impreso ? 'success' : 'error',
            impreso
              ? `${pieza} · ${item.product.nombre} · neto ${kg(Number(item.netoKg), 2)} kg.`
              : `${pieza} registrado, pero el rótulo no se imprimió. Reimprímelo desde la tabla.`,
          );
        },
        onError: (err) => flash('error', mensajeApi(err, 'No se pudo registrar.')),
      },
    );
  }

  if (vista === 'ordenes') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Avisos notice={notice} onClose={() => setNotice(null)} />
        <OrdenesPosta
          loading={ordenes.isLoading}
          ordenes={ordenes.data?.data ?? []}
          seleccionadaId={orden?.id ?? null}
          refrescando={ordenes.isFetching}
          onRefresh={() => void ordenes.refetch()}
          onSelect={elegirOrden}
        />
      </div>
    );
  }

  if (!orden) return null;

  const listaProductos = productos.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Avisos notice={notice} onClose={() => setNotice(null)} />

      {/* Encabezado */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <Button variant="outline" className="h-12 px-4 text-base" onClick={() => setVista('ordenes')}>
          <ArrowLeft className="size-5" />
          Órdenes
        </Button>
        <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary">
          {formatRP(orden.receiptNumber)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold uppercase">
            {orden.cliente.concepto}
            {orden.cliente.nit && <span className="text-muted-foreground"> · NIT {orden.cliente.nit}</span>}
          </div>
          <div className="text-sm text-muted-foreground">
            <b className="tabular-nums text-foreground">{items.length}</b> {items.length === 1 ? 'registro' : 'registros'} ·{' '}
            <b className="tabular-nums text-foreground">{kg(totalNeto)}</b> kg netos · Proceso{' '}
            {formatFechaDia(orden.processDate.slice(0, 10))}
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(['recibo', 'totales'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={cn(
                'flex h-10 items-center rounded-md px-4 text-sm font-semibold transition-colors',
                vista === v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'recibo' ? 'Recibo' : 'Totales'}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="h-12 px-5 text-base"
          disabled={!items.length || cerrar.isPending}
          onClick={() => setPidiendoCierre(true)}
          title={items.length ? 'Cerrar la orden (PIN de supervisor)' : 'La orden no tiene registros'}
        >
          <Lock className="size-5" />
          Cerrar orden
        </Button>
      </div>

      {vista === 'recibo' ? (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[17rem_minmax(0,1fr)_360px]">
          {/* Productos */}
          <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm">
            <div className="p-3">
              <KeyboardField>
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onDoubleClick={keyboard.open}
                  placeholder="Buscar producto"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-primary"
                />
              </KeyboardField>
            </div>
            <div className="scrollbar-app min-h-0 flex-1 overflow-auto px-2 pb-2">
              {productos.isLoading ? (
                <div className="flex justify-center p-6 text-muted-foreground">
                  <LoaderCircle className="size-5 animate-spin" />
                </div>
              ) : !listaProductos.length ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <PackageSearch className="size-6 opacity-60" />
                  {busqueda ? `Sin productos con «${busqueda}»` : 'Sin productos en el catálogo'}
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {listaProductos.map((p) => {
                    const sel = producto?.id === p.id;
                    const recibido = recibidoPorProducto.get(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setProducto(p)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
                            sel ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                          )}
                        >
                          <span className={cn('w-12 shrink-0 text-xs font-bold tabular-nums', sel ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                            {p.codigo}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold uppercase">{p.nombre}</span>
                          {recibido !== undefined && (
                            <span className={cn('shrink-0 text-xs tabular-nums', sel ? 'text-primary-foreground/80' : 'text-primary')}>
                              {kg(recibido)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Datos del producto y recibidos */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="shrink-0 space-y-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="flex items-baseline gap-3">
                <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-bold tabular-nums text-muted-foreground">
                  {producto?.codigo ?? '—'}
                </span>
                <span className={cn('truncate text-xl font-bold uppercase', !producto && 'text-muted-foreground')}>
                  {producto?.nombre ?? 'Elegí un producto de la lista'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-[1fr_auto]">
                <label className="flex flex-col gap-1">
                  <Etiqueta>Lote</Etiqueta>
                  <KeyboardField>
                    <input
                      value={lote}
                      onChange={(e) => setLote(e.target.value.toUpperCase())}
                      onDoubleClick={keyboard.open}
                      maxLength={60}
                      className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-semibold uppercase outline-none focus:border-primary"
                    />
                  </KeyboardField>
                </label>
                <div className="flex flex-col gap-1">
                  <Etiqueta>Conservación</Etiqueta>
                  <div className="grid h-11 grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                    {(
                      [
                        { k: 'refrigerado', t: 'Refrigerado', I: Thermometer },
                        { k: 'congelado', t: 'Congelado', I: Snowflake },
                      ] as const
                    ).map(({ k, t, I }) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setConservacion(k)}
                        title={CONSERVACION_LABEL[k]}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors',
                          conservacion === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <I className="size-4" />
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_6rem_1fr] gap-3">
                <label className="flex flex-col gap-1">
                  <Etiqueta>Sacrificio</Etiqueta>
                  <input
                    type="date"
                    value={sacrificio}
                    max={plantToday()}
                    onChange={(e) => {
                      setSacrificio(e.target.value);
                      if (dias && e.target.value) setVencimiento(sumarDias(e.target.value, Number(dias)));
                    }}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-base font-semibold outline-none focus:border-primary"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Etiqueta>Vida útil</Etiqueta>
                  <div className="flex h-11 items-center rounded-lg border border-input bg-background pr-2 focus-within:border-primary">
                    <input
                      value={dias}
                      onChange={(e) => cambiarDias(e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-full min-w-0 bg-transparent px-3 text-right text-base font-semibold tabular-nums outline-none"
                    />
                    <span className="text-xs text-muted-foreground">días</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <Etiqueta>Vencimiento</Etiqueta>
                  <input
                    type="date"
                    value={vencimiento}
                    onChange={(e) => {
                      setVencimiento(e.target.value);
                      setDias('');
                    }}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-base font-semibold outline-none focus:border-primary"
                  />
                </label>
              </div>
            </div>

            <div className="flex min-h-40 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Recibido <span className="tabular-nums text-foreground">({items.length})</span>
                </h3>
                {seleccionado && (
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" className="h-9" disabled={imprimiendo} onClick={() => void imprimir(seleccionado, true)}>
                      <Printer className="size-4" />
                      Reimprimir
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setPidiendoBorrado(seleccionado)}
                    >
                      <Trash2 className="size-4" />
                      Eliminar
                    </Button>
                  </div>
                )}
              </div>
              <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
                {itemsQuery.isLoading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <LoaderCircle className="size-6 animate-spin" />
                  </div>
                ) : !items.length ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay producto recibido.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr className="[&>th]:h-10 [&>th]:px-3">
                        <th>Registro</th>
                        <th>Producto</th>
                        <th>Lote</th>
                        <th className="text-right">Pzs</th>
                        <th className="text-right">Tara</th>
                        <th className="text-right">Bruto</th>
                        <th className="text-right">Neto</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...items].reverse().map((i) => {
                        const sel = i.id === seleccionadoId;
                        return (
                          <tr
                            key={i.id}
                            onClick={() => setSeleccionadoId(sel ? null : i.id)}
                            className={cn(
                              'h-12 cursor-pointer transition-colors [&>td]:px-3',
                              sel ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40',
                            )}
                          >
                            <td className="font-mono font-bold">{formatPiezaPosta(orden.receiptNumber, i.codigo)}</td>
                            <td className="max-w-56 truncate uppercase">
                              {i.product.nombre}
                              {i.conservacion === 'congelado' && <Snowflake className="ml-1 inline size-3.5 opacity-70" />}
                            </td>
                            <td className="uppercase">{i.lote ?? '—'}</td>
                            <td className="text-right tabular-nums">{i.piezas}</td>
                            <td className="text-right tabular-nums">{kg(Number(i.taraKg), 2)}</td>
                            <td className="text-right tabular-nums">{kg(Number(i.brutoKg), 2)}</td>
                            <td className="text-right text-base font-semibold tabular-nums">{kg(Number(i.netoKg), 2)}</td>
                            <td className="tabular-nums">{hora(i.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Pesaje */}
          <div className="flex min-h-0 flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4 shadow-sm">
            <div>
              <Etiqueta>Registro siguiente</Etiqueta>
              <div className="font-mono text-3xl font-bold leading-tight">{formatPiezaPosta(orden.receiptNumber, siguiente)}</div>
            </div>

            <div className="flex flex-col gap-1">
              <Etiqueta>Tara por empaque (kg)</Etiqueta>
              <div className="grid grid-cols-4 gap-1.5">
                {TARAS_FRECUENTES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTaraUnit(t.toFixed(2))}
                    className={cn(
                      'h-10 rounded-lg border text-sm font-semibold tabular-nums transition-colors',
                      Number(taraUnit) === t ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted',
                    )}
                  >
                    {t.toFixed(2)}
                  </button>
                ))}
                <div className="relative col-span-2">
                  <input
                    value={taraUnit}
                    onChange={(e) => setTaraUnit(soloDecimal(e.target.value))}
                    onClick={() => setTeclado('tara')}
                    inputMode="decimal"
                    aria-label="Tara por empaque"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-right text-base font-bold tabular-nums outline-none focus:border-primary"
                  />
                  {teclado === 'tara' && <NumericKeypad value={taraUnit} onChange={setTaraUnit} onClose={() => setTeclado(null)} />}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Etiqueta>Empaques</Etiqueta>
                <Contador value={empaques} onChange={setEmpaques} min={0} />
              </div>
              <div className="flex flex-col gap-1">
                <Etiqueta>Piezas</Etiqueta>
                <Contador value={piezas} onChange={setPiezas} min={1} />
              </div>
            </div>

            <div>
              <Etiqueta>Peso bruto</Etiqueta>
              <div className="relative mt-1 flex items-baseline justify-center gap-2 rounded-xl border-2 border-primary/40 bg-muted/30 px-4 py-2 focus-within:border-primary">
                <input
                  value={bruto}
                  onChange={(e) => setBruto(soloDecimal(e.target.value))}
                  onClick={() => setTeclado('bruto')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') registrar();
                  }}
                  inputMode="decimal"
                  aria-label="Peso bruto en kg"
                  className="w-full min-w-0 bg-transparent text-right text-5xl font-bold tabular-nums outline-none"
                />
                <span className="text-xl font-semibold text-muted-foreground">kg</span>
                {teclado === 'bruto' && <NumericKeypad value={bruto} onChange={setBruto} onClose={() => setTeclado(null)} />}
              </div>
              {errorBascula && <p className="mt-1 text-xs font-medium text-red-600">{errorBascula}</p>}
              <div className="mt-2 flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  Tara <b className="tabular-nums text-foreground">{kg(taraKg, 2)}</b>
                </span>
                <span className="text-muted-foreground">
                  Neto <b className={cn('text-xl tabular-nums', netoKg > 0 ? 'text-primary' : 'text-red-600')}>{kg(Math.max(netoKg, 0), 2)}</b> kg
                </span>
              </div>
            </div>

            <Button variant="outline" className="h-12 text-base" onClick={() => void leerBascula()} disabled={leyendo}>
              {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
              Leer báscula
            </Button>
            <Button className="h-14 text-base" onClick={registrar} disabled={crear.isPending || imprimiendo}>
              {crear.isPending || imprimiendo ? <LoaderCircle className="size-5 animate-spin" /> : <Tag className="size-5" />}
              {imprimirAlRegistrar ? 'Registrar e imprimir' : 'Registrar'}
            </Button>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={imprimirAlRegistrar}
                onChange={(e) => setImprimirAlRegistrar(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Imprimir rótulo al registrar
            </label>

            <div className="mt-auto rounded-lg bg-muted/50 px-3 py-2">
              <Etiqueta>Último registro</Etiqueta>
              {ultimo ? (
                <button
                  type="button"
                  onClick={() => void imprimir(ultimo, true)}
                  disabled={imprimiendo}
                  title="Tocá para reimprimir su rótulo"
                  className="mt-1 flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-semibold">{formatPiezaPosta(orden.receiptNumber, ultimo.codigo)}</span>
                    <span className="block truncate text-xs uppercase text-muted-foreground">{ultimo.product.nombre}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <b>{kg(Number(ultimo.netoKg), 2)}</b> kg
                  </span>
                  <Printer className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ) : (
                <div className="mt-1 text-sm text-muted-foreground">—</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <TotalesPosta orden={orden} items={items} />
        </div>
      )}

      <CierreRecibo
        open={pidiendoCierre}
        titulo={`Cerrar orden ${formatRP(orden.receiptNumber)}`}
        resumen={
          <>
            Se cerrará con <b className="text-foreground">{items.length}</b> registros ({kg(totalNeto)} kg netos) y ya no recibirá
            más.
          </>
        }
        cargarDestino={() => destinoPostaReceipt(orden.id)}
        onClose={() => setPidiendoCierre(false)}
        onConfirm={async (pin, bodegaId) => {
          try {
            await cerrar.mutateAsync({ id: orden.id, pin, bodegaId });
            setPidiendoCierre(false);
            flash('success', `Orden ${formatRP(orden.receiptNumber)} cerrada: el producto entró al inventario.`);
            setOrden(null);
            setVista('ordenes');
            return null;
          } catch (err) {
            return mensajeApi(err, 'No se pudo cerrar la orden.');
          }
        }}
      />
      <SupervisorPinDialog
        open={!!pidiendoBorrado}
        title="Eliminar registro"
        accion="Eliminar"
        description={
          pidiendoBorrado && (
            <>
              Se eliminará <b className="text-foreground">{formatPiezaPosta(orden.receiptNumber, pidiendoBorrado.codigo)}</b> (
              {pidiendoBorrado.product.nombre}, {kg(Number(pidiendoBorrado.netoKg), 2)} kg netos). Ingresa el PIN de un supervisor.
            </>
          )
        }
        onClose={() => setPidiendoBorrado(null)}
        onConfirm={async (pin) => {
          if (!pidiendoBorrado) return null;
          try {
            await borrar.mutateAsync({ itemId: pidiendoBorrado.id, pin });
            flash('success', `Registro ${formatPiezaPosta(orden.receiptNumber, pidiendoBorrado.codigo)} eliminado.`);
            setPidiendoBorrado(null);
            setSeleccionadoId(null);
            return null;
          } catch (err) {
            return mensajeApi(err, 'No se pudo eliminar el registro.');
          }
        }}
      />
    </div>
  );
}

function Avisos({
  notice,
  onClose,
}: {
  notice: { type: 'success' | 'error'; text: string } | null;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-24 z-50 flex w-[30rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 flex-col gap-2">
      {notice && (
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-lg animate-in fade-in-0 slide-in-from-top-2',
            notice.type === 'success' ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700',
          )}
        >
          {notice.type === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <TriangleAlert className="size-4 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 opacity-60 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function OrdenesPosta({
  loading,
  ordenes,
  seleccionadaId,
  refrescando,
  onRefresh,
  onSelect,
}: {
  loading: boolean;
  ordenes: PostaReceipt[];
  seleccionadaId: string | null;
  refrescando: boolean;
  onRefresh: () => void;
  onSelect: (o: PostaReceipt) => void;
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
  const estado = (o: PostaReceipt) => ((o.registros ?? 0) > 0 ? 'proceso' : 'pendiente');
  const q = busqueda.trim().toUpperCase();
  const buscadas = q
    ? ordenes.filter((o) => [formatRP(o.receiptNumber), o.cliente.concepto, o.cliente.nit ?? ''].join(' ').toUpperCase().includes(q))
    : ordenes;
  const visibles = buscadas.filter((o) => !filtro || estado(o) === filtro);
  const filtros = [
    { key: null, texto: 'Todas', n: buscadas.length },
    { key: 'proceso' as const, texto: 'En proceso', n: buscadas.filter((o) => estado(o) === 'proceso').length },
    { key: 'pendiente' as const, texto: 'Sin iniciar', n: buscadas.filter((o) => estado(o) === 'pendiente').length },
  ];
  const hoy = plantToday();

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar RP, cliente o sede" className="h-11 pl-10 text-base" />
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
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filtro === f.key ? 'bg-primary text-primary-foreground' : 'bg-background')}>{f.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button type="button" onClick={() => cambiarVista('lista')} title="Ver en lista" className={cn('flex size-9 items-center justify-center rounded-md', vista === 'lista' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <List className="size-5" />
          </button>
          <button type="button" onClick={() => cambiarVista('tarjetas')} title="Ver en tarjetas" className={cn('flex size-9 items-center justify-center rounded-md', vista === 'tarjetas' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
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
            {q || filtro ? 'Ninguna orden coincide con la búsqueda o el filtro.' : 'No hay órdenes de recibo en posta abiertas. Créalas en Registrar → Orden recibo en posta.'}
          </div>
        ) : vista === 'lista' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-4">
                  <th className="w-28">Orden</th>
                  <th>Cliente</th>
                  <th>Proceso</th>
                  <th className="text-right">Referencias</th>
                  <th className="text-right">Piezas</th>
                  <th className="text-right">Kg netos</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((o) => (
                  <tr key={o.id} onClick={() => onSelect(o)} className={cn('h-16 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:px-4', o.id === seleccionadaId && 'bg-primary/5')}>
                    <td className="relative">
                      <span className={cn('absolute inset-y-0 left-0 w-1', estado(o) === 'proceso' ? 'bg-amber-500' : 'bg-transparent')} />
                      <span className="text-lg font-bold tabular-nums text-primary">{formatRP(o.receiptNumber)}</span>
                    </td>
                    <td className="max-w-96">
                      <div className="truncate text-base font-semibold uppercase">{o.cliente.concepto}</div>
                      <div className="text-xs text-muted-foreground">{o.cliente.nit ? `NIT ${o.cliente.nit}` : 'Sin NIT'}</div>
                    </td>
                    <td className={cn('tabular-nums', o.processDate.slice(0, 10) === hoy && 'font-semibold text-primary')}>
                      {formatFechaDia(o.processDate.slice(0, 10))}
                    </td>
                    <td className="text-right text-base font-semibold tabular-nums">{o.referencias ?? 0}</td>
                    <td className="text-right text-base font-semibold tabular-nums">{o.piezas ?? 0}</td>
                    <td className="text-right text-base font-semibold tabular-nums">{kg(o.kg ?? 0)}</td>
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
                    o.id === seleccionadaId ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">{formatRP(o.receiptNumber)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold uppercase">{o.cliente.concepto}</div>
                      <div className="text-sm text-muted-foreground">{o.cliente.nit ? `NIT ${o.cliente.nit} · ` : ''}Proceso {formatFechaDia(o.processDate.slice(0, 10))}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/40 px-4 py-3">
                    <Dato label="Referencias">{o.referencias ?? 0}</Dato>
                    <Dato label="Piezas">{o.piezas ?? 0}</Dato>
                    <Dato label="Kg netos">{kg(o.kg ?? 0)}</Dato>
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

function TotalesPosta({ orden, items }: { orden: PostaReceipt; items: PostaReceiptItem[] }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
        <Inbox className="size-8" />
        Esta orden aún no tiene producto recibido.
      </div>
    );
  }
  const suma = (f: (i: PostaReceiptItem) => number) => items.reduce((s, i) => s + f(i), 0);
  const bruto = suma((i) => Number(i.brutoKg));
  const tara = suma((i) => Number(i.taraKg));
  const neto = suma((i) => Number(i.netoKg));
  const piezas = suma((i) => i.piezas);
  const empaques = suma((i) => i.empaques);

  const porProducto = [
    ...items
      .reduce((m, i) => {
        const g = m.get(i.product.id) ?? { codigo: i.product.codigo, nombre: i.product.nombre, n: 0, piezas: 0, bruto: 0, tara: 0, neto: 0 };
        g.n += 1;
        g.piezas += i.piezas;
        g.bruto += Number(i.brutoKg);
        g.tara += Number(i.taraKg);
        g.neto += Number(i.netoKg);
        return m.set(i.product.id, g);
      }, new Map<string, { codigo: string; nombre: string; n: number; piezas: number; bruto: number; tara: number; neto: number }>())
      .values(),
  ].sort((a, b) => b.neto - a.neto);

  const porLote = [
    ...items
      .reduce((m, i) => {
        const k = `${i.lote ?? '—'}|${i.conservacion ?? ''}`;
        const g = m.get(k) ?? { lote: i.lote ?? '—', conservacion: i.conservacion, vence: i.fechaVencimiento, n: 0, neto: 0 };
        g.n += 1;
        g.neto += Number(i.netoKg);
        if (i.fechaVencimiento && (!g.vence || i.fechaVencimiento < g.vence)) g.vence = i.fechaVencimiento;
        return m.set(k, g);
      }, new Map<string, { lote: string; conservacion: Conservacion | null; vence: string | null; n: number; neto: number }>())
      .values(),
  ];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 px-4 py-3 md:grid-cols-6">
        <Dato label="Registros">{items.length}</Dato>
        <Dato label="Referencias">{porProducto.length}</Dato>
        <Dato label="Piezas">{piezas}</Dato>
        <Dato label="Empaques">{empaques}</Dato>
        <Dato label="Bruto · tara">
          {kg(bruto, 2)} · {kg(tara, 2)}
        </Dato>
        <Dato label="Neto (kg)">
          <span className="text-primary">{kg(neto, 2)}</span>
        </Dato>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Por producto</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-3">
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="text-right">Reg.</th>
                  <th className="text-right">Piezas</th>
                  <th className="text-right">Bruto</th>
                  <th className="text-right">Tara</th>
                  <th className="text-right">Neto</th>
                  <th className="w-32">Participación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porProducto.map((p) => {
                  const pct = neto ? (p.neto / neto) * 100 : 0;
                  return (
                    <tr key={p.codigo} className="h-11 [&>td]:px-3">
                      <td className="tabular-nums text-muted-foreground">{p.codigo}</td>
                      <td className="uppercase">{p.nombre}</td>
                      <td className="text-right tabular-nums">{p.n}</td>
                      <td className="text-right tabular-nums">{p.piezas}</td>
                      <td className="text-right tabular-nums">{kg(p.bruto, 2)}</td>
                      <td className="text-right tabular-nums">{kg(p.tara, 2)}</td>
                      <td className="text-right font-semibold tabular-nums">{kg(p.neto, 2)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/60 font-semibold tabular-nums">
                <tr className="h-11 [&>td]:px-3">
                  <td colSpan={2}>TOTAL {formatRP(orden.receiptNumber)}</td>
                  <td className="text-right">{items.length}</td>
                  <td className="text-right">{piezas}</td>
                  <td className="text-right">{kg(bruto, 2)}</td>
                  <td className="text-right">{kg(tara, 2)}</td>
                  <td className="text-right">{kg(neto, 2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Por lote</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-3">
                  <th>Lote</th>
                  <th>Vence</th>
                  <th className="text-right">Reg.</th>
                  <th className="text-right">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porLote.map((l) => (
                  <tr key={`${l.lote}|${l.conservacion}`} className="h-11 [&>td]:px-3">
                    <td className="uppercase">
                      {l.lote}
                      {l.conservacion === 'congelado' && <Snowflake className="ml-1 inline size-3.5 text-sky-600" />}
                    </td>
                    <td className="tabular-nums">{fechaCorta(l.vence) || '—'}</td>
                    <td className="text-right tabular-nums">{l.n}</td>
                    <td className="text-right font-semibold tabular-nums">{kg(l.neto, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

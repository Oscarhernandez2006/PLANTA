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
  Printer,
  RefreshCw,
  Search,
  Tag,
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
import { SIN_IMPRESORA, useImpresoraEtiquetas } from '../rotulado/ui';
import {
  formatPieza,
  formatRC,
  registrarReimpresionRecibo,
  useCanalReceiptItems,
  useCanalReceipts,
  useCerrarCanalReceipt,
  destinoCanalReceipt,
  useCreateCanalReceiptItem,
  useDeleteCanalReceiptItem,
  type CanalReceipt,
  type CanalReceiptItem,
} from '../canal-recibo/api';
import { generarRotuloReciboZpl } from '../canal-recibo/rotulo-recibo-zpl';
import { CierreRecibo } from '../canal-recibo/CierreRecibo';

type Vista = 'ordenes' | 'recibo' | 'totales';

const CAVAS = [1, 2, 3, 4, 5];
const VISTA_KEY = 'reciboCanales.vistaOrdenes';

const kg = (n: number, dec = 1) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

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

export function ReciboCanalesPage() {
  const [vista, setVista] = useState<Vista>('ordenes');
  const [orden, setOrden] = useState<CanalReceipt | null>(null);
  const ordenes = useCanalReceipts({ page: 1, pageSize: 100, status: 'activo' });
  const itemsQuery = useCanalReceiptItems(orden?.id ?? null);
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const crear = useCreateCanalReceiptItem(orden?.id ?? null);
  const borrar = useDeleteCanalReceiptItem(orden?.id ?? null);
  const cerrar = useCerrarCanalReceipt();
  const impresora = useImpresoraEtiquetas();
  const equipo = useDevice();
  const keyboard = useKeyboard();

  const [guia, setGuia] = useState('');
  const [lote, setLote] = useState('');
  const [identificacion, setIdentificacion] = useState('');
  const [cava, setCava] = useState<number | null>(null);
  const { peso, setPeso, leyendo, error: errorBascula, leerBascula } = useBascula('0.00');
  const [tecladoPeso, setTecladoPeso] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [imprimirAlRegistrar, setImprimirAlRegistrar] = useState(true);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  const [pidiendoBorrado, setPidiendoBorrado] = useState<CanalReceiptItem | null>(null);
  const identRef = useRef<HTMLInputElement>(null);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  function flash(type: 'success' | 'error', text: string) {
    setNotice({ type, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }

  const pesoKg = Number(peso.replace(',', '.'));
  const totalKg = items.reduce((s, i) => s + Number(i.pesoKg), 0);
  const ultimo = items.length ? items.reduce((a, b) => (a.codigo > b.codigo ? a : b)) : null;
  const siguiente = (ultimo?.codigo ?? 0) + 1;
  const seleccionado = items.find((i) => i.id === seleccionadoId) ?? null;
  const porCava = useMemo(() => {
    const m = new Map<number, { n: number; kg: number }>();
    for (const i of items) {
      const c = m.get(i.cava) ?? { n: 0, kg: 0 };
      c.n += 1;
      c.kg += Number(i.pesoKg);
      m.set(i.cava, c);
    }
    return m;
  }, [items]);

  function elegirOrden(o: CanalReceipt) {
    if (o.id !== orden?.id) {
      setGuia('');
      setLote('');
      setIdentificacion('');
      setCava(null);
      setSeleccionadoId(null);
    }
    setOrden(o);
    setVista('recibo');
  }

  async function imprimir(item: CanalReceiptItem, reimpresion: boolean) {
    if (!orden) return false;
    if (!impresora) {
      flash('error', SIN_IMPRESORA);
      return false;
    }
    setImprimiendo(true);
    try {
      const r = await printRaw(
        impresora,
        generarRotuloReciboZpl({
          receiptNumber: orden.receiptNumber,
          codigo: item.codigo,
          cliente: orden.cliente.concepto,
          nit: orden.cliente.nit ?? '',
          guia: item.guia ?? '',
          lote: item.lote ?? '',
          identificacion: item.identificacion ?? '',
          cava: item.cava,
          pesoKg: Number(item.pesoKg),
          fecha: new Date(item.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        }),
      );
      if (!r.ok) {
        flash('error', r.error || 'No se pudo imprimir el rótulo.');
        return false;
      }
      if (reimpresion) {
        registrarReimpresionRecibo(item.id, equipo.hostname);
        flash('success', `Rótulo ${formatPieza(orden.receiptNumber, item.codigo)} reimpreso.`);
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
    if (!guia.trim()) faltan.push('la guía');
    if (!lote.trim()) faltan.push('el lote');
    if (!identificacion.trim()) faltan.push('la identificación');
    if (!cava) faltan.push('la cava');
    if (!Number.isFinite(pesoKg) || pesoKg <= 0) faltan.push('el peso');
    if (faltan.length) {
      const lista = faltan.length > 1 ? `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}` : faltan[0];
      flash('error', `Falta ${lista}.`);
      return;
    }
    if (imprimirAlRegistrar && !impresora) {
      flash('error', `${SIN_IMPRESORA} Desmarca "Imprimir rótulo" para registrar sin imprimir.`);
      return;
    }
    crear.mutate(
      { cava: cava!, pesoKg, guia: guia.trim(), lote: lote.trim(), identificacion: identificacion.trim() },
      {
        onSuccess: async (item) => {
          const pieza = formatPieza(orden.receiptNumber, item.codigo);
          // Guía, lote y cava se conservan; identificación y peso se limpian para la siguiente.
          setIdentificacion('');
          setPeso('0.00');
          setSeleccionadoId(null);
          identRef.current?.focus();
          const impreso = imprimirAlRegistrar ? await imprimir(item, false) : true;
          flash(
            impreso ? 'success' : 'error',
            impreso
              ? `${pieza} registrada · Cava ${item.cava} · ${kg(Number(item.pesoKg), 2)} kg.`
              : `${pieza} registrada, pero el rótulo no se imprimió. Reimprímelo desde la tabla.`,
          );
        },
        onError: (err) => flash('error', mensajeApi(err, 'No se pudo registrar la canal.')),
      },
    );
  }

  if (vista === 'ordenes') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Avisos notice={notice} onClose={() => setNotice(null)} />
        <OrdenesRecibo
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
          {formatRC(orden.receiptNumber)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold uppercase">
            {orden.cliente.concepto}
            {orden.cliente.nit && <span className="text-muted-foreground"> · NIT {orden.cliente.nit}</span>}
          </div>
          <div className="text-sm text-muted-foreground">
            <b className="tabular-nums text-foreground">{items.length}</b> {items.length === 1 ? 'canal' : 'canales'} ·{' '}
            <b className="tabular-nums text-foreground">{kg(totalKg)}</b> kg · Proceso{' '}
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
          title={items.length ? 'Cerrar la orden (PIN de supervisor)' : 'La orden no tiene canales'}
        >
          <Lock className="size-5" />
          Cerrar orden
        </Button>
      </div>

      {vista === 'recibo' ? (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Izquierda: datos del lote, cava y recibidas */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="shrink-0 space-y-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Guía', value: guia, set: setGuia },
                  { label: 'Lote (orden sacrificio)', value: lote, set: setLote },
                  { label: 'Identificación', value: identificacion, set: setIdentificacion, ref: identRef },
                ].map((c) => (
                  <label key={c.label} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</span>
                    <KeyboardField>
                      <input
                        ref={c.ref}
                        value={c.value}
                        onChange={(e) => c.set(e.target.value.toUpperCase())}
                        onDoubleClick={keyboard.open}
                        maxLength={60}
                        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-semibold uppercase outline-none focus:border-primary"
                      />
                    </KeyboardField>
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cava</span>
                <div className="grid grid-cols-5 gap-2">
                  {CAVAS.map((c) => {
                    const info = porCava.get(c);
                    const sel = cava === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCava(c)}
                        aria-pressed={sel}
                        className={cn(
                          'flex h-16 flex-col items-center justify-center rounded-xl border-2 transition-all active:scale-95',
                          sel ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'border-border bg-card hover:border-primary/40',
                        )}
                      >
                        <span className="text-lg font-bold">CAVA {c}</span>
                        <span className={cn('text-xs tabular-nums', sel ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                          {info ? `${info.n} · ${kg(info.kg)} kg` : 'vacía'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex min-h-40 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Recibidas <span className="tabular-nums text-foreground">({items.length})</span>
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
                  <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay canales recibidas.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr className="[&>th]:h-10 [&>th]:px-4">
                        <th>Pieza</th>
                        <th>Identificación</th>
                        <th>Guía</th>
                        <th>Lote</th>
                        <th>Cava</th>
                        <th>Hora</th>
                        <th className="text-right">Kg</th>
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
                              'h-12 cursor-pointer transition-colors [&>td]:px-4',
                              sel ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40',
                            )}
                          >
                            <td className="font-mono font-bold">{formatPieza(orden.receiptNumber, i.codigo)}</td>
                            <td className="uppercase">{i.identificacion ?? '—'}</td>
                            <td className="tabular-nums">{i.guia ?? '—'}</td>
                            <td className="uppercase">{i.lote ?? '—'}</td>
                            <td>{i.cava}</td>
                            <td className="tabular-nums">{hora(i.createdAt)}</td>
                            <td className="text-right text-base font-semibold tabular-nums">{kg(Number(i.pesoKg), 2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Derecha: báscula */}
          <div className="flex min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pieza siguiente</div>
                <div className="font-mono text-4xl font-bold leading-tight">{formatPieza(orden.receiptNumber, siguiente)}</div>
                <div className="text-sm text-muted-foreground">{cava ? `Cava ${cava}` : 'Elegí la cava'}</div>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peso</span>
              <div className="relative mt-1 flex items-baseline justify-center gap-2 rounded-xl border-2 border-primary/40 bg-muted/30 px-4 py-3 focus-within:border-primary">
                <input
                  value={peso}
                  onChange={(e) => setPeso(soloDecimal(e.target.value))}
                  onClick={() => setTecladoPeso(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') registrar();
                  }}
                  inputMode="decimal"
                  aria-label="Peso en kg"
                  className="w-full min-w-0 bg-transparent text-right text-5xl font-bold tabular-nums outline-none"
                />
                <span className="text-xl font-semibold text-muted-foreground">kg</span>
                {tecladoPeso && <NumericKeypad value={peso} onChange={setPeso} onClose={() => setTecladoPeso(false)} />}
              </div>
              {errorBascula && <p className="mt-1 text-xs font-medium text-red-600">{errorBascula}</p>}
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

            <div className="mt-auto rounded-lg bg-muted/50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Última canal</div>
              {ultimo ? (
                <button
                  type="button"
                  onClick={() => void imprimir(ultimo, true)}
                  disabled={imprimiendo}
                  title="Tocá para reimprimir su rótulo"
                  className="mt-1 flex w-full items-baseline justify-between gap-2 text-left"
                >
                  <span className="font-mono text-base font-semibold">{formatPieza(orden.receiptNumber, ultimo.codigo)}</span>
                  <span className="tabular-nums text-sm">
                    Cava {ultimo.cava} · <b>{kg(Number(ultimo.pesoKg), 2)}</b> kg
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
          <TotalesRecibo orden={orden} items={items} />
        </div>
      )}

      <CierreRecibo
        open={pidiendoCierre}
        titulo={`Cerrar orden ${formatRC(orden.receiptNumber)}`}
        resumen={
          <>
            Se cerrará con <b className="text-foreground">{items.length}</b> canales ({kg(totalKg)} kg) y ya no recibirá más.
          </>
        }
        cargarDestino={() => destinoCanalReceipt(orden.id)}
        onClose={() => setPidiendoCierre(false)}
        onConfirm={async (pin, bodegaId) => {
          try {
            await cerrar.mutateAsync({ id: orden.id, pin, bodegaId });
            setPidiendoCierre(false);
            flash('success', `Orden ${formatRC(orden.receiptNumber)} cerrada: las canales entraron al inventario.`);
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
        title="Eliminar canal"
        accion="Eliminar"
        description={
          pidiendoBorrado && (
            <>
              Se eliminará la canal <b className="text-foreground">{formatPieza(orden.receiptNumber, pidiendoBorrado.codigo)}</b> (
              {kg(Number(pidiendoBorrado.pesoKg), 2)} kg, cava {pidiendoBorrado.cava}). Ingresa el PIN de un supervisor.
            </>
          )
        }
        onClose={() => setPidiendoBorrado(null)}
        onConfirm={async (pin) => {
          if (!pidiendoBorrado) return null;
          try {
            await borrar.mutateAsync({ itemId: pidiendoBorrado.id, pin });
            flash('success', `Canal ${formatPieza(orden.receiptNumber, pidiendoBorrado.codigo)} eliminada.`);
            setPidiendoBorrado(null);
            setSeleccionadoId(null);
            return null;
          } catch (err) {
            return mensajeApi(err, 'No se pudo eliminar la canal.');
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

function OrdenesRecibo({
  loading,
  ordenes,
  seleccionadaId,
  refrescando,
  onRefresh,
  onSelect,
}: {
  loading: boolean;
  ordenes: CanalReceipt[];
  seleccionadaId: string | null;
  refrescando: boolean;
  onRefresh: () => void;
  onSelect: (o: CanalReceipt) => void;
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
  const estado = (o: CanalReceipt) => ((o.piezas ?? 0) > 0 ? 'proceso' : 'pendiente');
  const q = busqueda.trim().toUpperCase();
  const buscadas = q
    ? ordenes.filter((o) => [formatRC(o.receiptNumber), o.cliente.concepto, o.cliente.nit ?? ''].join(' ').toUpperCase().includes(q))
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
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar RC, cliente o sede" className="h-11 pl-10 text-base" />
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
            {q || filtro ? 'Ninguna orden coincide con la búsqueda o el filtro.' : 'No hay órdenes de recibo abiertas. Créalas en Registrar → Recibo de canales.'}
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
                  <th className="text-right">Kg</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((o) => (
                  <tr key={o.id} onClick={() => onSelect(o)} className={cn('h-16 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:px-4', o.id === seleccionadaId && 'bg-primary/5')}>
                    <td className="relative">
                      <span className={cn('absolute inset-y-0 left-0 w-1', estado(o) === 'proceso' ? 'bg-amber-500' : 'bg-transparent')} />
                      <span className="text-lg font-bold tabular-nums text-primary">{formatRC(o.receiptNumber)}</span>
                    </td>
                    <td className="max-w-96">
                      <div className="truncate text-base font-semibold uppercase">{o.cliente.concepto}</div>
                      <div className="text-xs text-muted-foreground">{o.cliente.nit ? `NIT ${o.cliente.nit}` : 'Sin NIT'}</div>
                    </td>
                    <td className={cn('tabular-nums', o.processDate.slice(0, 10) === hoy && 'font-semibold text-primary')}>
                      {formatFechaDia(o.processDate.slice(0, 10))}
                    </td>
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
                    <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-2xl font-bold tabular-nums text-primary">{formatRC(o.receiptNumber)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold uppercase">{o.cliente.concepto}</div>
                      <div className="text-sm text-muted-foreground">{o.cliente.nit ? `NIT ${o.cliente.nit} · ` : ''}Proceso {formatFechaDia(o.processDate.slice(0, 10))}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 px-4 py-3">
                    <Dato label="Canales">{o.piezas ?? 0}</Dato>
                    <Dato label="Kg">{kg(o.kg ?? 0)}</Dato>
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

function TotalesRecibo({ orden, items }: { orden: CanalReceipt; items: CanalReceiptItem[] }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
        <Inbox className="size-8" />
        Esta orden aún no tiene canales recibidas.
      </div>
    );
  }
  const pesos = items.map((i) => Number(i.pesoKg));
  const total = pesos.reduce((s, n) => s + n, 0);
  const min = items.reduce((a, b) => (Number(a.pesoKg) <= Number(b.pesoKg) ? a : b));
  const max = items.reduce((a, b) => (Number(a.pesoKg) >= Number(b.pesoKg) ? a : b));
  const agrupar = (clave: (i: CanalReceiptItem) => string) => {
    const m = new Map<string, { n: number; kg: number }>();
    for (const i of items) {
      const k = clave(i);
      const g = m.get(k) ?? { n: 0, kg: 0 };
      g.n += 1;
      g.kg += Number(i.pesoKg);
      m.set(k, g);
    }
    return [...m].map(([k, v]) => ({ k, ...v }));
  };
  const porCava = agrupar((i) => `CAVA ${i.cava}`).sort((a, b) => a.k.localeCompare(b.k));
  const porGuia = agrupar((i) => `${i.guia ?? '—'} · LOTE ${i.lote ?? '—'}`);
  const maxCava = Math.max(...porCava.map((c) => c.kg));

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 px-4 py-3 md:grid-cols-5">
        <Dato label="Canales">{items.length}</Dato>
        <Dato label="Kg totales">{kg(total, 2)}</Dato>
        <Dato label="Promedio por canal">{kg(total / items.length, 2)} kg</Dato>
        <Dato label="Más liviana">
          {formatPieza(orden.receiptNumber, min.codigo)} · {kg(Number(min.pesoKg), 2)}
        </Dato>
        <Dato label="Más pesada">
          {formatPieza(orden.receiptNumber, max.codigo)} · {kg(Number(max.pesoKg), 2)}
        </Dato>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Por cava</h3>
          <div className="space-y-2">
            {porCava.map((c) => (
              <div key={c.k} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <span className="w-20 text-sm font-semibold">{c.k}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${maxCava ? (c.kg / maxCava) * 100 : 0}%` }} />
                </div>
                <span className="w-32 text-right text-sm tabular-nums">
                  <b>{c.n}</b> · {kg(c.kg)} kg
                </span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Por guía y lote</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {porGuia.map((g) => (
                  <tr key={g.k} className="h-10 [&>td]:px-3">
                    <td className="uppercase">{g.k}</td>
                    <td className="text-right font-semibold tabular-nums">{g.n}</td>
                    <td className="text-right tabular-nums">{kg(g.kg)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalle</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:h-10 [&>th]:px-4">
                <th>Pieza</th>
                <th>Identificación</th>
                <th>Guía</th>
                <th>Lote</th>
                <th>Cava</th>
                <th>Hora</th>
                <th className="text-right">Kg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => (
                <tr key={i.id} className="h-11 [&>td]:px-4">
                  <td className="font-mono font-bold">{formatPieza(orden.receiptNumber, i.codigo)}</td>
                  <td className="uppercase">{i.identificacion ?? '—'}</td>
                  <td className="tabular-nums">{i.guia ?? '—'}</td>
                  <td className="uppercase">{i.lote ?? '—'}</td>
                  <td>{i.cava}</td>
                  <td className="tabular-nums">{hora(i.createdAt)}</td>
                  <td className="text-right font-semibold tabular-nums">{kg(Number(i.pesoKg), 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/60 font-semibold tabular-nums">
              <tr className="h-11 [&>td]:px-4">
                <td colSpan={6}>TOTAL ({items.length} canales)</td>
                <td className="text-right">{kg(total, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

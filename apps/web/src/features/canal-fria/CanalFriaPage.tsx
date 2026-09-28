import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { ChevronDown, ChevronUp, Gauge, Inbox, LoaderCircle, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { CanalFriaIcon } from '@/components/icons/CanalFriaIcon';
import { useBascula } from '@/components/bascula/Bascula';
import { cn, soloDecimal } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import {
  useAgregarItemDespacho,
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

type Tab = 'ordenes' | 'registro' | 'totales';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'Órdenes de despacho' },
  { key: 'registro', label: 'Registro' },
  { key: 'totales', label: 'Totales' },
];

function FieldBox({
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

function Mensaje({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Inbox className="size-8" />
      <p className="max-w-sm text-sm">{text}</p>
    </div>
  );
}

const PIEZA_LABEL: Record<ItemDespacho['pieza'], string> = {
  canal: 'CANAL',
  cizq: 'CIZQ',
  cder: 'CDER',
};

const num = (n: number, dec = 1) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Pestaña REGISTRO: piezas que salieron de cava hacia la orden y totales contra su peso en caliente. */
function RegistroTab({
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
                  <td className={cn(celda, 'tabular-nums')}>{formatOB(i.reference)}</td>
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <div className="flex h-10 items-center justify-center text-3xl font-bold tabular-nums text-blue-700">
            {num(diferencia, 2)} | {num(pct, 2)}
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
function TotalesTab({ items }: { items: ItemDespacho[] }) {
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
  const [tab, setTab] = useState<Tab>('ordenes');
  const [orden, setOrden] = useState<OrdenDespacho | null>(null);
  const ordenes = useOrdenesDespachoActivas();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [barcode, setBarcode] = useState('');
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const itemsQuery = useItemsDespacho(orden?.id ?? null);
  const items = itemsQuery.data ?? [];
  const agregar = useAgregarItemDespacho(orden?.id ?? null);
  const quitar = useQuitarItemDespacho(orden?.id ?? null);
  const pesar = usePesarItemDespacho(orden?.id ?? null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = items.find((i) => i.itemId === seleccionadoId) ?? null;
  const [scanError, setScanError] = useState<string | null>(null);
  const buscando = agregar.isPending;

  function seleccionar(item: ItemDespacho | null) {
    setSeleccionadoId(item?.itemId ?? null);
    setPeso('0.0');
    setScanError(null);
  }

  /** Guarda el peso de despacho de la fila elegida y pasa a la siguiente sin pesar. */
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
      const siguiente = items.find(
        (i) => i.itemId !== seleccionado.itemId && i.despachoKg === null,
      );
      seleccionar(siguiente ?? null);
    } catch (err) {
      const m = isAxiosError(err) ? err.response?.data?.message : null;
      setScanError(typeof m === 'string' ? m : 'No se pudo guardar el peso.');
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
      const m = isAxiosError(err) ? err.response?.data?.message : null;
      setScanError(typeof m === 'string' ? m : 'No se pudo despachar la canal.');
    }
  }

  function quitarItem(itemId: string) {
    setScanError(null);
    quitar.mutate(itemId, {
      onError: (err) => {
        const m = isAxiosError(err) ? err.response?.data?.message : null;
        setScanError(typeof m === 'string' ? m : 'No se pudo quitar la canal.');
      },
    });
  }

  function elegirOrden(o: OrdenDespacho | null) {
    setOrden(o);
    setSeleccionadoId(null);
    setScanError(null);
  }

  function scrollList(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ top: dir * 220, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-5xl flex-col gap-2 p-2">
      {/* Encabezado: icono, orden y cliente */}
      <div className="flex items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <CanalFriaIcon className="size-10 text-foreground" />
        </div>
        <FieldBox label="OD No.:" className="min-w-40">
          <div className="flex h-9 items-center text-xl font-bold tabular-nums text-red-600">
            {orden ? formatOD(orden.odNumber) : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {orden?.cliente.concepto ?? '—'}
          </div>
        </FieldBox>
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
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto rounded-sm border-2 border-border bg-card"
      >
        {tab === 'ordenes' &&
          (ordenes.isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : !ordenes.data?.length ? (
            <Mensaje text="No hay órdenes de despacho activas. Créalas en Administrativo → Orden de Despacho." />
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
                    <span className="font-bold tabular-nums">{formatOD(o.odNumber)}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    {o.cliente.nit ? `${o.cliente.nit} - ` : ''}
                    {o.cliente.concepto} ({TIPO_ORDEN_DESPACHO})
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

      {/* Botones de desplazamiento */}
      <div className="grid grid-cols-2 gap-2">
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

      {/* Pie: báscula */}
      <div className="flex flex-wrap items-stretch gap-2">
        <FieldBox label="Código de barras:" className="min-w-56 flex-1">
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
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted"
        >
          <Trash2 className="size-6" />
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
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted"
        >
          <RefreshCw className="size-6" />
        </button>
        <FieldBox label="Peso(kg):" className="w-36">
          <input
            value={peso}
            onChange={(e) => setPeso(soloDecimal(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void guardarPeso();
            }}
            inputMode="decimal"
            disabled={!seleccionado}
            title={seleccionado ? 'Enter para guardar el peso' : 'Selecciona una fila de Productos'}
            className="h-10 w-full bg-transparent text-center text-3xl font-bold text-emerald-700 outline-none disabled:opacity-50"
          />
        </FieldBox>
        <button
          onClick={leerBascula}
          disabled={leyendo || !seleccionado}
          title="Leer báscula"
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
        >
          {leyendo ? <LoaderCircle className="size-6 animate-spin" /> : <Gauge className="size-6" />}
        </button>
        <button
          onClick={() => void guardarPeso()}
          disabled={!seleccionado || pesar.isPending}
          title="Guardar peso de despacho"
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
        >
          {pesar.isPending ? <LoaderCircle className="size-6 animate-spin" /> : <Save className="size-6" />}
        </button>
        <FieldBox label="Gancho:" className="w-28">
          <div className="flex h-10 items-center justify-center text-2xl font-bold tabular-nums text-red-600">
            {seleccionado ? (seleccionado.turno ?? seleccionado.sequence) : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Cant.(kg):" className="w-32">
          <div className="flex h-10 items-center justify-center text-2xl font-bold tabular-nums">
            {seleccionado ? num(seleccionado.pesoKg, 1) : '—'}
          </div>
        </FieldBox>
        {(error || scanError) && (
          <p className="w-full text-xs font-medium text-red-600">{scanError ?? error}</p>
        )}
      </div>
    </div>
  );
}

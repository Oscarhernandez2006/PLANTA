import { useMemo, useState } from 'react';
import {
  Check,
  Gauge,
  LoaderCircle,
  PackageSearch,
  Printer,
  RefreshCw,
  Tag,
  Trash2,
} from 'lucide-react';
import { ReciboCanalesIcon } from '@/components/icons/ReciboCanalesIcon';
import { useBascula } from '@/components/bascula/Bascula';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import {
  statusLabels,
  statusTone,
  useCanalReceipts,
  useCanalReceiptItems,
  useCreateCanalReceiptItem,
  useDeleteCanalReceiptItem,
  type CanalReceipt,
  type DispatchOrderStatus,
} from '../canal-recibo/api';

type Tab = 'ordenes' | 'canales' | 'totales';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'ORDENES' },
  { key: 'canales', label: 'CANALES / CUARTOS' },
  { key: 'totales', label: 'TOTALES' },
];

const CAVAS = [1, 2, 3, 4, 5];

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface CanalRegistro {
  id: string;
  codigo: number;
  cava: number;
  pesoKg: number;
  hora: string;
}

export function ReciboCanalesPage() {
  const [date, setDate] = useState(today());
  const [tab, setTab] = useState<Tab>('ordenes');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [guia, setGuia] = useState('');
  const [lote, setLote] = useState('');
  const [identificacion, setIdentificacion] = useState('');
  const [cava, setCava] = useState<number | null>(null);
  // Valor digitado en el teclado; se coloca en el input que se toque.
  const [buffer, setBuffer] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const receipts = useCanalReceipts({ page: 1, pageSize: 100 });
  const lista = receipts.data?.data ?? [];
  const selected = lista.find((o) => o.id === selectedId) ?? null;
  const cliente = selected
    ? `${selected.client.name} (${selected.client.sede})`
    : '';

  // Canales pesados de la orden (persistidos en la base de datos).
  const itemsQuery = useCanalReceiptItems(selectedId);
  const crearItem = useCreateCanalReceiptItem(selectedId);
  const borrarItem = useDeleteCanalReceiptItem(selectedId);
  const registros: CanalRegistro[] = useMemo(
    () =>
      (itemsQuery.data ?? []).map((it) => ({
        id: it.id,
        codigo: it.codigo,
        cava: it.cava,
        pesoKg: Number(it.pesoKg),
        hora: new Date(it.createdAt).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      })),
    [itemsQuery.data],
  );

  const totalKg = useMemo(
    () => registros.reduce((s, r) => s + r.pesoKg, 0),
    [registros],
  );
  const ultimo = registros[registros.length - 1] ?? null;

  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.00');
  const valor = Number(peso.replace(',', '.'));
  const puedePesar =
    !!selected && cava != null && Number.isFinite(valor) && valor > 0;

  function seleccionarOrden(o: CanalReceipt) {
    setSelectedId(o.id);
    setCava(null);
    setGuia('');
    setLote('');
    setIdentificacion('');
    setTab('canales');
  }

  function registrarEn(cavaNum: number, pesoKg: number) {
    if (!selectedId || crearItem.isPending) return;
    setCava(cavaNum);
    setSaveError(null);
    crearItem.mutate(
      {
        cava: cavaNum,
        pesoKg,
        guia: guia.trim() || undefined,
        lote: lote.trim() || undefined,
        identificacion: identificacion.trim() || undefined,
      },
      {
        onSuccess: (item) => {
          setNotice(
            `Canal N.º ${item.codigo} registrada en CAVA ${item.cava} · ${Number(item.pesoKg).toFixed(2)} kg.`,
          );
          window.setTimeout(() => setNotice(null), 3000);
          // Limpia la captura para la siguiente canal.
          setIdentificacion('');
          setCava(null);
          setPeso('0.00');
        },
        onError: () => setSaveError('No se pudo registrar la canal.'),
      },
    );
  }

  function eliminarRegistro(id: string) {
    const reg = registros.find((r) => r.id === id);
    borrarItem.mutate(id, {
      onSuccess: () => {
        setDeleteNotice(
          `Eliminaste la canal N.º ${reg?.codigo ?? ''} exitosamente.`,
        );
        window.setTimeout(() => setDeleteNotice(null), 3000);
      },
      onError: () => setSaveError('No se pudo eliminar la canal.'),
    });
  }

  function registrar() {
    if (!puedePesar || cava == null) return;
    registrarEn(cava, valor);
    setPeso('0.00');
  }
  // Coloca el valor digitado en el campo indicado y limpia el teclado.
  function colocar(setter: (v: string) => void) {
    if (buffer.trim() === '') return;
    setter(buffer);
    setBuffer('');
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-5xl flex-col gap-2 p-2">
      {/* Encabezado */}
      <div className="flex items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <ReciboCanalesIcon className="size-10" />
        </div>
        <FieldBox label="Fecha:">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || today())}
            className="h-9 w-40 bg-transparent text-lg font-semibold outline-none"
          />
        </FieldBox>
        <FieldBox label="Proveedor / Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {cliente || '—'}
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
      <div className="flex-1 overflow-auto rounded-sm border-2 border-border bg-card">
        {tab === 'ordenes' && (
          <OrdenesTab
            loading={receipts.isLoading}
            ordenes={lista}
            selectedId={selectedId}
            onSelect={seleccionarOrden}
          />
        )}
        {tab === 'canales' && (
          <CanalesTab
            selected={selected}
            guia={guia}
            setGuia={setGuia}
            lote={lote}
            setLote={setLote}
            identificacion={identificacion}
            setIdentificacion={setIdentificacion}
            cava={cava}
            setCava={setCava}
            registros={registros}
            totalKg={totalKg}
            buffer={buffer}
            setBuffer={setBuffer}
            onColocar={colocar}
            onRegistrar={registrarEn}
          />
        )}
        {tab === 'totales' && (
          <TotalesTab
            registros={registros}
            totalKg={totalKg}
            onEliminar={eliminarRegistro}
          />
        )}
      </div>

      {/* Pie: báscula */}
      <div className="flex flex-wrap items-stretch gap-2">
        <FieldBox label="Orden No.:">
          <div className="flex h-10 min-w-24 items-center text-2xl font-bold tabular-nums">
            {selected ? selected.receiptNumber : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Código:">
          <div className="flex h-10 min-w-20 items-center justify-center text-2xl font-bold tabular-nums text-red-600">
            {selected ? registros.length + 1 : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Peso(kg):" className="flex-1">
          <input
            value={peso}
            onChange={(e) => setPeso(e.target.value.replace(/[^0-9.]/g, ''))}
            onClick={() => colocar(setPeso)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') registrar();
            }}
            inputMode="decimal"
            placeholder="0.00"
            disabled={!selected}
            className="h-10 w-full bg-transparent text-center text-3xl font-bold text-emerald-700 outline-none disabled:opacity-50"
          />
        </FieldBox>
        <button
          onClick={leerBascula}
          disabled={leyendo || !selected}
          title="Leer báscula"
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
        >
          {leyendo ? (
            <LoaderCircle className="size-6 animate-spin" />
          ) : (
            <Gauge className="size-6" />
          )}
        </button>
        <button
          onClick={registrar}
          disabled={!puedePesar}
          title="Registrar canal"
          className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
        >
          <Check className="size-6" />
        </button>
        <FieldBox label="Ultimo Registro:" className="min-w-48">
          <div className="flex h-10 items-center gap-2 text-sm font-medium">
            {ultimo ? (
              <>
                <span className="tabular-nums">#{ultimo.codigo}</span>
                <span className="text-muted-foreground">CAVA {ultimo.cava}</span>
                <span className="font-bold text-emerald-700 tabular-nums">
                  {ultimo.pesoKg.toFixed(2)} kg
                </span>
              </>
            ) : (
              '—'
            )}
          </div>
        </FieldBox>
      </div>

      {notice && (
        <p className="rounded-sm border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-700">
          {notice}
        </p>
      )}
      {deleteNotice && (
        <p className="rounded-sm border-2 border-red-500 bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">
          {deleteNotice}
        </p>
      )}
      {(error || saveError) && (
        <p className="text-xs font-medium text-red-600">{error || saveError}</p>
      )}
    </div>
  );
}

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

function OrdenesTab({
  loading,
  ordenes,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  ordenes: CanalReceipt[];
  selectedId: string | null;
  onSelect: (o: CanalReceipt) => void;
}) {
  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" /> Cargando…
      </div>
    );
  if (!ordenes.length)
    return (
      <div className="flex flex-col items-center gap-2 p-14 text-center text-muted-foreground">
        <PackageSearch className="size-8 opacity-50" />
        <p className="text-sm font-medium">Sin órdenes de recibo</p>
        <p className="text-sm">
          Registrá la primera en “Orden recibo de canales”.
        </p>
      </div>
    );
  return (
    <ul className="flex flex-col gap-2 p-2">
      {ordenes.map((o) => {
        const activo = o.id === selectedId;
        return (
          <li key={o.id}>
            <button
              onClick={() => onSelect(o)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm border-2 px-4 py-4 text-left text-lg font-medium transition-colors',
                activo
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <span>
                <span className="font-bold tabular-nums">
                  {o.receiptNumber}
                </span>{' '}
                <span className="text-muted-foreground">|</span> {o.client.name}{' '}
                <span className="text-muted-foreground">({o.client.sede})</span>
              </span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Proceso {formatDate(o.processDate)}</span>
                <Badge tone={statusTone[o.status]}>
                  {statusLabels[o.status as DispatchOrderStatus]}
                </Badge>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CanalesTab({
  selected,
  guia,
  setGuia,
  lote,
  setLote,
  identificacion,
  setIdentificacion,
  cava,
  setCava,
  registros,
  totalKg,
  buffer,
  setBuffer,
  onColocar,
  onRegistrar,
}: {
  selected: CanalReceipt | null;
  guia: string;
  setGuia: (v: string) => void;
  lote: string;
  setLote: (v: string) => void;
  identificacion: string;
  setIdentificacion: (v: string) => void;
  cava: number | null;
  setCava: (v: number) => void;
  registros: CanalRegistro[];
  totalKg: number;
  buffer: string;
  setBuffer: (v: string) => void;
  onColocar: (setter: (v: string) => void) => void;
  onRegistrar: (cava: number, pesoKg: number) => void;
}) {
  function press(k: string) {
    if (k === 'C') return setBuffer('');
    if (k === '.' && buffer.includes('.')) return;
    setBuffer((buffer + k).replace(/[^0-9.]/g, ''));
  }

  // Coloca el peso digitado en la cava tocada y limpia el panel. Sin peso, solo la selecciona.
  function colocarEnCava(c: number) {
    const v = Number(buffer.replace(',', '.'));
    if (buffer.trim() !== '' && Number.isFinite(v) && v > 0) {
      onRegistrar(c, v);
      setBuffer('');
    } else {
      setCava(c);
    }
  }

  if (!selected)
    return (
      <div className="flex flex-col items-center gap-2 p-14 text-center text-muted-foreground">
        <PackageSearch className="size-8 opacity-50" />
        <p className="text-sm font-medium">Selecciona una orden</p>
        <p className="text-sm">
          Elegí una orden en la pestaña ORDENES para empezar a recibir canales.
        </p>
      </div>
    );

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'C'];

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Guía / Lote / Identificación */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <FieldBox label="No. de Guía:">
          <input
            value={guia}
            onChange={(e) => setGuia(e.target.value)}
            onClick={() => onColocar(setGuia)}
            className="h-9 w-full bg-transparent text-lg font-semibold outline-none"
          />
        </FieldBox>
        <FieldBox label="Lote (Orden Sacrificio):">
          <input
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            onClick={() => onColocar(setLote)}
            className="h-9 w-full bg-transparent text-lg font-semibold outline-none"
          />
        </FieldBox>
        <FieldBox label="Identificación:">
          <input
            value={identificacion}
            onChange={(e) => setIdentificacion(e.target.value)}
            onClick={() => onColocar(setIdentificacion)}
            className="h-9 w-full bg-transparent text-lg font-semibold outline-none"
          />
        </FieldBox>
      </div>

      {/* Cavas */}
      <FieldBox label="Cavas de Canales:">
        <div className="flex flex-wrap gap-2 py-0.5">
          {CAVAS.map((c) => (
            <button
              key={c}
              onClick={() => colocarEnCava(c)}
              className={cn(
                'min-w-24 rounded-sm border-2 px-4 py-2 text-base font-semibold transition-colors',
                cava === c
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              CAVA {c}
            </button>
          ))}
        </div>
      </FieldBox>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_300px]">
        {/* Carne en canal: producto que se está recibiendo */}
        <div className="relative min-h-[220px] rounded-sm border-2 border-border">
          <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
            Carne en canal:
          </span>
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-1">
            <span className="text-3xl font-bold uppercase tracking-wide">
              Carne en canal
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {registros.length} canales · {totalKg.toFixed(2)} kg
            </span>
          </div>
        </div>

        {/* Materia prima + teclado */}
        <div className="flex flex-col gap-2">
          <FieldBox label="Materia Prima:">
            <div className="flex h-11 flex-col justify-center">
              <span className="text-base font-bold uppercase">
                Carne en canal
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {registros.length} canales · {totalKg.toFixed(2)} kg
              </span>
            </div>
          </FieldBox>

          <FieldBox label="Digitado (kg):">
            <div className="flex h-9 items-center justify-center text-2xl font-bold tabular-nums text-emerald-700">
              {buffer || <span className="text-muted-foreground/40">0.00</span>}
            </div>
          </FieldBox>

          <div className="grid grid-cols-3 gap-1.5">
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className={cn(
                  'rounded-sm border-2 border-border bg-card py-2 text-xl font-bold transition-colors hover:bg-muted',
                  k === 'C' && 'text-red-600',
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Digitá el peso y tocá la cava donde va el canal.
          </p>
        </div>
      </div>
    </div>
  );
}

function TotalesTab({
  registros,
  totalKg,
  onEliminar,
}: {
  registros: CanalRegistro[];
  totalKg: number;
  onEliminar: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const porCava = CAVAS.map((c) => {
    const items = registros.filter((r) => r.cava === c);
    const kg = items.reduce((s, r) => s + r.pesoKg, 0);
    return { cava: c, count: items.length, kg };
  }).filter((c) => c.count > 0);

  function eliminar() {
    if (!sel) return;
    onEliminar(sel);
    setSel(null);
  }

  return (
    <div className="flex h-full flex-col gap-2 px-2 pb-2 pt-4">
      {/* Registros x Piezas + acciones */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto] gap-2">
        <div className="relative min-h-[200px] rounded-sm border-2 border-border">
          <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
            Registros x Piezas:
          </span>
          {registros.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sin registros.
            </div>
          ) : (
            <ul className="absolute inset-0 divide-y divide-border overflow-auto p-1 pt-2">
              {registros
                .slice()
                .reverse()
                .map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSel(r.id === sel ? null : r.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors',
                        sel === r.id ? 'bg-sky-100' : 'hover:bg-muted/50',
                      )}
                    >
                      <span className="font-semibold tabular-nums">
                        #{r.codigo}
                      </span>
                      <span className="text-muted-foreground">
                        CAVA {r.cava}
                      </span>
                      <span className="text-muted-foreground">{r.hora}</span>
                      <span className="font-bold text-emerald-700 tabular-nums">
                        {r.pesoKg.toFixed(2)} kg
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col gap-2">
          <AccionBtn title="Refrescar" onClick={() => setSel(null)}>
            <RefreshCw className="size-6" />
          </AccionBtn>
          <AccionBtn
            title="Reimprimir rótulo"
            disabled={!sel}
            onClick={() => window.print()}
          >
            <Tag className="size-6" />
          </AccionBtn>
          <AccionBtn title="Imprimir" onClick={() => window.print()}>
            <Printer className="size-6" />
          </AccionBtn>
          <AccionBtn
            title="Eliminar registro"
            disabled={!sel}
            onClick={eliminar}
          >
            <Trash2 className="size-6 text-red-600" />
          </AccionBtn>
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="relative rounded-sm border-2 border-border p-2">
          <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
            Total (Referencia):
          </span>
          {porCava.length === 0 ? (
            <div className="flex h-16 items-center text-sm text-muted-foreground">
              —
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 py-1 text-sm sm:grid-cols-3">
              {porCava.map((c) => (
                <li key={c.cava} className="flex justify-between gap-2">
                  <span className="font-medium">CAVA {c.cava}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.count} · {c.kg.toFixed(2)} kg
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex w-40 flex-col gap-2">
          <FieldBox label="Total (Pza):">
            <div className="flex h-9 items-center justify-end text-2xl font-bold tabular-nums">
              {registros.length}
            </div>
          </FieldBox>
          <FieldBox label="Total (kg):">
            <div className="flex h-9 items-center justify-end text-2xl font-bold tabular-nums text-emerald-700">
              {totalKg.toFixed(2)}
            </div>
          </FieldBox>
        </div>
      </div>
    </div>
  );
}

function AccionBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex size-14 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}

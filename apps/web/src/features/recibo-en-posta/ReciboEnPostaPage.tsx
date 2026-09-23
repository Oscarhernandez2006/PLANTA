import { useMemo, useState } from 'react';
import { Barcode, Calculator, Check, Gauge, LoaderCircle, PackageSearch, Printer, Trash2 } from 'lucide-react';
import { PostaReciboIcon } from '@/components/icons/PostaReciboIcon';
import { useBascula } from '@/components/bascula/Bascula';
import { Badge } from '@/components/ui/badge';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn, formatDate } from '@/lib/utils';
import {
  statusLabels,
  statusTone,
  usePostaReceipts,
  usePostaReceiptItems,
  useCreatePostaReceiptItem,
  useDeletePostaReceiptItem,
  formatRP,
  type PostaReceipt,
  type DispatchOrderStatus,
} from '../recibo-posta/api';
import { useProducts, type Product } from '../products/api';

type Tab = 'ordenes' | 'productos' | 'registro' | 'informe' | 'etiquetado' | 'reporte';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ordenes', label: 'ORDENES' },
  { key: 'productos', label: 'PRODUCTOS' },
  { key: 'registro', label: 'REGISTRO' },
  { key: 'informe', label: 'INFORME' },
  { key: 'etiquetado', label: 'ETIQUETADO' },
  { key: 'reporte', label: 'REPORTE' },
];

const TARAS_FRECUENTES = [0.9, 1.0, 1.45, 1.8, 2.05, 2.35];

export function ReciboEnPostaPage() {
  const [tab, setTab] = useState<Tab>('ordenes');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedOrder, setSelectedOrder] = useState<PostaReceipt | null>(null);
  const selectedId = selectedOrder?.id ?? null;
  const [productoSel, setProductoSel] = useState<Product | null>(null);

  const receipts = usePostaReceipts({ page, pageSize });
  const lista = receipts.data?.data ?? [];
  const cliente = selectedOrder
    ? `${selectedOrder.client.name} (${selectedOrder.client.sede})`
    : '';

  function seleccionarOrden(o: PostaReceipt) {
    setSelectedOrder(o);
    setTab('productos');
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-none flex-col gap-2 p-2">
      {/* Encabezado */}
      <div className="flex shrink-0 items-stretch gap-2">
        <div className="flex items-center justify-center rounded-sm border-2 border-border bg-card p-2">
          <PostaReciboIcon className="size-10" />
        </div>
        <FieldBox label="Orden No.:">
          <div className="flex h-9 min-w-20 items-center text-lg font-bold tabular-nums">
            {selectedOrder ? formatRP(selectedOrder.receiptNumber) : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Proveedor / Cliente:" className="flex-1">
          <div className="flex h-9 items-center truncate text-xl font-bold uppercase">
            {cliente || '—'}
          </div>
        </FieldBox>
      </div>

      {/* Pestañas */}
      <div className="flex shrink-0 overflow-hidden rounded-sm border-2 border-border">
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
      <div className="min-h-0 flex-1 overflow-auto rounded-sm border-2 border-border bg-card">
        {tab === 'ordenes' && (
          <OrdenesTab
            loading={receipts.isLoading}
            ordenes={lista}
            selectedId={selectedId}
            onSelect={seleccionarOrden}
            page={page}
            totalPages={receipts.data?.pagination.totalPages ?? 1}
            onPageChange={setPage}
          />
        )}
        {tab === 'productos' && (
          <ProductosTab
            onSelect={(p) => {
              setProductoSel(p);
              setTab('registro');
            }}
          />
        )}
        {tab === 'registro' && (
          <RegistroTab selectedOrder={selectedOrder} producto={productoSel} />
        )}
        {tab === 'informe' && <InformeTab selectedOrder={selectedOrder} />}
        {tab === 'etiquetado' && (
          <EtiquetadoTab selectedOrder={selectedOrder} producto={productoSel} />
        )}
        {tab === 'reporte' && <ReporteTab selectedOrder={selectedOrder} />}
      </div>
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
  page,
  totalPages,
  onPageChange,
}: {
  loading: boolean;
  ordenes: PostaReceipt[];
  selectedId: string | null;
  onSelect: (o: PostaReceipt) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
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
          Registrá la primera en “Orden recibo en posta”.
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-2 p-2">
      <ul className="flex flex-col gap-2">
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
                    {formatRP(o.receiptNumber)}
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 pt-1">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-sm border-2 border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-sm border-2 border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductosTab({ onSelect }: { onSelect: (p: Product) => void }) {
  const [search, setSearch] = useState('');
  const keyboard = useKeyboard();
  const products = useProducts(search);
  const rows: Product[] = products.data ?? [];

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <FieldBox label="Consultar:">
        <KeyboardField>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onDoubleClick={keyboard.open}
            placeholder="Nombre del producto…"
            className="h-9 w-full bg-transparent pr-10 text-lg font-semibold outline-none"
          />
        </KeyboardField>
      </FieldBox>

      <div className="flex-1 overflow-auto rounded-sm border-2 border-border">
        {products.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" /> Cargando…
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-2 p-14 text-center text-muted-foreground">
            <PackageSearch className="size-8 opacity-50" />
            <p className="text-sm font-medium">
              {search
                ? `Sin productos con «${search}»`
                : 'Sin productos en el catálogo'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="text-lg font-semibold uppercase tracking-wide">
                    {p.nombre}
                  </span>
                  <span className="rounded-sm border-2 border-border bg-muted/40 px-2 py-1 text-sm font-bold tabular-nums text-muted-foreground">
                    {p.codigo}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RegistroTab({
  selectedOrder,
  producto,
}: {
  selectedOrder: PostaReceipt | null;
  producto: Product | null;
}) {
  const selectedId = selectedOrder?.id ?? null;
  const itemsQuery = usePostaReceiptItems(selectedId);
  const crearItem = useCreatePostaReceiptItem(selectedId);
  const eliminarItem = useDeletePostaReceiptItem(selectedId);
  const registros = itemsQuery.data ?? [];

  const [taraKg, setTaraKg] = useState('0.00');
  const [piezas, setPiezas] = useState('0');
  const [empaques, setEmpaques] = useState('0');
  const [buffer, setBuffer] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { peso: brutoKg, setPeso: setBrutoKg, leyendo, error, leerBascula } = useBascula('0.00');

  const tara = Number(taraKg.replace(',', '.')) || 0;
  const bruto = Number(brutoKg.replace(',', '.')) || 0;
  const neto = Math.max(bruto - tara, 0);
  const puedeGuardar = !!selectedOrder && !!producto && bruto > 0 && !crearItem.isPending;

  function press(k: string) {
    if (k === 'C') {
      setBuffer('');
      return;
    }
    if (k === '+') {
      colocar('bruto');
      return;
    }
    if (k === '.' && buffer.includes('.')) return;
    setBuffer((buffer + k).replace(/[^0-9.]/g, ''));
  }

  function colocar(campo: 'tara' | 'bruto' | 'piezas' | 'empaques') {
    // Buffer vacío (tras C) borra el valor actual del campo en vez de no hacer nada.
    if (buffer.trim() === '') {
      if (campo === 'tara') setTaraKg('0.00');
      else if (campo === 'bruto') setBrutoKg('0.00');
      else if (campo === 'piezas') setPiezas('0');
      else setEmpaques('0');
      return;
    }
    if (campo === 'tara') setTaraKg(buffer);
    else if (campo === 'bruto') setBrutoKg(buffer);
    else if (campo === 'piezas') setPiezas(buffer);
    else setEmpaques(buffer);
    setBuffer('');
  }

  function guardar() {
    if (!selectedId || !producto || crearItem.isPending) return;
    if (bruto <= 0) {
      setSaveError('Ingresa el peso bruto (kg).');
      return;
    }
    setSaveError(null);
    crearItem.mutate(
      { productId: producto.id, taraKg: tara, brutoKg: bruto },
      {
        onSuccess: (item) => {
          setNotice(
            `Registrado ${producto.nombre} · Neto ${Number(item.netoKg).toFixed(2)} kg.`,
          );
          window.setTimeout(() => setNotice(null), 3000);
          setBrutoKg('0.00');
          setBuffer('');
        },
        onError: () => setSaveError('No se pudo guardar el registro.'),
      },
    );
  }

  function limpiar() {
    setTaraKg('0.00');
    setBrutoKg('0.00');
    setEmpaques('0');
    setBuffer('');
    setSaveError(null);
  }

  if (!selectedOrder)
    return (
      <div className="flex flex-col items-center gap-2 p-14 text-center text-muted-foreground">
        <PackageSearch className="size-8 opacity-50" />
        <p className="text-sm font-medium">Selecciona una orden</p>
        <p className="text-sm">
          Elegí una orden en la pestaña ORDENES para empezar a registrar.
        </p>
      </div>
    );

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '+'];

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_auto]">
        <FieldBox label="Código:">
          <div className="flex h-9 items-center text-lg font-bold tabular-nums">
            {producto?.codigo ?? '—'}
          </div>
        </FieldBox>
        <FieldBox label="Producto:">
          <div className="flex h-9 items-center truncate text-lg font-bold uppercase">
            {producto?.nombre ?? 'Elegí un producto en PRODUCTOS'}
          </div>
        </FieldBox>
        <FieldBox label="Piezas:" className="sm:w-32">
          <input
            value={piezas}
            onChange={(e) => setPiezas(e.target.value.replace(/[^0-9]/g, ''))}
            onClick={() => colocar('piezas')}
            inputMode="numeric"
            className="h-9 w-full bg-transparent text-right text-2xl font-bold tabular-nums outline-none"
          />
        </FieldBox>
      </div>

      <div className="grid min-h-0 flex-1 items-stretch grid-cols-1 gap-2 lg:grid-cols-[1fr_260px]">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-stretch gap-2">
            <FieldBox label="Taras Frecuentes:" className="flex-1">
              <div className="flex flex-wrap items-stretch gap-2 py-0.5">
                {TARAS_FRECUENTES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTaraKg(t.toFixed(2))}
                    className={cn(
                      'min-w-16 rounded-sm border-2 px-3 py-2 text-base font-semibold transition-colors',
                      tara === t
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-border bg-card hover:bg-muted/50',
                    )}
                  >
                    {t.toFixed(2)}
                  </button>
                ))}
              </div>
            </FieldBox>
            <FieldBox label="Tara(kg):" className="w-28">
              <input
                value={taraKg}
                onChange={(e) => setTaraKg(e.target.value.replace(/[^0-9.]/g, ''))}
                onClick={() => colocar('tara')}
                inputMode="decimal"
                className="h-9 w-full bg-transparent text-right text-2xl font-bold tabular-nums outline-none"
              />
            </FieldBox>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-sm border-2 border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Producto</th>
                  <th className="px-2 py-1.5 text-right">Tara</th>
                  <th className="px-2 py-1.5 text-right">Bruto</th>
                  <th className="px-2 py-1.5 text-right">Neto</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!registros.length ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">
                      Sin registros aún.
                    </td>
                  </tr>
                ) : (
                  registros.map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-1.5 tabular-nums">{r.codigo}</td>
                      <td className="px-2 py-1.5 uppercase">{r.product.nombre}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.taraKg).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.brutoKg).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{Number(r.netoKg).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => eliminarItem.mutate(r.id)}
                          title="Eliminar registro"
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-auto">
          <div className="flex h-12 items-center justify-end rounded-sm border-2 border-border bg-card px-3 text-3xl font-bold tabular-nums">
            {buffer || '0'}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className="rounded-sm border-2 border-border bg-card py-2 text-xl font-bold transition-colors hover:bg-muted"
              >
                {k}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-1.5">
            <button
              onClick={() => setBuffer('')}
              className="rounded-sm border-2 border-border bg-card py-2 px-4 text-xl font-bold text-red-600 transition-colors hover:bg-muted"
            >
              C
            </button>
            <button
              onClick={guardar}
              disabled={!puedeGuardar}
              title="Guardar registro"
              className="flex items-center justify-center gap-2 rounded-sm border-2 border-border bg-card py-2 text-sm font-semibold uppercase transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Check className="size-5" /> Guardar
            </button>
          </div>

          <div className="flex items-stretch gap-2">
            <FieldBox label="Báscula:" className="flex-1">
              <div className="flex h-9 items-center justify-end text-xl font-bold tabular-nums">
                {registros.length}
              </div>
            </FieldBox>
            <button
              onClick={limpiar}
              title="Limpiar captura"
              className="flex w-9 shrink-0 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <FieldBox label="Empaques (und):">
            <input
              value={empaques}
              onChange={(e) => setEmpaques(e.target.value.replace(/[^0-9]/g, ''))}
              onClick={() => colocar('empaques')}
              inputMode="numeric"
              className="h-9 w-full bg-transparent text-right text-xl font-bold tabular-nums outline-none"
            />
          </FieldBox>
          <FieldBox label="Bruto (kg):">
            <div className="flex h-9 items-center gap-1.5">
              <input
                value={brutoKg}
                onChange={(e) => setBrutoKg(e.target.value.replace(/[^0-9.]/g, ''))}
                onDoubleClick={leerBascula}
                disabled={leyendo}
                title="Doble clic para leer báscula"
                inputMode="decimal"
                className="h-9 w-full bg-transparent text-right text-xl font-bold text-red-600 outline-none disabled:opacity-60"
              />
              {leyendo && <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />}
            </div>
          </FieldBox>
          <FieldBox label="Neto (kg):">
            <div className="flex h-9 items-center justify-end text-xl font-bold tabular-nums text-emerald-700">
              {neto.toFixed(2)}
            </div>
          </FieldBox>
          <p className="text-center text-xs text-muted-foreground">
            Digitá y tocá Tara para colocar el valor. Tocá Bruto para leer la báscula.
          </p>
          {notice && (
            <p className="rounded-sm border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-700">
              {notice}
            </p>
          )}
          {(error || saveError) && (
            <p className="text-center text-xs font-medium text-red-600">{error || saveError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InformeTab({ selectedOrder }: { selectedOrder: PostaReceipt | null }) {
  const selectedId = selectedOrder?.id ?? null;
  const itemsQuery = usePostaReceiptItems(selectedId);
  const registros = itemsQuery.data ?? [];

  const resumen = useMemo(() => {
    const porProducto = new Map<
      string,
      { codigo: string; nombre: string; piezas: number; tara: number; bruto: number; neto: number }
    >();
    for (const r of registros) {
      const actual = porProducto.get(r.product.id) ?? {
        codigo: r.product.codigo,
        nombre: r.product.nombre,
        piezas: 0,
        tara: 0,
        bruto: 0,
        neto: 0,
      };
      actual.piezas += 1;
      actual.tara += Number(r.taraKg);
      actual.bruto += Number(r.brutoKg);
      actual.neto += Number(r.netoKg);
      porProducto.set(r.product.id, actual);
    }
    return [...porProducto.values()];
  }, [registros]);

  const totalKg = resumen.reduce((acc, p) => acc + p.neto, 0);

  if (!selectedOrder)
    return (
      <div className="flex flex-col items-center gap-2 p-14 text-center text-muted-foreground">
        <PackageSearch className="size-8 opacity-50" />
        <p className="text-sm font-medium">Selecciona una orden</p>
        <p className="text-sm">
          Elegí una orden en la pestaña ORDENES para ver su informe.
        </p>
      </div>
    );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="min-h-0 flex-1 overflow-auto rounded-sm border-2 border-border">
        {itemsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" /> Cargando…
          </div>
        ) : !resumen.length ? (
          <div className="flex flex-col items-center gap-2 p-14 text-center text-muted-foreground">
            <PackageSearch className="size-8 opacity-50" />
            <p className="text-sm font-medium">Sin registros aún.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Código</th>
                <th className="px-2 py-1.5 text-left">Producto</th>
                <th className="px-2 py-1.5 text-right">Piezas</th>
                <th className="px-2 py-1.5 text-right">Tara</th>
                <th className="px-2 py-1.5 text-right">Bruto</th>
                <th className="px-2 py-1.5 text-right">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resumen.map((p) => (
                <tr key={p.codigo}>
                  <td className="px-2 py-1.5 tabular-nums">{p.codigo}</td>
                  <td className="px-2 py-1.5 uppercase">{p.nombre}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.piezas}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.tara.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.bruto.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-700">
                    {p.neto.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-stretch gap-2">
        <FieldBox label="Referencias:" className="flex-1">
          <div className="flex h-9 items-center justify-end text-xl font-bold tabular-nums">
            {resumen.length}
          </div>
        </FieldBox>
        <FieldBox label="Total(kg):" className="flex-1">
          <div className="flex h-9 items-center justify-end text-xl font-bold tabular-nums">
            {totalKg.toFixed(2)}
          </div>
        </FieldBox>
      </div>
    </div>
  );
}

interface EtiquetaRegistrada {
  barcode: string;
  fecha: string;
  producto: string;
  codigo: string;
  empaque: string;
  cantidad: number;
  conservacion: 'congelado' | 'refrigerado';
}

const CONSERVACION_LABEL: Record<EtiquetaRegistrada['conservacion'], string> = {
  congelado: 'CONGELADO -18 °C A -25 °C',
  refrigerado: 'REFRIGERADO 0 °C A 4 °C',
};

function EtiquetadoTab({
  selectedOrder,
  producto,
}: {
  selectedOrder: PostaReceipt | null;
  producto: Product | null;
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [sacrificio, setSacrificio] = useState(() => new Date().toISOString().slice(0, 10));
  const [empaque, setEmpaque] = useState(() => new Date().toISOString().slice(0, 10));
  const [sacrificioTocado, setSacrificioTocado] = useState(false);
  const [empaqueTocado, setEmpaqueTocado] = useState(false);
  const [vencimiento, setVencimiento] = useState('');
  const [dias, setDias] = useState('');
  const [lote, setLote] = useState('');
  const [conservacion, setConservacion] = useState<EtiquetaRegistrada['conservacion']>('congelado');
  const [imprimir, setImprimir] = useState(true);
  const [etiquetas, setEtiquetas] = useState<EtiquetaRegistrada[]>([]);

  const { peso: cantidad, setPeso: setCantidad, leyendo, error, leerBascula } = useBascula('0.00');

  // Mientras no se editen a mano, Sacrificio y Empaque siguen a Fecha.
  function cambiarFecha(valor: string) {
    setFecha(valor);
    if (!sacrificioTocado) setSacrificio(valor);
    if (!empaqueTocado) setEmpaque(valor);
  }

  function calcularVencimiento() {
    const dNum = Number(dias);
    if (!empaque || !dNum) return;
    const base = new Date(`${empaque}T00:00:00`);
    base.setDate(base.getDate() + dNum);
    setVencimiento(base.toISOString().slice(0, 10));
  }

  function alternarConservacion() {
    setConservacion((c) => (c === 'congelado' ? 'refrigerado' : 'congelado'));
  }

  function registrarEtiqueta() {
    if (!producto) return;
    const ts = Date.now().toString(36).toUpperCase();
    const nueva: EtiquetaRegistrada = {
      barcode: `ET${ts}`,
      fecha,
      producto: producto.nombre,
      codigo: producto.codigo,
      empaque,
      cantidad: Number(cantidad.replace(',', '.')) || 0,
      conservacion,
    };
    setEtiquetas((prev) => [nueva, ...prev]);
  }

  function limpiarFormulario() {
    const hoy = new Date().toISOString().slice(0, 10);
    setSacrificio(hoy);
    setEmpaque(hoy);
    setSacrificioTocado(false);
    setEmpaqueTocado(false);
    setVencimiento('');
    setDias('');
    setCantidad('0.00');
    setLote('');
  }

  const unidades = etiquetas.length;
  const totalNeto = etiquetas.reduce((acc, e) => acc + e.cantidad, 0);
  const ultima = etiquetas[0];

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <FieldBox label="Fecha:">
          <input
            type="date"
            value={fecha}
            onChange={(e) => cambiarFecha(e.target.value)}
            className="h-9 w-full bg-transparent text-lg font-bold tabular-nums outline-none"
          />
        </FieldBox>
        <FieldBox label="Código:">
          <div className="flex h-9 items-center text-lg font-bold tabular-nums">
            {producto?.codigo ?? '—'}
          </div>
        </FieldBox>
        <FieldBox label="Producto:">
          <div className="flex h-9 items-center truncate text-lg font-bold uppercase">
            {producto?.nombre ?? 'Elegí un producto en PRODUCTOS'}
          </div>
        </FieldBox>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto_1fr_auto]">
        <FieldBox label="Sacrificio:">
          <input
            type="date"
            value={sacrificio}
            onChange={(e) => {
              setSacrificio(e.target.value);
              setSacrificioTocado(true);
            }}
            className="h-9 w-full bg-transparent text-sm font-semibold outline-none [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </FieldBox>
        <FieldBox label="Empaque:">
          <input
            type="date"
            value={empaque}
            onChange={(e) => {
              setEmpaque(e.target.value);
              setEmpaqueTocado(true);
            }}
            className="h-9 w-full bg-transparent text-sm font-semibold outline-none [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </FieldBox>
        <FieldBox label="Vencimiento:">
          <input
            type="date"
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
            className="h-9 w-full bg-transparent text-sm font-semibold outline-none"
          />
        </FieldBox>
        <FieldBox label="Días:" className="w-20">
          <input
            value={dias}
            onChange={(e) => setDias(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className="h-9 w-full bg-transparent text-right text-sm font-semibold tabular-nums outline-none"
          />
        </FieldBox>
        <button
          onClick={calcularVencimiento}
          title="Calcular vencimiento (Empaque + Días)"
          className="flex size-9 shrink-0 items-center justify-center self-end rounded-sm border-2 border-border bg-card hover:bg-muted"
        >
          <Calculator className="size-4" />
        </button>
        <FieldBox label="Cant.(kg):">
          <input
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/[^0-9.]/g, ''))}
            onClick={leerBascula}
            disabled={leyendo}
            inputMode="decimal"
            className="h-9 w-full bg-transparent text-right text-lg font-bold tabular-nums outline-none disabled:opacity-60"
          />
        </FieldBox>
        <div className="flex shrink-0 items-end gap-1.5">
          <button
            onClick={leerBascula}
            title="Leer báscula"
            className="flex size-9 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted"
          >
            <Gauge className="size-4" />
          </button>
          <button
            onClick={alternarConservacion}
            title="Alternar conservación (Congelado / Refrigerado)"
            className="flex size-9 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted"
          >
            <Barcode className="size-4" />
          </button>
          <button
            onClick={registrarEtiqueta}
            disabled={!producto}
            title="Registrar e imprimir etiqueta"
            className="flex size-9 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
          >
            <Printer className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FieldBox label="Lote:">
          <input
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            className="h-9 w-full bg-transparent text-lg font-bold tabular-nums outline-none"
          />
        </FieldBox>
        <FieldBox label="Conservación:">
          <div
            onDoubleClick={alternarConservacion}
            title="Doble clic para alternar Congelado / Refrigerado"
            className="flex h-9 cursor-pointer items-center justify-center text-center text-lg font-bold select-none"
          >
            {CONSERVACION_LABEL[conservacion]}
          </div>
        </FieldBox>
      </div>

      <FieldBox label="Producto Etiquetado:" className="flex min-h-0 flex-1 flex-col">
        <label className="flex shrink-0 items-center gap-2 pb-1 text-sm font-medium text-emerald-700">
          <input
            type="checkbox"
            checked={imprimir}
            onChange={(e) => setImprimir(e.target.checked)}
            className="size-4"
          />
          Imprimir Etiqueta de Producto.
        </label>
        <div className="min-h-24 flex-1 overflow-auto rounded-sm border border-border">
          {!etiquetas.length ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Sin etiquetas registradas aún.
            </div>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {etiquetas.map((e) => (
                <li key={e.barcode} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate">
                    {e.fecha} · {e.codigo} {e.producto} · Empaque {e.empaque || '—'}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-emerald-700">
                    {e.cantidad.toFixed(2)} kg
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="shrink-0 pt-1 text-xs font-medium text-red-600">{error}</p>}
      </FieldBox>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_1fr_1fr]">
        <button
          onClick={limpiarFormulario}
          title="Limpiar formulario"
          className="flex w-9 shrink-0 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted"
        >
          <Trash2 className="size-4" />
        </button>
        <FieldBox label="Unds:">
          <div className="flex h-9 items-center justify-end text-lg font-bold tabular-nums">{unidades}</div>
        </FieldBox>
        <FieldBox label="Total Neto(Kg):">
          <div className="flex h-9 items-center justify-end text-lg font-bold tabular-nums">
            {totalNeto.toFixed(2)}
          </div>
        </FieldBox>
        <FieldBox label="Ultima Etiqueta:">
          <div className="flex h-9 items-center truncate text-sm font-semibold tabular-nums">
            {ultima?.barcode ?? '—'}
          </div>
        </FieldBox>
        <FieldBox label="Ultimo Empaque:">
          <div className="flex h-9 items-center truncate text-sm font-semibold">
            {ultima?.empaque || '—'}
          </div>
        </FieldBox>
      </div>
    </div>
  );
}

function ReporteTab({ selectedOrder }: { selectedOrder: PostaReceipt | null }) {
  const selectedId = selectedOrder?.id ?? null;
  const itemsQuery = usePostaReceiptItems(selectedId);
  const registros = itemsQuery.data ?? [];

  const reciboVol = registros.reduce((acc, r) => acc + Number(r.brutoKg), 0);
  const ingresoEmpaque = registros.reduce((acc, r) => acc + Number(r.netoKg), 0);
  const merma = reciboVol - ingresoEmpaque;
  const mermaPct = reciboVol > 0 ? (merma / reciboVol) * 100 : 0;

  if (!selectedOrder)
    return (
      <div className="flex flex-col items-center gap-2 p-14 text-center text-muted-foreground">
        <PackageSearch className="size-8 opacity-50" />
        <p className="text-sm font-medium">Selecciona una orden</p>
        <p className="text-sm">
          Elegí una orden en la pestaña ORDENES para ver su reporte.
        </p>
      </div>
    );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <FieldBox label="Materia Prima Ingresada:" className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-24 flex-1 overflow-auto rounded-sm border border-border">
          {itemsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" /> Cargando…
            </div>
          ) : !registros.length ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Sin registros aún.
            </div>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {registros.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate">
                    {r.codigo} · {r.product.nombre.toUpperCase()} · Tara {Number(r.taraKg).toFixed(2)} kg
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-emerald-700">
                    {Number(r.brutoKg).toFixed(2)} kg
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FieldBox>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <FieldBox label="Recibo x Vol(Kg):">
          <div className="flex h-9 items-center justify-center text-2xl font-bold tabular-nums text-blue-700">
            {reciboVol.toFixed(2)}
          </div>
        </FieldBox>
        <FieldBox label="Ingreso x Empaque(Kg):">
          <div className="flex h-9 items-center justify-center text-2xl font-bold tabular-nums text-emerald-700">
            {ingresoEmpaque.toFixed(2)}
          </div>
        </FieldBox>
        <FieldBox label="Merma(Kg | %):">
          <div className="flex h-9 items-center justify-center gap-1 text-2xl font-bold tabular-nums text-red-600">
            {merma.toFixed(2)} <span className="text-base font-semibold">| {mermaPct.toFixed(1)}%</span>
          </div>
        </FieldBox>
      </div>
    </div>
  );
}

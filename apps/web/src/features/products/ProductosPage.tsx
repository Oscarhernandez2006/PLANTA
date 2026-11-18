import { Fragment, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleOff,
  FileSpreadsheet,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CATEGORIAS_PRODUCTO,
  useCreateProduct,
  useExistenciasProductos,
  useFichaProducto,
  useNextProductCode,
  useProductsAdmin,
  useUpdateProduct,
  type Product,
} from './api';

type ProductoFila = Required<Product>;
type Orden = { campo: 'codigo' | 'nombre' | 'categoria' | 'kg'; asc: boolean };

function mensajeError(err: unknown, porDefecto: string) {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
}

const kg = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO') : '—');
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Código de producto dentro del código de barras de una etiqueta: OP (7) + producto + pieza (4). */
function codigoDeBarcode(q: string) {
  return /^\d{12,}$/.test(q) ? q.slice(7, -4) : null;
}

export function ProductosPage() {
  const productos = useProductsAdmin('');
  const existencias = useExistenciasProductos();
  const rows = productos.data ?? [];
  const [agregando, setAgregando] = useState(false);
  const [editando, setEditando] = useState<ProductoFila | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [estado, setEstado] = useState<'todos' | 'activos' | 'inactivos'>('activos');
  const [agrupar, setAgrupar] = useState(true);
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  const [orden, setOrden] = useState<Orden>({ campo: 'codigo', asc: true });
  const [exportando, setExportando] = useState(false);

  const stock = useMemo(() => new Map((existencias.data ?? []).map((e) => [e.productId, e])), [existencias.data]);

  const categorias = useMemo(() => {
    const extras = rows
      .map((p) => p.categoria)
      .filter((c): c is string => !!c && !CATEGORIAS_PRODUCTO.includes(c));
    return [...CATEGORIAS_PRODUCTO, ...new Set(extras)];
  }, [rows]);

  const q = busqueda.trim();
  const codigoBarras = codigoDeBarcode(q);
  const porEstado = rows.filter((p) => estado === 'todos' || (estado === 'activos' ? p.active : !p.active));
  const filtradas = porEstado
    .filter(
      (p) =>
        (!q ||
          (codigoBarras ? p.codigo === codigoBarras : p.codigo.includes(q) || normalizar(p.nombre).includes(normalizar(q)))) &&
        (!filtroCategoria || (p.categoria ?? 'SIN CATEGORÍA') === filtroCategoria),
    )
    .sort((a, b) => {
      const d =
        orden.campo === 'kg'
          ? (stock.get(a.id)?.kg ?? 0) - (stock.get(b.id)?.kg ?? 0)
          : orden.campo === 'codigo'
            ? Number(a.codigo) - Number(b.codigo) || a.codigo.localeCompare(b.codigo)
            : (a[orden.campo] ?? '').localeCompare(b[orden.campo] ?? '');
      return orden.asc ? d : -d;
    });

  const conteo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of porEstado) m.set(p.categoria ?? 'SIN CATEGORÍA', (m.get(p.categoria ?? 'SIN CATEGORÍA') ?? 0) + 1);
    return m;
  }, [porEstado]);

  const grupos = useMemo(() => {
    const m = new Map<string, ProductoFila[]>();
    for (const p of filtradas) {
      const c = p.categoria ?? 'SIN CATEGORÍA';
      m.set(c, [...(m.get(c) ?? []), p]);
    }
    const idx = (c: string) => (categorias.indexOf(c) < 0 ? 99 : categorias.indexOf(c));
    return [...m.entries()].sort((a, b) => idx(a[0]) - idx(b[0]));
  }, [filtradas, categorias]);

  const activos = rows.filter((p) => p.active).length;
  const conStock = rows.filter((p) => (stock.get(p.id)?.unds ?? 0) > 0);
  const kgStock = conStock.reduce((s, p) => s + (stock.get(p.id)?.kg ?? 0), 0);

  const ordenar = (campo: Orden['campo']) =>
    setOrden((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: campo !== 'kg' }));

  async function exportar() {
    setExportando(true);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Productos');
      ws.addRow(['CATÁLOGO DE PRODUCTOS']).font = { bold: true, size: 12 };
      ws.addRow([`Generado ${new Date().toLocaleString('es-CO')}`]).font = { size: 9, italic: true };
      ws.addRow([]);
      const head = ws.addRow(['Código', 'Producto', 'Categoría', 'Estado', 'Und disponibles', 'Kg disponibles']);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6B5C' } }));
      [10, 44, 34, 10, 16, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      for (const p of filtradas) {
        const s = stock.get(p.id);
        ws.addRow([p.codigo, p.nombre, p.categoria ?? '', p.active ? 'ACTIVO' : 'INACTIVO', s?.unds ?? 0, Math.round((s?.kg ?? 0) * 100) / 100]);
      }
      ws.views = [{ state: 'frozen', ySplit: 4 }];
      const url = URL.createObjectURL(
        new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `productos-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  const fila = (p: ProductoFila) => {
    const s = stock.get(p.id);
    return (
      <tr
        key={p.id}
        onClick={() => setFichaId(p.id)}
        title="Ver ficha del producto"
        className={cn('h-11 cursor-pointer transition-colors hover:bg-primary/5 [&>td]:px-3', !p.active && 'text-muted-foreground')}
      >
        <td className="font-semibold tabular-nums">{p.codigo}</td>
        <td className="font-medium uppercase">{p.nombre}</td>
        {!agrupar && <td className="text-xs uppercase text-muted-foreground">{p.categoria ?? '—'}</td>}
        <td>
          {p.active ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Activo</span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inactivo</span>
          )}
        </td>
        <td className="text-right tabular-nums">
          {s?.unds ? (
            <>
              <b>{kg(s.kg)}</b> <span className="text-xs text-muted-foreground">kg · {s.unds} und</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="text-right">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setEditando(p);
            }}
          >
            <Pencil className="size-4" />
            Editar
          </Button>
        </td>
      </tr>
    );
  };

  const columnas = agrupar ? 5 : 6;
  const Th = ({ campo, children, className }: { campo?: Orden['campo']; children: React.ReactNode; className?: string }) => (
    <th className={className}>
      {campo ? (
        <button type="button" onClick={() => ordenar(campo)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
          {children}
          {orden.campo === campo && (orden.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="size-9 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Catálogo de productos usado en Orden de Proceso y en los recibos.</p>
          </div>
        </div>
        <Button size="lg" className="h-10" onClick={() => setAgregando(true)}>
          <Plus className="size-5" />
          Agregar nuevo producto
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icon={Package} titulo="Productos" valor={rows.length} detalle={`${categorias.length} categorías`} />
        <Indicador icon={CircleCheck} titulo="Activos" valor={activos} detalle="Se pueden usar en las órdenes" tono="text-emerald-700" />
        <Indicador icon={CircleOff} titulo="Inactivos" valor={rows.length - activos} detalle="Ocultos en las órdenes" />
        <Indicador icon={Boxes} titulo="Con inventario" valor={conStock.length} detalle={`${kg(kgStock)} kg disponibles en planta`} />
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9 pr-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar código, nombre o barcode…"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {(['activos', 'inactivos', 'todos'] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEstado(e)}
                className={cn(
                  'h-8 rounded-md px-3 text-sm font-semibold capitalize transition-colors',
                  estado === e ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 px-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} />
            Agrupar por categoría
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" className="h-10" onClick={() => void exportar()} disabled={exportando || !filtradas.length}>
              {exportando ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              Excel
            </Button>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => {
                void productos.refetch();
                void existencias.refetch();
              }}
              disabled={productos.isFetching}
              title="Refrescar"
            >
              <RefreshCw className={productos.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              Refrescar
            </Button>
          </div>
        </div>

        <div className="scrollbar-app flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
          <Ficha activa={!filtroCategoria} onClick={() => setFiltroCategoria('')} n={porEstado.length}>
            Todas
          </Ficha>
          {[...categorias, ...(conteo.has('SIN CATEGORÍA') ? ['SIN CATEGORÍA'] : [])]
            .filter((c) => conteo.get(c))
            .map((c) => (
              <Ficha key={c} activa={filtroCategoria === c} onClick={() => setFiltroCategoria(filtroCategoria === c ? '' : c)} n={conteo.get(c) ?? 0}>
                {c.replace(/^RES /, '')}
              </Ficha>
            ))}
        </div>

        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:h-10 [&>th]:px-3">
                <Th campo="codigo" className="w-28">Código</Th>
                <Th campo="nombre">Producto</Th>
                {!agrupar && <Th campo="categoria">Categoría</Th>}
                <Th className="w-28">Estado</Th>
                <Th campo="kg" className="w-52 text-right">En inventario</Th>
                <Th className="w-28 text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {productos.isLoading ? (
                <tr>
                  <td colSpan={columnas} className="py-10 text-center text-muted-foreground">
                    <LoaderCircle className="mx-auto size-6 animate-spin" />
                  </td>
                </tr>
              ) : !filtradas.length ? (
                <tr>
                  <td colSpan={columnas} className="py-10 text-center text-muted-foreground">
                    {q || filtroCategoria ? 'Ningún producto coincide con los filtros.' : 'Aún no hay productos registrados.'}
                  </td>
                </tr>
              ) : agrupar ? (
                grupos.map(([cat, ps]) => {
                  const cerrada = cerradas.has(cat);
                  const kgCat = ps.reduce((s, p) => s + (stock.get(p.id)?.kg ?? 0), 0);
                  return (
                    <Fragment key={cat}>
                      <tr
                        onClick={() =>
                          setCerradas((prev) => {
                            const next = new Set(prev);
                            if (next.has(cat)) next.delete(cat);
                            else next.add(cat);
                            return next;
                          })
                        }
                        className="h-10 cursor-pointer bg-primary/5 hover:bg-primary/10 [&>td]:px-3"
                      >
                        <td colSpan={3} className="font-bold uppercase text-primary">
                          <span className="inline-flex items-center gap-2">
                            {cerrada ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                            {cat}
                            <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{ps.length}</span>
                          </span>
                        </td>
                        <td className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
                          {kgCat > 0 ? `${kg(kgCat)} kg` : ''}
                        </td>
                        <td />
                      </tr>
                      {!cerrada && ps.map(fila)}
                    </Fragment>
                  );
                })
              ) : (
                filtradas.map(fila)
              )}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {filtradas.length} de {rows.length} producto(s){codigoBarras ? ` · barcode → producto ${codigoBarras}` : ''}. Toca un producto para ver su ficha.
        </div>
      </section>

      <AgregarProductoDialog open={agregando} onClose={() => setAgregando(false)} categorias={categorias} />
      {editando && <EditarProductoDialog producto={editando} onClose={() => setEditando(null)} categorias={categorias} />}
      {fichaId && (
        <FichaProductoDialog
          id={fichaId}
          onClose={() => setFichaId(null)}
          onEditar={(p) => {
            setFichaId(null);
            setEditando(p);
          }}
        />
      )}
    </div>
  );
}

function Indicador({
  icon: Icon,
  titulo,
  valor,
  detalle,
  tono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  valor: React.ReactNode;
  detalle: string;
  tono?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {titulo}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', tono)}>{valor}</div>
      <div className="text-xs text-muted-foreground">{detalle}</div>
    </div>
  );
}

function Ficha({ activa, onClick, n, children }: { activa: boolean; onClick: () => void; n: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold uppercase transition-colors',
        activa ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40 hover:bg-primary/5',
      )}
    >
      {children}
      <span className={cn('rounded-full px-1.5 tabular-nums', activa ? 'bg-primary-foreground/20' : 'bg-muted')}>{n}</span>
    </button>
  );
}

/** Ficha del producto: dónde se usa, cuánto hay en planta, producción reciente, precios y reglas de corte. */
function FichaProductoDialog({
  id,
  onClose,
  onEditar,
}: {
  id: string;
  onClose: () => void;
  onEditar: (p: ProductoFila) => void;
}) {
  const { data: f, isLoading, isError } = useFichaProducto(id);
  const actualizar = useUpdateProduct();
  const p = f?.producto;

  return (
    <Dialog
      open
      onClose={onClose}
      title={p ? `${p.codigo} · ${p.nombre}` : 'Ficha del producto'}
      description={p ? `${p.categoria ?? 'Sin categoría'} · creado el ${fecha(p.createdAt)}` : undefined}
      className="max-w-5xl"
      scrollInterno
      acciones={
        p && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-9"
              disabled={actualizar.isPending}
              onClick={() => actualizar.mutate({ id: p.id, active: !p.active })}
              title={p.active ? 'Ocultarlo de las órdenes sin perder su historial' : 'Volver a usarlo en las órdenes'}
            >
              <Power className="size-4" />
              {p.active ? 'Desactivar' : 'Activar'}
            </Button>
            <Button variant="outline" className="h-9" onClick={() => onEditar(p)}>
              <Pencil className="size-4" />
              Editar
            </Button>
          </div>
        )
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : isError || !f || !p ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No se pudo cargar la ficha del producto.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              icon={p.active ? CircleCheck : CircleOff}
              titulo="Estado"
              valor={p.active ? 'Activo' : 'Inactivo'}
              detalle={f.etiquetasTotal ? 'Tiene movimientos: se desactiva, no se borra' : 'Sin movimientos registrados'}
              tono={p.active ? 'text-emerald-700' : 'text-muted-foreground'}
            />
            <Indicador icon={Boxes} titulo="En inventario" valor={`${kg(f.inventario.kg)} kg`} detalle={`${f.inventario.unds} etiquetas disponibles`} />
            <Indicador icon={Package} titulo="Últimos 30 días" valor={`${kg(f.produccion30.kg)} kg`} detalle={`${f.produccion30.unds} etiquetas rotuladas`} />
            <Indicador icon={RefreshCw} titulo="Histórico" valor={f.etiquetasTotal} detalle={`Última etiqueta: ${fecha(f.ultimaEtiqueta)}`} />
          </div>

          <Seccion titulo={`Clientes que lo usan (${f.clientes.length})`} vacio="Ningún cliente tiene configurado este producto.">
            {f.clientes.length > 0 && (
              <TablaFicha
                columnas={['Cliente', 'NIT', 'Tipo', 'PLU / SKU', 'Vida útil', 'Piezas por canal', 'Und por caja']}
                filas={f.clientes.map((c) => [
                  <b className="uppercase">{c.cliente}</b>,
                  c.nit ?? '—',
                  c.tipo,
                  c.refPluSku || '—',
                  `Refrig. ${c.refrigeradoDias} d · Cong. ${c.congeladoDias} d`,
                  c.piezasPorCanal,
                  c.undsPorCaja,
                ])}
              />
            )}
          </Seccion>

          <div className="grid gap-5 lg:grid-cols-2">
            <Seccion titulo="Precios" vacio="No está en ninguna lista de precios.">
              {f.precios.length > 0 && (
                <TablaFicha
                  columnas={['Lista', 'Cliente', 'Vigente desde', '$ / kg']}
                  filas={f.precios.map((x) => [
                    x.lista,
                    x.cliente ?? 'GENERAL',
                    x.vigenteDesde.split('-').reverse().join('/'),
                    <b>{x.precioKg.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}</b>,
                  ])}
                />
              )}
            </Seccion>
            <Seccion titulo="Reglas de corte" vacio="No tiene reglas de corte.">
              {f.reglas.length > 0 && (
                <TablaFicha
                  columnas={['Cliente', 'Retoma', 'Piking', 'Congelación']}
                  filas={f.reglas.map((r) => [
                    r.cliente ?? 'GENERAL',
                    r.retoma ? 'SÍ' : 'NO',
                    r.piking ? 'SÍ' : 'NO',
                    r.congelacion ? (r.kgCongelados != null ? `SÍ · ${kg(r.kgCongelados)} kg` : 'SÍ · todo') : 'NO',
                  ])}
                />
              )}
            </Seccion>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Seccion({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-primary">{titulo}</h3>
      {children || <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{vacio}</p>}
    </section>
  );
}

function TablaFicha({ columnas, filas }: { columnas: string[]; filas: React.ReactNode[][] }) {
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr className="[&>th]:px-3 [&>th]:py-2">
            {columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((f, i) => (
            <tr key={i} className="[&>td]:px-3 [&>td]:py-1.5">
              {f.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoriaSelect({
  id,
  value,
  onChange,
  categorias,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  categorias: string[];
}) {
  return (
    <Select id={id} className="h-9" value={value} onChange={(e) => onChange(e.target.value)}>
      {categorias.map((c, i) => (
        <option key={c} value={c}>
          {String(i).padStart(2, '0')} - {c}
        </option>
      ))}
    </Select>
  );
}

function Mensaje({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  );
}

function AgregarProductoDialog({
  open,
  onClose,
  categorias,
}: {
  open: boolean;
  onClose: () => void;
  categorias: string[];
}) {
  const crear = useCreateProduct();
  const next = useNextProductCode();
  const [categoria, setCategoria] = useState(categorias[0]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    setCategoria(categorias[0]);
    setNombre('');
    setError(null);
    onClose();
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await crear.mutateAsync({ nombre: nombre.trim(), categoria });
      cerrar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo registrar el producto.'));
    }
  }

  return (
    <Dialog open={open} onClose={cerrar} title="Registrar producto">
      <form onSubmit={guardar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="add-categoria">Categoría</Label>
          <CategoriaSelect
            id="add-categoria"
            value={categoria}
            onChange={setCategoria}
            categorias={categorias}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-codigo">Código</Label>
          <Input
            id="add-codigo"
            className="h-9 font-semibold tabular-nums"
            value={next.data?.next ?? '—'}
            disabled
            title="Consecutivo automático: se asigna al guardar."
          />
          <p className="text-xs text-muted-foreground">
            Consecutivo automático: se asigna al guardar.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-nombre">Descripción del producto</Label>
          <Input
            id="add-nombre"
            className="h-9 uppercase"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Descripción del producto"
            maxLength={120}
          />
        </div>
        <Mensaje error={error} />
        <div className="flex justify-center border-t border-border pt-4">
          <Button
            type="submit"
            size="lg"
            className="h-9 px-8"
            disabled={!nombre.trim() || crear.isPending}
          >
            <Save className="size-5" />
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditarProductoDialog({
  producto,
  onClose,
  categorias,
}: {
  producto: ProductoFila;
  onClose: () => void;
  categorias: string[];
}) {
  const actualizar = useUpdateProduct();
  const [categoria, setCategoria] = useState(producto.categoria ?? categorias[0]);
  const [nombre, setNombre] = useState(producto.nombre);
  const [active, setActive] = useState(producto.active);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await actualizar.mutateAsync({
        id: producto.id,
        nombre: nombre.trim(),
        categoria,
        active,
      });
      onClose();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el producto.'));
    }
  }

  return (
    <Dialog open onClose={onClose} title="Editar producto">
      <form onSubmit={guardar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-categoria">Categoría</Label>
          <CategoriaSelect
            id="edit-categoria"
            value={categoria}
            onChange={setCategoria}
            categorias={categorias}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-codigo">Código</Label>
          <Input
            id="edit-codigo"
            className="h-9 font-semibold tabular-nums"
            value={producto.codigo}
            disabled
            title="El código no se puede modificar."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-nombre">Descripción del producto</Label>
          <Input
            id="edit-nombre"
            className="h-9 uppercase"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-estado">Estado</Label>
          <Select
            id="edit-estado"
            className="h-9 sm:max-w-xs"
            value={active ? 'activo' : 'inactivo'}
            onChange={(e) => setActive(e.target.value === 'activo')}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </Select>
        </div>
        <Mensaje error={error} />
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            type="submit"
            size="lg"
            className="h-9 px-8"
            disabled={!nombre.trim() || actualizar.isPending}
          >
            <Save className="size-5" />
            {actualizar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

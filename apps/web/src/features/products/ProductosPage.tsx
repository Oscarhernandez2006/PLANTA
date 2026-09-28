import { useMemo, useState } from 'react';
import { ListOrdered, Package, Pencil, Plus, RefreshCw, Save, Search } from 'lucide-react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import {
  CATEGORIAS_PRODUCTO,
  useCreateProduct,
  useNextProductCode,
  useProductsAdmin,
  useUpdateProduct,
  type Product,
} from './api';

type ProductoFila = Required<Product>;

function mensajeError(err: unknown, porDefecto: string) {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
}

export function ProductosPage() {
  const productos = useProductsAdmin('');
  const rows = productos.data ?? [];
  const [agregando, setAgregando] = useState(false);
  const [editando, setEditando] = useState<ProductoFila | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  const q = busqueda.trim().toLowerCase();
  const filtradas = rows
    .map((p, i) => ({ p, no: i + 1 }))
    .filter(
      ({ p }) =>
        (!q || p.nombre.toLowerCase().includes(q)) &&
        (!filtroCategoria || p.categoria === filtroCategoria),
    );

  const categorias = useMemo(() => {
    const extras = rows
      .map((p) => p.categoria)
      .filter((c): c is string => !!c && !CATEGORIAS_PRODUCTO.includes(c));
    return [...CATEGORIAS_PRODUCTO, ...new Set(extras)];
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Catálogo de productos usado en Orden de Proceso y en los recibos.
            </p>
          </div>
        </div>
        <Button size="lg" className="h-9" onClick={() => setAgregando(true)}>
          <Plus className="size-5" />
          Agregar nuevo producto
        </Button>
      </div>

      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="size-5" />
              Lista de productos
            </CardTitle>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Select
                className="h-9 w-full sm:w-72"
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                aria-label="Filtrar por categoría"
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre del producto…"
                />
              </div>
              <Button
                variant="outline"
                className="h-9"
                onClick={() => productos.refetch()}
                disabled={productos.isFetching}
                title="Refrescar"
              >
                <RefreshCw className={productos.isFetching ? 'size-4 animate-spin' : 'size-4'} />
                Refrescar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] overflow-auto rounded-md border border-border">
            <Table>
              <THead>
                <TR>
                  <TH className="w-16">No.</TH>
                  <TH>Categoría</TH>
                  <TH>Código</TH>
                  <TH>Producto</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {productos.isLoading ? (
                  <TR>
                    <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                      Cargando…
                    </TD>
                  </TR>
                ) : filtradas.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                      {q || filtroCategoria ? 'Ningún producto coincide con los filtros.' : 'Aún no hay productos registrados.'}
                    </TD>
                  </TR>
                ) : (
                  filtradas.map(({ p, no }) => (
                    <TR key={p.id} className={p.active ? '' : 'text-muted-foreground'}>
                      <TD className="tabular-nums">{String(no).padStart(3, '0')}</TD>
                      <TD>{p.categoria ?? '—'}</TD>
                      <TD className="tabular-nums">{p.codigo}</TD>
                      <TD>
                        {p.nombre}
                        {!p.active && <span className="ml-2 text-xs">(inactivo)</span>}
                      </TD>
                      <TD className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setEditando(p)}>
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AgregarProductoDialog
        open={agregando}
        onClose={() => setAgregando(false)}
        categorias={categorias}
      />
      {editando && (
        <EditarProductoDialog
          producto={editando}
          onClose={() => setEditando(null)}
          categorias={categorias}
        />
      )}
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

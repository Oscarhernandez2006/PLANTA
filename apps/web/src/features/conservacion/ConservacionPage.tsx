import { useMemo, useState } from 'react';
import { Filter, ListOrdered, Pencil, Plus, RefreshCw, Save, Search, Snowflake } from 'lucide-react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn } from '@/lib/utils';
import { useProductsAdmin } from '../products/api';
import {
  useActualizarConservacion,
  useAsignarProducto,
  useConservacionClientes,
  useProductosCliente,
  type ConservacionCliente,
  type ProductoAsignado,
} from './api';

const etiquetaCliente = (c: ConservacionCliente) => `${c.nit ?? 'SIN NIT'} - ${c.concepto}`;

export function ConservacionPage() {
  const clientes = useConservacionClientes();
  const rows = clientes.data ?? [];
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<ConservacionCliente | null>(null);

  const q = busqueda.trim().toLowerCase();
  const filtradas = rows
    .map((c, i) => ({ c, no: i + 1 }))
    .filter(({ c }) => !q || etiquetaCliente(c).toLowerCase().includes(q));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Snowflake className="size-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conservación</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Productos que se le despostan a cada cliente.
          </p>
        </div>
      </div>

      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="size-5" />
              Lista de clientes
            </CardTitle>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o NIT/C.C…"
                />
              </div>
              <Button
                variant="outline"
                className="h-9"
                onClick={() => clientes.refetch()}
                disabled={clientes.isFetching}
                title="Refrescar"
              >
                <RefreshCw className={clientes.isFetching ? 'size-4 animate-spin' : 'size-4'} />
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
                  <TH>Cliente</TH>
                  <TH className="text-center">Productos asignados</TH>
                </TR>
              </THead>
              <TBody>
                {clientes.isLoading ? (
                  <TR>
                    <TD colSpan={3} className="py-8 text-center text-muted-foreground">
                      Cargando…
                    </TD>
                  </TR>
                ) : filtradas.length === 0 ? (
                  <TR>
                    <TD colSpan={3} className="py-8 text-center text-muted-foreground">
                      {q ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes activos.'}
                    </TD>
                  </TR>
                ) : (
                  filtradas.map(({ c, no }) => (
                    <TR key={c.id}>
                      <TD className="tabular-nums">{String(no).padStart(2, '0')}</TD>
                      <TD>
                        <button
                          type="button"
                          onClick={() => setSeleccionado(c)}
                          className="flex items-center gap-2 text-left hover:text-primary"
                        >
                          <Filter className="size-4 shrink-0 fill-current" />
                          {etiquetaCliente(c)}
                        </button>
                      </TD>
                      <TD className="text-center tabular-nums">{c.productos}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {seleccionado && (
        <ProductosClienteDialog
          cliente={seleccionado}
          onClose={() => setSeleccionado(null)}
        />
      )}
    </div>
  );
}

function ProductosClienteDialog({
  cliente,
  onClose,
}: {
  cliente: ConservacionCliente;
  onClose: () => void;
}) {
  const keyboard = useKeyboard();
  const asignados = useProductosCliente(cliente.id);
  const catalogo = useProductsAdmin('');
  const [agregando, setAgregando] = useState(false);
  const [editando, setEditando] = useState<ProductoAsignado | null>(null);

  const lista = asignados.data ?? [];
  const opciones = useMemo(() => {
    const ya = new Set(lista.map((p) => p.id));
    return (catalogo.data ?? [])
      .filter((p) => p.active && !ya.has(p.id))
      .map((p) => ({ value: p.id, label: `${p.codigo} - ${p.nombre}` }));
  }, [catalogo.data, lista]);

  const celda = 'border border-border px-3 py-2 text-center';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Productos del cliente"
      description={etiquetaCliente(cliente)}
      className="max-w-6xl"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button className="h-9" onClick={() => setAgregando(true)}>
            <Plus className="size-5" />
            Agregar conservación
          </Button>
        </div>

        <div className="max-h-[420px] overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted text-xs font-semibold uppercase">
              <tr>
                <th rowSpan={2} className={celda}>No.</th>
                <th rowSpan={2} className={celda}>Tipo</th>
                <th rowSpan={2} className={celda}>Código</th>
                <th rowSpan={2} className={celda}>Producto</th>
                <th rowSpan={2} className={celda}>REF/PLU/SKU</th>
                <th colSpan={2} className={celda}>Refrigerado</th>
                <th colSpan={2} className={celda}>Congelado</th>
              </tr>
              <tr>
                <th className={celda}>Caducidad (días)</th>
                <th className={celda}>Temperatura (°C)</th>
                <th className={celda}>Caducidad (días)</th>
                <th className={celda}>Temperatura (°C)</th>
              </tr>
            </thead>
            <tbody>
              {asignados.isLoading ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    Este cliente aún no tiene productos asignados.
                  </td>
                </tr>
              ) : (
                lista.map((p, i) => (
                  <tr
                    key={p.id}
                    className={cn('hover:bg-muted/40', !p.active && 'text-muted-foreground')}
                  >
                    <td className={cn(celda, 'tabular-nums')}>
                      <div className="flex items-center justify-center gap-2">
                        {String(i + 1).padStart(2, '0')}
                        <button
                          type="button"
                          onClick={() => setEditando(p)}
                          title="Editar"
                          className="rounded p-1 hover:bg-muted"
                        >
                          <Pencil className="size-4" />
                        </button>
                      </div>
                    </td>
                    <td className={celda}>{p.tipo}</td>
                    <td className={cn(celda, 'tabular-nums')}>{p.codigo}</td>
                    <td className={celda}>
                      {p.nombre}
                      {!p.active && <span className="ml-1 text-xs">(inactivo)</span>}
                    </td>
                    <td className={celda}>{p.refPluSku ?? ''}</td>
                    <td className={cn(celda, 'tabular-nums')}>{p.refrigeradoDias}</td>
                    <td className={celda}>{p.refrigeradoTemp}</td>
                    <td className={cn(celda, 'tabular-nums')}>{p.congeladoDias}</td>
                    <td className={celda}>{p.congeladoTemp}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {agregando && (
        <AgregarConservacionDialog
          cliente={cliente}
          opciones={opciones}
          cargandoProductos={catalogo.isLoading}
          onKeyboard={keyboard.open}
          onClose={() => setAgregando(false)}
        />
      )}
      {editando && (
        <EditarConservacionDialog
          cliente={cliente}
          producto={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </Dialog>
  );
}

function AgregarConservacionDialog({
  cliente,
  opciones,
  cargandoProductos,
  onKeyboard,
  onClose,
}: {
  cliente: ConservacionCliente;
  opciones: { value: string; label: string }[];
  cargandoProductos: boolean;
  onKeyboard: () => void;
  onClose: () => void;
}) {
  const asignar = useAsignarProducto(cliente.id);
  const [productId, setProductId] = useState('');
  const [refPluSku, setRefPluSku] = useState('');
  const [refrigeradoDias, setRefrigeradoDias] = useState('0');
  const [refrigeradoTemp, setRefrigeradoTemp] = useState('0°C A 4°C');
  const [congeladoDias, setCongeladoDias] = useState('0');
  const [congeladoTemp, setCongeladoTemp] = useState('-18°C A -25°C');
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productId) return setError('Selecciona el producto.');
    try {
      await asignar.mutateAsync({
        productId,
        refPluSku: refPluSku.trim(),
        refrigeradoDias: Number(refrigeradoDias || 0),
        refrigeradoTemp: refrigeradoTemp.trim() || '0°C A 4°C',
        congeladoDias: Number(congeladoDias || 0),
        congeladoTemp: congeladoTemp.trim() || '-18°C A -25°C',
      });
      onClose();
    } catch (err) {
      const m = isAxiosError(err) ? err.response?.data?.message : null;
      setError(typeof m === 'string' ? m : 'No se pudo agregar la conservación.');
    }
  }

  return (
    <Dialog open onClose={onClose} title="Agregar conservación">
      <form onSubmit={guardar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="agr-cliente">Cliente: {cliente.concepto}</Label>
          <Input
            id="agr-cliente"
            className="h-9 font-semibold text-primary disabled:opacity-100"
            value={cliente.nit ?? 'SIN NIT'}
            disabled
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agr-producto">Producto</Label>
          <Combobox
            id="agr-producto"
            className="h-9"
            options={opciones}
            value={productId}
            onChange={setProductId}
            placeholder={cargandoProductos ? 'Cargando…' : 'Buscar producto por código o nombre…'}
            emptyText="Sin productos disponibles"
            onKeyboard={onKeyboard}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agr-ref">REF/PLU/SKU</Label>
          <Input
            id="agr-ref"
            className="h-9 uppercase"
            value={refPluSku}
            onChange={(e) => setRefPluSku(e.target.value)}
            placeholder="REF/PLU/SKU"
            maxLength={60}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agr-r-dias">Refrigerado: caducidad (días)</Label>
            <Input
              id="agr-r-dias"
              inputMode="numeric"
              className="h-9"
              value={refrigeradoDias}
              onChange={(e) => setRefrigeradoDias(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agr-r-temp">Refrigerado: temperatura (°C)</Label>
            <Input
              id="agr-r-temp"
              className="h-9"
              value={refrigeradoTemp}
              onChange={(e) => setRefrigeradoTemp(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agr-c-dias">Congelado: caducidad (días)</Label>
            <Input
              id="agr-c-dias"
              inputMode="numeric"
              className="h-9"
              value={congeladoDias}
              onChange={(e) => setCongeladoDias(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agr-c-temp">Congelado: temperatura (°C)</Label>
            <Input
              id="agr-c-temp"
              className="h-9"
              value={congeladoTemp}
              onChange={(e) => setCongeladoTemp(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-center border-t border-border pt-4">
          <Button
            type="submit"
            size="lg"
            className="h-9 px-8"
            disabled={!productId || asignar.isPending}
          >
            <Save className="size-5" />
            {asignar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditarConservacionDialog({
  cliente,
  producto,
  onClose,
}: {
  cliente: ConservacionCliente;
  producto: ProductoAsignado;
  onClose: () => void;
}) {
  const actualizar = useActualizarConservacion(cliente.id);
  const [refPluSku, setRefPluSku] = useState(producto.refPluSku ?? '');
  const [refrigeradoDias, setRefrigeradoDias] = useState(String(producto.refrigeradoDias));
  const [refrigeradoTemp, setRefrigeradoTemp] = useState(producto.refrigeradoTemp);
  const [congeladoDias, setCongeladoDias] = useState(String(producto.congeladoDias));
  const [congeladoTemp, setCongeladoTemp] = useState(producto.congeladoTemp);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await actualizar.mutateAsync({
        productId: producto.id,
        refPluSku: refPluSku.trim(),
        refrigeradoDias: Number(refrigeradoDias || 0),
        refrigeradoTemp: refrigeradoTemp.trim() || '0°C A 4°C',
        congeladoDias: Number(congeladoDias || 0),
        congeladoTemp: congeladoTemp.trim() || '-18°C A -25°C',
      });
      onClose();
    } catch {
      setError('No se pudo guardar la conservación.');
    }
  }

  return (
    <Dialog open onClose={onClose} title="Editar conservación">
      <form onSubmit={guardar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edi-cliente">Cliente: {cliente.concepto}</Label>
          <Input
            id="edi-cliente"
            className="h-9 font-semibold text-primary disabled:opacity-100"
            value={cliente.nit ?? 'SIN NIT'}
            disabled
          />
        </div>
        <div className="space-y-1.5">
          <Label>Producto</Label>
          <p className="text-sm font-semibold">
            {producto.codigo} - {producto.nombre}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edi-ref">REF/PLU/SKU</Label>
          <Input
            id="edi-ref"
            className="h-9 uppercase"
            value={refPluSku}
            onChange={(e) => setRefPluSku(e.target.value)}
            placeholder="REF/PLU/SKU"
            maxLength={60}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edi-r-dias">Refrigerado: caducidad (días)</Label>
            <Input
              id="edi-r-dias"
              inputMode="numeric"
              className="h-9"
              value={refrigeradoDias}
              onChange={(e) => setRefrigeradoDias(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edi-r-temp">Refrigerado: temperatura (°C)</Label>
            <Input
              id="edi-r-temp"
              className="h-9"
              value={refrigeradoTemp}
              onChange={(e) => setRefrigeradoTemp(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edi-c-dias">Congelado: caducidad (días)</Label>
            <Input
              id="edi-c-dias"
              inputMode="numeric"
              className="h-9"
              value={congeladoDias}
              onChange={(e) => setCongeladoDias(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edi-c-temp">Congelado: temperatura (°C)</Label>
            <Input
              id="edi-c-temp"
              className="h-9"
              value={congeladoTemp}
              onChange={(e) => setCongeladoTemp(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-center border-t border-border pt-4">
          <Button type="submit" size="lg" className="h-9 px-8" disabled={actualizar.isPending}>
            <Save className="size-5" />
            {actualizar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

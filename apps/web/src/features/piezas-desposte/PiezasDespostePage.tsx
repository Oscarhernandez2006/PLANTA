import { useMemo, useState } from 'react';
import { Filter, ListOrdered, Pencil, Plus, Puzzle, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn } from '@/lib/utils';
import { tipoPorCategoria, useProductsAdmin } from '../products/api';
import {
  TIPOS_CONSERVACION,
  useActualizarConservacion,
  useAsignarProducto,
  useConservacionClientes,
  useProductosCliente,
  useQuitarProducto,
  type ConservacionCliente,
  type ProductoAsignado,
} from '../conservacion/api';

const etiquetaCliente = (c: ConservacionCliente) => `${c.nit ?? 'SIN NIT'} - ${c.concepto}`;

const mensajeError = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

/** Entero 1–999 a partir de lo digitado. */
const soloEntero = (v: string) => v.replace(/\D/g, '').slice(0, 3);

export function PiezasDespostePage() {
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
        <Puzzle className="size-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Piezas Desposte</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Piezas que salen por canal y unidades por caja de cada producto del cliente.
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
                </TR>
              </THead>
              <TBody>
                {clientes.isLoading ? (
                  <TR>
                    <TD colSpan={2} className="py-8 text-center text-muted-foreground">
                      Cargando…
                    </TD>
                  </TR>
                ) : filtradas.length === 0 ? (
                  <TR>
                    <TD colSpan={2} className="py-8 text-center text-muted-foreground">
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
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {seleccionado && (
        <PiezasClienteDialog cliente={seleccionado} onClose={() => setSeleccionado(null)} />
      )}
    </div>
  );
}

function PiezasClienteDialog({
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
  const quitar = useQuitarProducto(cliente.id);
  const [errorQuitar, setErrorQuitar] = useState<string | null>(null);

  function eliminar(p: ProductoAsignado) {
    if (
      !window.confirm(
        `¿Eliminar ${p.codigo} - ${p.nombre} de este cliente?\nTambién se quita de su Conservación.`,
      )
    )
      return;
    setErrorQuitar(null);
    quitar.mutate(p.id, {
      onError: (err) => setErrorQuitar(mensajeError(err, 'No se pudo eliminar el producto.')),
    });
  }

  const lista = asignados.data ?? [];
  const opciones = useMemo(() => {
    const ya = new Set(lista.map((p) => p.id));
    return (catalogo.data ?? [])
      .filter((p) => p.active && !ya.has(p.id))
      .map((p) => ({
        value: p.id,
        label: `${p.codigo} - ${p.nombre}`,
        tipo: tipoPorCategoria(p.categoria),
      }));
  }, [catalogo.data, lista]);

  const celda = 'border border-border px-3 py-2 text-center';

  return (
    <Dialog
      open
      onClose={agregando || editando ? () => undefined : onClose}
      title={`Piezas desposte: (${etiquetaCliente(cliente)})`}
      className="max-w-6xl"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">{errorQuitar}</p>
          <Button className="h-9" onClick={() => setAgregando(true)}>
            <Plus className="size-5" />
            Agregar producto
          </Button>
        </div>

        <div className="max-h-[460px] overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs font-semibold uppercase">
              <tr>
                <th className={cn(celda, 'w-16')}>No.</th>
                <th className={cn(celda, 'w-16')}>
                  <Pencil className="mx-auto size-4" />
                </th>
                <th className={celda}>Tipo</th>
                <th className={celda}>Código</th>
                <th className={celda}>Producto</th>
                <th className={celda}>Piezas x canal</th>
                <th className={celda}>Unds x caja</th>
                <th className={cn(celda, 'w-16')}>
                  <Trash2 className="mx-auto size-4" />
                </th>
              </tr>
            </thead>
            <tbody>
              {asignados.isLoading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    Este cliente aún no tiene productos. Agrégalos con “Agregar producto”.
                  </td>
                </tr>
              ) : (
                lista.map((p, i) => (
                  <tr
                    key={p.id}
                    className={cn('even:bg-muted/30 hover:bg-muted/50', !p.active && 'text-muted-foreground')}
                  >
                    <td className={cn(celda, 'tabular-nums')}>{String(i + 1).padStart(2, '0')}</td>
                    <td className={celda}>
                      <button
                        type="button"
                        onClick={() => setEditando(p)}
                        title="Editar piezas x canal y unds x caja"
                        className="rounded p-1.5 hover:bg-muted"
                      >
                        <Pencil className="size-5" />
                      </button>
                    </td>
                    <td className={celda}>{p.tipo}</td>
                    <td className={cn(celda, 'tabular-nums')}>{p.codigo}</td>
                    <td className={celda}>
                      {p.nombre}
                      {!p.active && <span className="ml-1 text-xs">(inactivo)</span>}
                    </td>
                    <td className={cn(celda, 'font-semibold tabular-nums')}>{p.piezasPorCanal}</td>
                    <td className={cn(celda, 'font-semibold tabular-nums')}>{p.undsPorCaja}</td>
                    <td className={celda}>
                      <button
                        type="button"
                        onClick={() => eliminar(p)}
                        disabled={quitar.isPending}
                        title="Eliminar producto del cliente"
                        className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="size-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {agregando && (
        <AgregarPiezaDialog
          cliente={cliente}
          opciones={opciones}
          cargandoProductos={catalogo.isLoading}
          onKeyboard={keyboard.open}
          onClose={() => setAgregando(false)}
        />
      )}
      {editando && (
        <EditarPiezaDialog
          cliente={cliente}
          producto={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </Dialog>
  );
}

function CamposPiezas({
  piezas,
  setPiezas,
  unds,
  setUnds,
}: {
  piezas: string;
  setPiezas: (v: string) => void;
  unds: string;
  setUnds: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="pz-piezas">Piezas x canal</Label>
        <Input
          id="pz-piezas"
          inputMode="numeric"
          className="h-12 text-center text-2xl font-bold tabular-nums"
          value={piezas}
          onChange={(e) => setPiezas(soloEntero(e.target.value))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pz-unds">Unds x caja</Label>
        <Input
          id="pz-unds"
          inputMode="numeric"
          className="h-12 text-center text-2xl font-bold tabular-nums"
          value={unds}
          onChange={(e) => setUnds(soloEntero(e.target.value))}
        />
      </div>
    </div>
  );
}

function AgregarPiezaDialog({
  cliente,
  opciones,
  cargandoProductos,
  onKeyboard,
  onClose,
}: {
  cliente: ConservacionCliente;
  opciones: { value: string; label: string; tipo: string }[];
  cargandoProductos: boolean;
  onKeyboard: () => void;
  onClose: () => void;
}) {
  const asignar = useAsignarProducto(cliente.id);
  const [productId, setProductId] = useState('');
  const [tipo, setTipo] = useState<string>('MATERIA PRIMA');

  // El tipo se toma de la categoría del producto (se puede cambiar).
  function elegirProducto(id: string) {
    setProductId(id);
    const op = opciones.find((o) => o.value === id);
    if (op) setTipo(op.tipo);
  }
  const [piezas, setPiezas] = useState('1');
  const [unds, setUnds] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const valido = !!productId && Number(piezas) >= 1 && Number(unds) >= 1;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valido) return setError('Selecciona el producto y digita piezas y unidades (mínimo 1).');
    try {
      await asignar.mutateAsync({
        productId,
        tipo,
        piezasPorCanal: Number(piezas),
        undsPorCaja: Number(unds),
      });
      onClose();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo agregar el producto.'));
    }
  }

  return (
    <Dialog open onClose={onClose} title="Agregar producto" description={etiquetaCliente(cliente)}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pz-producto">Producto</Label>
          <Combobox
            id="pz-producto"
            className="h-9"
            options={opciones}
            value={productId}
            onChange={elegirProducto}
            placeholder={cargandoProductos ? 'Cargando…' : 'Buscar producto por código o nombre…'}
            emptyText="Sin productos disponibles"
            onKeyboard={onKeyboard}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pz-tipo">Tipo</Label>
          <Select id="pz-tipo" className="h-9" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_CONSERVACION.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <CamposPiezas piezas={piezas} setPiezas={setPiezas} unds={unds} setUnds={setUnds} />
        <p className="text-xs text-muted-foreground">
          El producto también queda en Conservación del cliente con los valores por defecto.
        </p>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-center border-t border-border pt-4">
          <Button type="submit" size="lg" className="h-9 px-8" disabled={!valido || asignar.isPending}>
            <Save className="size-5" />
            {asignar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditarPiezaDialog({
  cliente,
  producto,
  onClose,
}: {
  cliente: ConservacionCliente;
  producto: ProductoAsignado;
  onClose: () => void;
}) {
  const actualizar = useActualizarConservacion(cliente.id);
  const [piezas, setPiezas] = useState(String(producto.piezasPorCanal));
  const [unds, setUnds] = useState(String(producto.undsPorCaja));
  const [error, setError] = useState<string | null>(null);
  const valido = Number(piezas) >= 1 && Number(unds) >= 1;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valido) return setError('Piezas y unidades deben ser mínimo 1.');
    try {
      await actualizar.mutateAsync({
        productId: producto.id,
        piezasPorCanal: Number(piezas),
        undsPorCaja: Number(unds),
      });
      onClose();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar.'));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Editar piezas desposte"
      description={`${producto.codigo} - ${producto.nombre}`}
      className="max-w-lg"
    >
      <form onSubmit={guardar} className="space-y-4">
        <CamposPiezas piezas={piezas} setPiezas={setPiezas} unds={unds} setUnds={setUnds} />
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-center border-t border-border pt-4">
          <Button type="submit" size="lg" className="h-9 px-8" disabled={!valido || actualizar.isPending}>
            <Save className="size-5" />
            {actualizar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

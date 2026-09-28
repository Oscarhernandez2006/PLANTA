import { useState } from 'react';
import { Eye, ListOrdered, Pencil, Plus, RefreshCw, Save, Search, Store, Users, Warehouse, X } from 'lucide-react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  useActualizarBodega,
  useActualizarCliente,
  useActualizarTienda,
  useBodegas,
  useClientesAdmin,
  useCrearBodega,
  useCrearCliente,
  useCrearTienda,
  useNextBodegaCode,
  useNextClienteCode,
  useNextTiendaCode,
  useTiendas,
  type ClienteCompleto,
  type Bodega,
  type ClienteDatos,
  type Tienda,
  type TiendaInput,
} from './api';

function mensajeError(err: unknown, porDefecto: string) {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
}

export function ClientesPage() {
  const clientes = useClientesAdmin();
  const rows = clientes.data ?? [];
  const [busqueda, setBusqueda] = useState('');
  const [viendo, setViendo] = useState<ClienteCompleto | null>(null);
  const [editando, setEditando] = useState<ClienteCompleto | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [tiendasDe, setTiendasDe] = useState<ClienteCompleto | null>(null);
  const [bodegasDe, setBodegasDe] = useState<ClienteCompleto | null>(null);

  const q = busqueda.trim().toLowerCase();
  const filtradas = rows
    .map((c, i) => ({ c, no: i + 1 }))
    .filter(
      ({ c }) =>
        !q || c.concepto.toLowerCase().includes(q) || (c.nit ?? '').toLowerCase().includes(q),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Clientes usados en Peso en Camión, Orden de Beneficio y Orden de Proceso.
            </p>
          </div>
        </div>
        <Button size="lg" className="h-9" onClick={() => setAgregando(true)}>
          <Plus className="size-5" />
          Agregar nuevo cliente
        </Button>
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
                  <TH>N.I.T/C.C</TH>
                  <TH>Cliente</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {clientes.isLoading ? (
                  <TR>
                    <TD colSpan={4} className="py-8 text-center text-muted-foreground">
                      Cargando…
                    </TD>
                  </TR>
                ) : filtradas.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="py-8 text-center text-muted-foreground">
                      {q ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes registrados.'}
                    </TD>
                  </TR>
                ) : (
                  filtradas.map(({ c, no }) => (
                    <TR key={c.id} className={c.active ? '' : 'text-muted-foreground'}>
                      <TD className="tabular-nums">{String(no).padStart(2, '0')}</TD>
                      <TD className="tabular-nums">
                        <button
                          type="button"
                          onClick={() => setTiendasDe(c)}
                          title="Ver tiendas del cliente"
                          className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
                        >
                          <Store className="size-4" />
                          {c.nit ?? 'SIN NIT'}
                        </button>
                      </TD>
                      <TD>
                        {c.concepto}
                        {!c.active && <span className="ml-2 text-xs">(inactivo)</span>}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setBodegasDe(c)}>
                            <Warehouse className="size-4" />
                            Bodegas
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setViendo(c)}>
                            <Eye className="size-4" />
                            Ver
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditando(c)}>
                            <Pencil className="size-4" />
                            Editar
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {viendo && <VerClienteDialog cliente={viendo} onClose={() => setViendo(null)} />}
      {editando && (
        <ClienteFormDialog cliente={editando} onClose={() => setEditando(null)} />
      )}
      {agregando && <ClienteFormDialog onClose={() => setAgregando(false)} />}
      {tiendasDe && <TiendasDialog cliente={tiendasDe} onClose={() => setTiendasDe(null)} />}
      {bodegasDe && <BodegasDialog cliente={bodegasDe} onClose={() => setBodegasDe(null)} />}
    </div>
  );
}

/** Bodegas internas del cliente (no son cavas físicas); código consecutivo global. */
function BodegasDialog({
  cliente,
  onClose,
}: {
  cliente: ClienteCompleto;
  onClose: () => void;
}) {
  const bodegas = useBodegas(cliente.id);
  const next = useNextBodegaCode();
  const crear = useCrearBodega(cliente.id);
  const actualizar = useActualizarBodega(cliente.id);
  // null = formulario cerrado; 'nueva' = registrando; Bodega = editando.
  const [form, setForm] = useState<Bodega | 'nueva' | null>(null);
  const [nombre, setNombre] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;
  const rows = bodegas.data ?? [];
  const editando = form && form !== 'nueva' ? form : null;

  function abrir(b: Bodega | 'nueva') {
    setForm(b);
    setNombre(b === 'nueva' ? '' : b.nombre);
    setActive(b === 'nueva' ? true : b.active);
    setError(null);
    if (b === 'nueva') void next.refetch();
  }

  function cerrar() {
    setForm(null);
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editando) await actualizar.mutateAsync({ id: editando.id, nombre: nombre.trim(), active });
      else await crear.mutateAsync({ nombre: nombre.trim() });
      cerrar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la bodega.'));
    }
  }

  return (
    <Dialog
      open
      onClose={form ? cerrar : onClose}
      title={`Bodegas — ${cliente.concepto}`}
      description="Bodegas internas del software donde queda registrado el producto del cliente."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-base font-semibold uppercase">
            <ListOrdered className="size-5" />
            Lista de bodegas:
          </p>
          <Button className="h-9" onClick={() => abrir('nueva')}>
            <Plus className="size-4" />
            Agregar bodega
          </Button>
        </div>

        {form && (
          <Dialog
            open
            onClose={cerrar}
            title={editando ? 'Editar bodega' : 'Registrar bodega'}
            description={`${cliente.nit ?? 'SIN NIT'} - ${cliente.concepto}`}
            className="max-w-xl"
          >
            <form onSubmit={guardar}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="bodega-code">Código</Label>
                  <Input
                    id="bodega-code"
                    className="h-9 font-semibold tabular-nums"
                    value={editando ? editando.code : (next.data?.next ?? '—')}
                    disabled
                    title="Consecutivo automático: se asigna al guardar."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bodega-nombre">Bodega</Label>
                  <Input
                    id="bodega-nombre"
                    className="h-9 uppercase"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={120}
                    placeholder={cliente.concepto}
                    autoFocus
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-end gap-2 border-t border-border pt-4">
                {editando && (
                  <div className="mr-auto space-y-1.5">
                    <Label htmlFor="bodega-estado">Estado</Label>
                    <Select
                      id="bodega-estado"
                      className="h-9 w-40"
                      value={active ? 'activo' : 'inactivo'}
                      onChange={(e) => setActive(e.target.value === 'activo')}
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </Select>
                  </div>
                )}
                <Button type="button" variant="outline" className="h-9" onClick={cerrar}>
                  <X className="size-4" />
                  Cancelar
                </Button>
                <Button type="submit" className="h-9 px-6" disabled={nombre.trim().length < 2 || guardando}>
                  <Save className="size-4" />
                  {guardando ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
              {error && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </form>
          </Dialog>
        )}

        <div className="max-h-[360px] overflow-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR>
                <TH className="w-24">Código</TH>
                <TH>Bodega</TH>
                <TH className="w-28">Estado</TH>
                <TH className="w-24 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {bodegas.isLoading ? (
                <TR>
                  <TD colSpan={4} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={4} className="py-8 text-center text-muted-foreground">
                    Este cliente aún no tiene bodegas.
                  </TD>
                </TR>
              ) : (
                rows.map((b) => (
                  <TR key={b.id} className={cn(!b.active && 'text-muted-foreground')}>
                    <TD className="font-medium tabular-nums">{b.code}</TD>
                    <TD>{b.nombre}</TD>
                    <TD className="text-xs font-semibold">{b.active ? 'ACTIVA' : 'INACTIVA'}</TD>
                    <TD>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => abrir(b)}>
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </div>
    </Dialog>
  );
}

const TIENDA_VACIA: TiendaInput = { nombre: '', direccion: '', ciudad: '' };

/** Tiendas del cliente: lista y registro/edición. El código completo es NIT-código. */
function TiendasDialog({
  cliente,
  onClose,
}: {
  cliente: ClienteCompleto;
  onClose: () => void;
}) {
  const tiendas = useTiendas(cliente.id);
  const next = useNextTiendaCode(cliente.id);
  const crear = useCrearTienda(cliente.id);
  const actualizar = useActualizarTienda(cliente.id);
  // null = formulario cerrado; 'nueva' = registrando; Tienda = editando.
  const [form, setForm] = useState<Tienda | 'nueva' | null>(null);
  const [valores, setValores] = useState<TiendaInput>(TIENDA_VACIA);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;
  const rows = tiendas.data ?? [];
  const prefijo = cliente.nit ?? String(cliente.code);
  const editando = form && form !== 'nueva' ? form : null;

  function abrir(t: Tienda | 'nueva') {
    setForm(t);
    setValores(
      t === 'nueva'
        ? TIENDA_VACIA
        : { nombre: t.nombre, direccion: t.direccion ?? '', ciudad: t.ciudad ?? '' },
    );
    setActive(t === 'nueva' ? true : t.active);
    setError(null);
    if (t === 'nueva') void next.refetch();
  }

  function cerrar() {
    setForm(null);
    setError(null);
  }

  const set = (k: keyof TiendaInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValores((prev) => ({ ...prev, [k]: e.target.value }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = {
      nombre: valores.nombre.trim(),
      direccion: valores.direccion.trim(),
      ciudad: valores.ciudad.trim(),
    };
    try {
      if (editando) await actualizar.mutateAsync({ id: editando.id, ...datos, active });
      else await crear.mutateAsync(datos);
      cerrar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la tienda.'));
    }
  }

  const v = (s: string | null) => s || 'N/A';

  return (
    <Dialog
      open
      onClose={form ? cerrar : onClose}
      title={`Tiendas — ${cliente.concepto}`}
      description={`NIT/CC ${cliente.nit ?? 'sin NIT'}`}
      className="max-w-6xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-base font-semibold uppercase">
            <ListOrdered className="size-5" />
            Lista de tiendas:
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9"
              onClick={() => tiendas.refetch()}
              disabled={tiendas.isFetching}
              title="Refrescar"
            >
              <RefreshCw className={tiendas.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              Refrescar
            </Button>
            <Button className="h-9" onClick={() => abrir('nueva')}>
              <Plus className="size-4" />
              Agregar tienda
            </Button>
          </div>
        </div>

        {form && (
          <Dialog
            open
            onClose={cerrar}
            title={editando ? 'Editar tienda' : 'Registrar tienda'}
            description={`${cliente.nit ?? 'SIN NIT'} - ${cliente.concepto}`}
            className="max-w-3xl"
          >
          <form onSubmit={guardar}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tienda-cliente">Cliente</Label>
                <Input id="tienda-cliente" className="h-9" value={cliente.concepto} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tienda-nombre">Tienda</Label>
                <Input
                  id="tienda-nombre"
                  className="h-9 uppercase"
                  value={valores.nombre}
                  onChange={set('nombre')}
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tienda-codigo">Código</Label>
                <Input
                  id="tienda-codigo"
                  className="h-9 font-semibold tabular-nums"
                  value={
                    editando
                      ? `${prefijo}-${editando.codigo}`
                      : next.data
                        ? `${prefijo}-${next.data.next}`
                        : '—'
                  }
                  disabled
                  title="Consecutivo automático: se asigna al guardar."
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="tienda-direccion">Dirección</Label>
                <Input
                  id="tienda-direccion"
                  className="h-9 uppercase"
                  value={valores.direccion}
                  onChange={set('direccion')}
                  maxLength={160}
                  placeholder="N/A"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tienda-ciudad">Ciudad</Label>
                <Input
                  id="tienda-ciudad"
                  className="h-9 uppercase"
                  value={valores.ciudad}
                  onChange={set('ciudad')}
                  maxLength={80}
                  placeholder="N/A"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-end gap-2 border-t border-border pt-4">
              {editando && (
                <div className="mr-auto space-y-1.5">
                  <Label htmlFor="tienda-estado">Estado</Label>
                  <Select
                    id="tienda-estado"
                    className="h-9 w-40"
                    value={active ? 'activo' : 'inactivo'}
                    onChange={(e) => setActive(e.target.value === 'activo')}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </Select>
                </div>
              )}
              <Button type="button" variant="outline" className="h-9" onClick={cerrar}>
                <X className="size-4" />
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-9 px-6"
                disabled={valores.nombre.trim().length < 2 || guardando}
              >
                <Save className="size-4" />
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
            {error && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
          </Dialog>
        )}

        <div className="max-h-[420px] overflow-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Tienda</TH>
                <TH>Código</TH>
                <TH>Dirección</TH>
                <TH>Ciudad</TH>
                <TH className="w-24 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {tiendas.isLoading ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                    Este cliente aún no tiene tiendas registradas.
                  </TD>
                </TR>
              ) : (
                rows.map((t) => (
                  <TR
                    key={t.id}
                    className={cn(
                      !t.active && 'text-muted-foreground',
                      editando?.id === t.id && 'bg-emerald-50',
                    )}
                  >
                    <TD>{cliente.concepto}</TD>
                    <TD>
                      {t.nombre}
                      {!t.active && <span className="ml-2 text-xs">(inactiva)</span>}
                    </TD>
                    <TD className="tabular-nums">
                      {prefijo}-{t.codigo}
                    </TD>
                    <TD>{v(t.direccion)}</TD>
                    <TD>{v(t.ciudad)}</TD>
                    <TD>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => abrir(t)}>
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </div>
    </Dialog>
  );
}

/** Celda de la ficha: etiqueta arriba, valor abajo. */
function Campo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="min-h-6 text-sm">{children}</div>
    </div>
  );
}

function VerClienteDialog({
  cliente,
  onClose,
}: {
  cliente: ClienteCompleto;
  onClose: () => void;
}) {
  const v = (s: string | null) => s || '—';
  return (
    <Dialog open onClose={onClose} title="Cliente">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label="Código">
          <span className="font-semibold tabular-nums text-primary">{cliente.code}</span>
        </Campo>
        <Campo label="NIT/CC">{v(cliente.nit)}</Campo>
        <Campo label="Cliente" className="sm:col-span-2">{cliente.concepto}</Campo>
        <Campo label="Dirección" className="sm:col-span-2">{v(cliente.direccion)}</Campo>
        <Campo label="Teléfono">{v(cliente.telefono)}</Campo>
        <Campo label="Ciudad">{v(cliente.ciudad)}</Campo>
        <Campo label="Contacto" className="sm:col-span-2">{v(cliente.contacto)}</Campo>
        <Campo label="Correo" className="sm:col-span-2">{v(cliente.correo)}</Campo>
        <Campo label="Celular">{v(cliente.celular)}</Campo>
        <Campo label="Estado">{cliente.active ? 'ACTIVO' : 'INACTIVO'}</Campo>
      </div>
    </Dialog>
  );
}

type CampoTexto = keyof ClienteDatos | 'concepto';

/** Registrar (sin `cliente`) o editar (con `cliente`); el código nunca se edita. */
function ClienteFormDialog({
  cliente,
  onClose,
}: {
  cliente?: ClienteCompleto;
  onClose: () => void;
}) {
  const crear = useCrearCliente();
  const actualizar = useActualizarCliente();
  const next = useNextClienteCode();
  const [valores, setValores] = useState<Record<CampoTexto, string>>({
    concepto: cliente?.concepto ?? '',
    nit: cliente?.nit ?? '',
    direccion: cliente?.direccion ?? '',
    telefono: cliente?.telefono ?? '',
    ciudad: cliente?.ciudad ?? '',
    contacto: cliente?.contacto ?? '',
    correo: cliente?.correo ?? '',
    celular: cliente?.celular ?? '',
  });
  const [active, setActive] = useState(cliente?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;

  const set = (k: CampoTexto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValores((prev) => ({ ...prev, [k]: e.target.value }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = Object.fromEntries(
      Object.entries(valores).map(([k, v]) => [k, v.trim()]),
    ) as Record<CampoTexto, string>;
    try {
      if (cliente) await actualizar.mutateAsync({ id: cliente.id, ...datos, active });
      else await crear.mutateAsync(datos);
      onClose();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el cliente.'));
    }
  }

  const texto = (id: CampoTexto, label: string, className?: string, extra?: string) => (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={`cli-${id}`}>{label}</Label>
      <Input
        id={`cli-${id}`}
        className={cn('h-9', extra)}
        value={valores[id]}
        onChange={set(id)}
        maxLength={id === 'direccion' ? 160 : 120}
      />
    </div>
  );

  return (
    <Dialog open onClose={onClose} title={cliente ? 'Editar cliente' : 'Registrar cliente'}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cli-codigo">Código</Label>
            <Input
              id="cli-codigo"
              className="h-9 font-semibold tabular-nums"
              value={cliente ? cliente.code : (next.data?.next ?? '—')}
              disabled
              title={cliente ? 'El código no se puede modificar.' : 'Consecutivo automático: se asigna al guardar.'}
            />
          </div>
          {texto('nit', 'NIT/CC')}
          {texto('concepto', 'Cliente', 'sm:col-span-2', 'uppercase')}
          {texto('direccion', 'Dirección', 'sm:col-span-2')}
          {texto('telefono', 'Teléfono')}
          {texto('ciudad', 'Ciudad')}
          {texto('contacto', 'Contacto', 'sm:col-span-2')}
          {texto('correo', 'Correo', 'sm:col-span-2')}
          {texto('celular', 'Celular')}
          <div className="space-y-1.5">
            <Label htmlFor="cli-estado">Estado</Label>
            <Select
              id="cli-estado"
              className="h-9"
              value={active ? 'activo' : 'inactivo'}
              onChange={(e) => setActive(e.target.value === 'activo')}
              disabled={!cliente}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </Select>
          </div>
        </div>
        {cliente && valores.concepto.trim().toUpperCase() !== cliente.concepto && (
          <p className="text-xs text-muted-foreground">
            Al cambiar el nombre también se actualiza en sus guías, órdenes de beneficio y
            órdenes de proceso.
          </p>
        )}
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
            disabled={valores.concepto.trim().length < 2 || guardando}
          >
            <Save className="size-5" />
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

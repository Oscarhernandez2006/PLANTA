import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ArrowLeftRight,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleOff,
  Copy,
  Inbox,
  LoaderCircle,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { SupervisorPinDialog } from '@/components/ui/SupervisorPinDialog';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn, formatFechaDia, plantToday as today } from '@/lib/utils';
import { formatOC } from './orden-acondicionamiento-api';
import { useClientesActivos, type OrdenDespachoStatus } from './orden-despacho-api';
import {
  formatOT,
  useActualizarOrdenTraslado,
  useAnularOrdenTraslado,
  useCreateOrdenTraslado,
  useOrdenTrasladoDetalle,
  useOrdenTrasladoNextNumber,
  useOrdenesTraslado,
  useReabrirOrdenTraslado,
  type EstadoOrdenGestion,
  type OrdenTrasladoGestion,
} from './orden-traslado-api';

/** Día siguiente a `iso` (YYYY-MM-DD). */
function manana(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const kg = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string | null) => (iso ? formatFechaDia(iso.slice(0, 10)) : '—');
const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

const ESTADO: Record<EstadoOrdenGestion, { texto: string; clase: string; barra: string }> = {
  activo: { texto: 'Activa', clase: 'bg-emerald-100 text-emerald-800', barra: 'bg-emerald-500' },
  inactivo: { texto: 'Inactiva', clase: 'bg-muted text-muted-foreground', barra: 'bg-muted-foreground/40' },
  facturado: { texto: 'Cerrada', clase: 'bg-sky-100 text-sky-800', barra: 'bg-sky-500' },
  anulada: { texto: 'Anulada', clase: 'bg-red-100 text-red-700', barra: 'bg-red-500' },
};

const estadoDe = (o: { status: OrdenDespachoStatus; deletedAt: string | null }): EstadoOrdenGestion =>
  o.deletedAt ? 'anulada' : o.status;

function EstadoChip({ estado }: { estado: EstadoOrdenGestion }) {
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold uppercase', ESTADO[estado].clase)}>{ESTADO[estado].texto}</span>;
}

export function OrdenTrasladoPage() {
  const [estado, setEstado] = useState<EstadoOrdenGestion | undefined>('activo');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [nueva, setNueva] = useState<{ clienteId: string; processDate: string } | null | false>(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ordenes = useOrdenesTraslado({ estado, search: busqueda, desde: desde || undefined, hasta: hasta || undefined, page });
  const r = ordenes.data?.resumen;
  const filas = ordenes.data?.data ?? [];
  const pag = ordenes.data?.pagination;

  function filtrar(e: EstadoOrdenGestion | undefined) {
    setEstado(e);
    setPage(1);
  }

  function avisar(texto: string) {
    setAviso(texto);
    window.setTimeout(() => setAviso(null), 4000);
  }

  const kpis: { key: EstadoOrdenGestion | undefined; titulo: string; valor: number | undefined; icon: typeof CircleCheck; tono: string }[] = [
    { key: 'activo', titulo: 'Activas', valor: r?.activas, icon: CircleCheck, tono: 'text-emerald-700' },
    { key: 'inactivo', titulo: 'Inactivas', valor: r?.inactivas, icon: CircleOff, tono: 'text-muted-foreground' },
    { key: 'facturado', titulo: 'Cerradas', valor: r?.cerradas, icon: Lock, tono: 'text-sky-700' },
    { key: 'anulada', titulo: 'Anuladas', valor: r?.anuladas, icon: Ban, tono: 'text-red-600' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {aviso && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-50 w-[30rem] max-w-[calc(100vw-3rem)] -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg animate-in fade-in-0 slide-in-from-top-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="flex-1">{aviso}</span>
          </div>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="size-9 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Órdenes de Traslado</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Crea, consulta y gestiona las órdenes de traslado a proceso.
              {r ? ` ${r.cerradasHoy} cerrada(s) hoy.` : ''}
            </p>
          </div>
        </div>
        <Button size="lg" className="h-11" onClick={() => setNueva(null)}>
          <Plus className="size-5" />
          Nueva orden
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.titulo}
            type="button"
            onClick={() => filtrar(estado === k.key ? undefined : k.key)}
            className={cn(
              'rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40',
              estado === k.key ? 'border-primary ring-2 ring-primary/20' : 'border-border',
            )}
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <k.icon className={cn('size-4', k.tono)} />
              {k.titulo}
            </div>
            <div className={cn('mt-1 text-3xl font-bold tabular-nums', k.tono)}>{k.valor ?? '—'}</div>
          </button>
        ))}
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar OT, cliente o NIT"
              className="h-11 pl-10 text-base"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {[undefined, 'activo', 'inactivo', 'facturado', 'anulada'].map((e) => (
              <button
                key={e ?? 'todas'}
                type="button"
                onClick={() => filtrar(e as EstadoOrdenGestion | undefined)}
                className={cn(
                  'h-9 rounded-md px-3 text-sm font-medium transition-colors',
                  estado === e ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {e ? ESTADO[e as EstadoOrdenGestion].texto + 's' : 'Todas'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
            Proceso
            <Input type="date" className="h-10 w-40" value={desde} onChange={(e) => (setDesde(e.target.value), setPage(1))} />
            <span>a</span>
            <Input type="date" className="h-10 w-40" value={hasta} onChange={(e) => (setHasta(e.target.value), setPage(1))} />
          </label>
          {(desde || hasta) && (
            <Button variant="ghost" className="h-10 px-2" onClick={() => (setDesde(''), setHasta(''))} title="Quitar fechas">
              <X className="size-4" />
            </Button>
          )}
          <Button variant="outline" className="size-11 p-0" onClick={() => void ordenes.refetch()} disabled={ordenes.isFetching} title="Actualizar">
            <RefreshCw className={cn('size-5', ordenes.isFetching && 'animate-spin')} />
          </Button>
        </div>

        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          {ordenes.isLoading ? (
            <div className="flex justify-center p-10 text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : !filas.length ? (
            <div className="m-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              <Inbox className="size-8" />
              Ninguna orden coincide con los filtros.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-10 [&>th]:px-3">
                  <th className="w-28">Orden</th>
                  <th>Cliente</th>
                  <th>Proceso</th>
                  <th>Estado</th>
                  <th className="text-right">Empaques</th>
                  <th className="text-right">Neto (kg)</th>
                  <th>Acondicionamiento</th>
                  <th>Creada por</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((o) => (
                  <FilaOrden key={o.id} o={o} onAbrir={() => setDetalleId(o.id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pag && pag.totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-2 text-sm text-muted-foreground">
            <span>
              {pag.total} orden(es) · página {pag.page} de {pag.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" className="h-9" disabled={page >= pag.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {nueva !== false && (
        <Dialog open onClose={() => setNueva(false)} title={nueva ? 'Duplicar orden de traslado' : 'Nueva orden de traslado'} className="max-w-xl">
          <RegistrarOrdenTrasladoForm
            inicial={nueva ?? undefined}
            onCreada={(n) => {
              setNueva(false);
              avisar(`Orden ${formatOT(n)} creada.`);
            }}
          />
        </Dialog>
      )}

      {detalleId && (
        <DetalleOrdenDialog
          id={detalleId}
          onClose={() => setDetalleId(null)}
          onDuplicar={(inicial) => {
            setDetalleId(null);
            setNueva(inicial);
          }}
          onAviso={avisar}
        />
      )}
    </div>
  );
}

function FilaOrden({ o, onAbrir }: { o: OrdenTrasladoGestion; onAbrir: () => void }) {
  const e = estadoDe(o);
  return (
    <tr onClick={onAbrir} className="h-14 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:px-3">
      <td className="relative">
        <span className={cn('absolute inset-y-0 left-0 w-1', ESTADO[e].barra)} />
        <span className="text-base font-bold tabular-nums text-primary">{formatOT(o.otNumber)}</span>
      </td>
      <td className="max-w-80">
        <div className="truncate font-semibold uppercase">{o.cliente.concepto}</div>
        <div className="text-xs text-muted-foreground">{o.cliente.nit ? `NIT ${o.cliente.nit}` : 'Sin NIT'}</div>
      </td>
      <td className="tabular-nums">
        {dia(o.processDate)}
        <div className="text-xs text-muted-foreground">Reg. {dia(o.registrationDate)}</div>
      </td>
      <td>
        <EstadoChip estado={e} />
        {o.closedAt && <div className="mt-0.5 text-[11px] text-muted-foreground">{fechaHora(o.closedAt)}</div>}
      </td>
      <td className="text-right tabular-nums">{o.empaques || '—'}</td>
      <td className="text-right font-semibold tabular-nums">{o.empaques ? kg(o.netoKg) : '—'}</td>
      <td className="tabular-nums">{o.ocNumbers.length ? o.ocNumbers.map(formatOC).join(', ') : <span className="text-muted-foreground">—</span>}</td>
      <td className="text-xs uppercase text-muted-foreground">{o.creadaPor}</td>
      <td className="text-muted-foreground">
        <ChevronRight className="size-5" />
      </td>
    </tr>
  );
}

function DetalleOrdenDialog({
  id,
  onClose,
  onDuplicar,
  onAviso,
}: {
  id: string;
  onClose: () => void;
  onDuplicar: (inicial: { clienteId: string; processDate: string }) => void;
  onAviso: (texto: string) => void;
}) {
  const { data: o, isLoading } = useOrdenTrasladoDetalle(id);
  const keyboard = useKeyboard();
  const clientes = useClientesActivos();
  const actualizar = useActualizarOrdenTraslado();
  const anular = useAnularOrdenTraslado();
  const reabrir = useReabrirOrdenTraslado();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ clienteId: '', processDate: '', status: 'activo' as OrdenDespachoStatus });
  const [error, setError] = useState<string | null>(null);
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [pin, setPin] = useState<'anular' | 'reabrir' | null>(null);

  const estado = o ? estadoDe(o) : null;
  const items = o?.items ?? [];
  const neto = items.reduce((s, i) => s + i.netoKg, 0);
  const tieneOc = !!o?.ordenesAcondicionamiento.length;
  const puedeEditar = estado === 'activo' || estado === 'inactivo';
  const puedeAnular = puedeEditar && !items.length && !tieneOc;
  const puedeReabrir = estado === 'facturado' && !tieneOc;

  function empezarEdicion() {
    if (!o) return;
    setForm({ clienteId: o.cliente.id, processDate: o.processDate.slice(0, 10), status: o.status });
    setError(null);
    setEditando(true);
  }

  async function guardar() {
    if (!o) return;
    setError(null);
    try {
      await actualizar.mutateAsync({
        id: o.id,
        processDate: form.processDate,
        status: form.status,
        ...(form.clienteId !== o.cliente.id ? { clienteId: form.clienteId } : {}),
      });
      setEditando(false);
      onAviso(`Orden ${formatOT(o.otNumber)} actualizada.`);
    } catch (err) {
      setError(mensajeApi(err, 'No se pudo guardar la orden.'));
    }
  }

  const clienteOptions = useMemo(
    () => (clientes.data ?? []).map((c) => ({ value: c.id, label: `${c.nit ?? 'SIN NIT'} - ${c.concepto}` })),
    [clientes.data],
  );

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={o ? `Orden de traslado ${formatOT(o.otNumber)}` : 'Orden de traslado'}
        description={o ? `${o.cliente.concepto}${o.cliente.nit ? ` · NIT ${o.cliente.nit}` : ''}` : undefined}
        className="max-w-4xl"
        scrollInterno
        acciones={
          o && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-9" onClick={() => onDuplicar({ clienteId: o.cliente.id, processDate: manana(today()) })}>
                <Copy className="size-4" />
                Duplicar
              </Button>
              {puedeEditar && !editando && (
                <Button variant="outline" className="h-9" onClick={empezarEdicion}>
                  <Pencil className="size-4" />
                  Editar
                </Button>
              )}
              {puedeReabrir && (
                <Button variant="outline" className="h-9" onClick={() => setPin('reabrir')}>
                  <LockOpen className="size-4" />
                  Reabrir
                </Button>
              )}
              {puedeAnular && (
                <Button variant="outline" className="h-9 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setPedirMotivo(true)}>
                  <Ban className="size-4" />
                  Anular
                </Button>
              )}
            </div>
          )
        }
      >
        {isLoading || !o || !estado ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {estado === 'anulada' && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Anulada el {fechaHora(o.deletedAt)} por <b>{o.anuladaPor ?? '—'}</b>. Motivo: {o.motivoAnulacion ?? '—'}
                </span>
              </div>
            )}

            {editando ? (
              <div className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-proceso">Fecha de proceso</Label>
                    <Input id="ed-proceso" type="date" className="h-10" value={form.processDate} onChange={(e) => setForm({ ...form, processDate: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-estado">Estado</Label>
                    <Select id="ed-estado" className="h-10" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OrdenDespachoStatus })}>
                      <option value="activo">Activa</option>
                      <option value="inactivo">Inactiva</option>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ed-cliente">Cliente</Label>
                  {items.length ? (
                    <p className="text-sm text-muted-foreground">
                      <b className="uppercase text-foreground">{o.cliente.concepto}</b> · no se puede cambiar porque la orden ya tiene productos.
                    </p>
                  ) : (
                    <Combobox
                      id="ed-cliente"
                      className="h-10"
                      options={clienteOptions}
                      value={form.clienteId}
                      onChange={(v) => setForm({ ...form, clienteId: v })}
                      placeholder="Buscar cliente por NIT o nombre…"
                      emptyText="Sin clientes activos"
                      onKeyboard={keyboard.open}
                    />
                  )}
                </div>
                {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditando(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => void guardar()} disabled={actualizar.isPending || !form.processDate || !form.clienteId}>
                    {actualizar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Guardar cambios
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-muted/40 px-4 py-3 md:grid-cols-4">
                <Campo label="Estado">
                  <EstadoChip estado={estado} />
                </Campo>
                <Campo label="Fecha de proceso">{dia(o.processDate)}</Campo>
                <Campo label="Fecha de registro">{dia(o.registrationDate)}</Campo>
                <Campo label="Creada por">
                  {o.creadaPor ?? '—'}
                  <div className="text-xs font-normal text-muted-foreground">{fechaHora(o.createdAt)}</div>
                </Campo>
                <Campo label="Cerrada">
                  {o.closedAt ? (
                    <>
                      {o.cerradaPor ?? '—'}
                      <div className="text-xs font-normal text-muted-foreground">{fechaHora(o.closedAt)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </Campo>
                <Campo label="Empaques">{items.length}</Campo>
                <Campo label="Unidades">{items.reduce((s, i) => s + i.unds, 0)}</Campo>
                <Campo label="Neto (kg)">{kg(neto)}</Campo>
              </div>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Acondicionamiento</h3>
              {o.ordenesAcondicionamiento.length ? (
                <div className="flex flex-wrap gap-2">
                  {o.ordenesAcondicionamiento.map((c) => (
                    <span key={c.id} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
                      <b className="tabular-nums text-primary">{formatOC(c.ocNumber)}</b> · {dia(c.processDate)} ·{' '}
                      {c.status === 'facturado' ? 'Cerrada' : c.status === 'activo' ? 'Activa' : 'Inactiva'}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {estado === 'facturado' ? 'Cerrada y aún sin orden de acondicionamiento.' : 'Se crea cuando la orden se cierre.'}
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Productos trasladados ({items.length})</h3>
              {items.length ? (
                <div className="overflow-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
                      <tr className="[&>th]:h-9 [&>th]:px-3">
                        <th>Código de barras</th>
                        <th>Producto</th>
                        <th className="text-right">Unds</th>
                        <th className="text-right">Neto etiqueta</th>
                        <th className="text-right">Neto (kg)</th>
                        <th>Registrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((i) => (
                        <tr key={i.id} className="h-10 [&>td]:px-3">
                          <td className="font-mono font-semibold">{i.codigo}</td>
                          <td className="uppercase">
                            {i.productoCodigo} - {i.productoNombre}
                          </td>
                          <td className="text-right tabular-nums">{i.unds}</td>
                          <td className="text-right tabular-nums text-muted-foreground">{kg(i.netoEtiquetaKg)}</td>
                          <td className="text-right font-semibold tabular-nums">{kg(i.netoKg)}</td>
                          <td className="text-xs text-muted-foreground">{fechaHora(i.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Aún no tiene productos. Se registran en Logística → Traslado.
                </p>
              )}
            </section>
          </div>
        )}
      </Dialog>

      {pedirMotivo && o && (
        <Dialog open onClose={() => setPedirMotivo(false)} title={`Anular ${formatOT(o.otNumber)}`} className="max-w-lg">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              La orden queda anulada (no se borra) y sale de las listas. Escribe el motivo; luego un supervisor autoriza con su PIN.
            </p>
            <textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Ej.: orden creada por error, cliente equivocado…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPedirMotivo(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={motivo.trim().length < 5}
                onClick={() => {
                  setPedirMotivo(false);
                  setPin('anular');
                }}
              >
                Continuar
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {pin && o && (
        <SupervisorPinDialog
          open
          title={pin === 'anular' ? `Anular ${formatOT(o.otNumber)}` : `Reabrir ${formatOT(o.otNumber)}`}
          description={
            pin === 'anular' ? (
              <>
                Motivo: <b>{motivo.trim()}</b>
              </>
            ) : (
              'La orden vuelve a quedar activa en Traslado para agregar o quitar productos.'
            )
          }
          accion={pin === 'anular' ? 'Anular orden' : 'Reabrir orden'}
          onClose={() => setPin(null)}
          onConfirm={async (p) => {
            try {
              if (pin === 'anular') await anular.mutateAsync({ id: o.id, pin: p, motivo: motivo.trim() });
              else await reabrir.mutateAsync({ id: o.id, pin: p });
              onAviso(`Orden ${formatOT(o.otNumber)} ${pin === 'anular' ? 'anulada' : 'reabierta'}.`);
              setPin(null);
              setMotivo('');
              return null;
            } catch (err) {
              return mensajeApi(err, 'No se pudo completar la acción.');
            }
          }}
        />
      )}
    </>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold">{children}</div>
    </div>
  );
}

function RegistrarOrdenTrasladoForm({
  inicial,
  onCreada,
}: {
  inicial?: { clienteId: string; processDate: string };
  onCreada?: (otNumber: number) => void;
}) {
  const hoy = today();
  const keyboard = useKeyboard();
  const next = useOrdenTrasladoNextNumber();
  const crear = useCreateOrdenTraslado();
  const clientes = useClientesActivos();

  const [processDate, setProcessDate] = useState(inicial?.processDate ?? manana(hoy));
  const [clienteId, setClienteId] = useState(inicial?.clienteId ?? '');
  const [status, setStatus] = useState<OrdenDespachoStatus>('activo');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const clienteOptions = useMemo(
    () =>
      (clientes.data ?? []).map((c) => ({
        value: c.id,
        label: `${c.nit ?? 'SIN NIT'} - ${c.concepto}`,
      })),
    [clientes.data],
  );

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!clienteId) return setError('Selecciona el cliente.');
    if (!processDate) return setError('Selecciona la fecha de proceso.');
    try {
      const created = await crear.mutateAsync({
        clienteId,
        registrationDate: hoy,
        processDate,
        status,
      });
      setOkMsg(`Orden de traslado ${formatOT(created.otNumber)} registrada.`);
      void next.refetch();
      setProcessDate(manana(hoy));
      setClienteId('');
      setStatus('activo');
      onCreada?.(created.otNumber);
    } catch (err) {
      const detail = (
        err as { response?: { data?: { message?: string | string[] } } }
      ).response?.data?.message;
      setError(
        Array.isArray(detail)
          ? detail.join(' ')
          : detail || 'No se pudo registrar la orden de traslado.',
      );
    }
  }

  return (
    <div>
      <div>
        <form onSubmit={guardar} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              OT N.º
            </Label>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
              {next.data ? formatOT(next.data.next) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Se asigna automáticamente al guardar.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ot-fec-registro">Fecha de registro</Label>
              <Input
                id="ot-fec-registro"
                type="date"
                className="h-9"
                value={hoy}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-fec-proceso">Fecha de proceso</Label>
              <Input
                id="ot-fec-proceso"
                type="date"
                className="h-9"
                value={processDate}
                min={hoy}
                onChange={(e) => setProcessDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ot-cliente">Cliente</Label>
            <Combobox
              id="ot-cliente"
              className="h-9"
              options={clienteOptions}
              value={clienteId}
              onChange={setClienteId}
              placeholder={clientes.isLoading ? 'Cargando…' : 'Buscar cliente por NIT o nombre…'}
              emptyText="Sin clientes activos"
              onKeyboard={keyboard.open}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ot-estado">Estado</Label>
            <Select
              id="ot-estado"
              className="h-9 sm:max-w-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrdenDespachoStatus)}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              <option value="facturado">Facturado</option>
            </Select>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {okMsg && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {okMsg}
            </p>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <Button
              type="submit"
              size="lg"
              className="h-9 px-8"
              disabled={!clienteId || !processDate || crear.isPending}
            >
              <Save className="size-5" />
              {crear.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

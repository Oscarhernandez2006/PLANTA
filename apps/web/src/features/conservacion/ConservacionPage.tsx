import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Building2,
  Copy,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Snowflake,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn } from '@/lib/utils';
import { useProductsAdmin } from '../products/api';
import {
  useActualizarConservacion,
  useAsignarProducto,
  useConservacionClientes,
  useCopiarConservacion,
  useProductosCliente,
  type ConservacionCliente,
  type ProductoAsignado,
} from './api';

const etiquetaCliente = (c: ConservacionCliente) => `${c.nit ?? 'SIN NIT'} - ${c.concepto}`;

export type VistaConservacion = 'caducidad' | 'piezas';

/** Por qué un producto necesita revisión (misma regla que el API). */
function alertaDe(p: Pick<ProductoAsignado, 'refrigeradoDias' | 'congeladoDias'>) {
  if (p.refrigeradoDias === 0) return 'Sin caducidad refrigerada: la etiqueta vencería el mismo día del empaque.';
  if (p.congeladoDias > 0 && p.congeladoDias < p.refrigeradoDias) return 'Congelado dura menos que refrigerado: revisa los días.';
  return null;
}

export function ConservacionPage({ vistaInicial = 'caducidad' }: { vistaInicial?: VistaConservacion }) {
  const clientes = useConservacionClientes();
  const rows = clientes.data ?? [];
  const [busqueda, setBusqueda] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaConservacion>(vistaInicial);

  const q = busqueda.trim().toLowerCase();
  // Al buscar se incluyen todos los clientes, para poder configurar uno nuevo.
  const visibles = rows.filter((c) => (verTodos || q || c.productos > 0) && (!q || etiquetaCliente(c).toLowerCase().includes(q)));
  const cliente = rows.find((c) => c.id === clienteId) ?? visibles[0] ?? null;
  const configurados = rows.filter((c) => c.productos > 0).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Snowflake className="size-9 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Conservación</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Productos de cada cliente: caducidad y temperatura, y piezas que salen por canal en el desposte.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ['caducidad', 'Caducidad'],
              ['piezas', 'Piezas desposte'],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => setVista(k)}
              className={cn(
                'h-10 rounded-md px-5 text-sm font-semibold transition-colors',
                vista === k ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-10 pl-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente o NIT/C.C…" />
              </div>
              <Button variant="outline" className="h-10 px-3" onClick={() => clientes.refetch()} disabled={clientes.isFetching} title="Refrescar">
                <RefreshCw className={clientes.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {configurados} configurado(s) de {rows.length}
              </span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
                Ver todos los clientes
              </label>
            </div>
          </div>
          {clientes.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : !visibles.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {q ? 'Ningún cliente coincide con la búsqueda.' : 'Ningún cliente tiene productos configurados. Activa "Ver todos los clientes".'}
            </p>
          ) : (
            <ul className="scrollbar-app min-h-0 flex-1 space-y-1 overflow-auto p-2">
              {visibles.map((c) => {
                const sel = cliente?.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setClienteId(c.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        sel ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-transparent hover:bg-muted/60',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold uppercase">{c.concepto}</div>
                        <div className="text-xs text-muted-foreground">{c.nit ? `NIT ${c.nit}` : 'Sin NIT'}</div>
                      </div>
                      {c.alertas > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800" title="Productos por revisar">
                          <AlertTriangle className="size-3" />
                          {c.alertas}
                        </span>
                      )}
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                          c.productos ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {c.productos}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {cliente ? (
          <DetalleCliente key={cliente.id} cliente={cliente} clientes={rows} vista={vista} />
        ) : (
          <section className="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            Elige un cliente para ver su conservación.
          </section>
        )}
      </div>
    </div>
  );
}

function DetalleCliente({
  cliente,
  clientes,
  vista,
}: {
  cliente: ConservacionCliente;
  clientes: ConservacionCliente[];
  vista: VistaConservacion;
}) {
  const keyboard = useKeyboard();
  const asignados = useProductosCliente(cliente.id);
  const catalogo = useProductsAdmin('');
  const [agregando, setAgregando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [editando, setEditando] = useState<ProductoAsignado | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);

  const lista = asignados.data ?? [];
  const conAlerta = lista.filter((p) => alertaDe(p)).length;
  const sinRefrigerado = lista.filter((p) => p.refrigeradoDias === 0).length;
  const congelables = lista.filter((p) => p.congeladoDias > 0).length;
  const inactivos = lista.filter((p) => !p.active).length;
  const q = busqueda.trim().toUpperCase();
  const filtrados = lista.filter(
    (p) =>
      (!soloAlertas || alertaDe(p)) &&
      (!q ||
        p.codigo.toUpperCase().includes(q) ||
        p.nombre.toUpperCase().includes(q) ||
        p.tipo.toUpperCase().includes(q) ||
        (p.refPluSku ?? '').toUpperCase().includes(q)),
  );
  const opciones = useMemo(() => {
    const ya = new Set(lista.map((p) => p.id));
    return (catalogo.data ?? [])
      .filter((p) => p.active && !ya.has(p.id))
      .map((p) => ({ value: p.id, label: `${p.codigo} - ${p.nombre}` }));
  }, [catalogo.data, lista]);

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <Building2 className="size-7 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold uppercase">{cliente.concepto}</h2>
          <p className="text-sm text-muted-foreground">{cliente.nit ? `NIT ${cliente.nit}` : 'Sin NIT registrado'}</p>
        </div>
        <Button variant="outline" className="h-10" onClick={() => setCopiando(true)}>
          <Copy className="size-4" />
          Copiar de otro cliente
        </Button>
        <Button className="h-10" onClick={() => setAgregando(true)}>
          <Plus className="size-5" />
          Agregar conservación
        </Button>
      </div>

      {vista === 'piezas' ? (
        <PiezasDespostePanel clienteId={cliente.id} lista={lista} cargando={asignados.isLoading} />
      ) : (
      <>
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador icon={Package} titulo="Productos" valor={lista.length} detalle={inactivos ? `${inactivos} inactivo(s) en el catálogo` : 'Todos activos'} />
        <Indicador
          icon={AlertTriangle}
          titulo="Por revisar"
          valor={conAlerta}
          detalle={conAlerta ? 'Caducidad o días a corregir' : 'Todo configurado'}
          alerta={conAlerta > 0}
        />
        <Indicador icon={Snowflake} titulo="Sin caducidad refrigerada" valor={sinRefrigerado} detalle="Vencerían el día del empaque" alerta={sinRefrigerado > 0} />
        <Indicador icon={Snowflake} titulo="Se pueden congelar" valor={congelables} detalle="Tienen días de congelado" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 pr-8"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar código, producto, tipo o PLU…"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                title="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 px-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
            Solo por revisar
          </label>
          <p className="ml-auto pr-2 text-xs text-muted-foreground">
            {filtrados.length} de {lista.length} producto(s)
          </p>
        </div>
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
              <tr className="[&>th]:px-3 [&>th]:py-2">
                <th>Código</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>PLU / SKU</th>
                <th className="text-center">Refrigerado</th>
                <th className="text-center">Congelado</th>
                <th className="text-center">Piezas / canal</th>
                <th className="text-center">Und / caja</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {asignados.isLoading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    <LoaderCircle className="mx-auto size-6 animate-spin" />
                  </td>
                </tr>
              ) : !lista.length ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    Este cliente aún no tiene productos. Usa <b>Copiar de otro cliente</b> o <b>Agregar conservación</b>.
                  </td>
                </tr>
              ) : !filtrados.length ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    Ningún producto coincide con los filtros.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => {
                  const alerta = alertaDe(p);
                  const congMenor = p.congeladoDias > 0 && p.congeladoDias < p.refrigeradoDias;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setEditando(p)}
                      title={alerta ?? 'Editar conservación'}
                      className={cn(
                        'h-11 cursor-pointer transition-colors [&>td]:px-3',
                        alerta ? 'bg-amber-50/60 hover:bg-amber-100/60' : 'hover:bg-muted/40',
                        !p.active && 'text-muted-foreground',
                      )}
                    >
                      <td className="font-semibold tabular-nums">{p.codigo}</td>
                      <td className="font-medium uppercase">
                        {p.nombre}
                        {!p.active && <span className="ml-1 text-xs normal-case">(inactivo)</span>}
                      </td>
                      <td className="text-xs">{p.tipo}</td>
                      <td className="tabular-nums">{p.refPluSku || '—'}</td>
                      <td className="text-center">
                        <Dias dias={p.refrigeradoDias} temp={p.refrigeradoTemp} alerta={p.refrigeradoDias === 0} />
                      </td>
                      <td className="text-center">
                        {p.congeladoDias > 0 ? (
                          <Dias dias={p.congeladoDias} temp={p.congeladoTemp} alerta={congMenor} />
                        ) : (
                          <span className="text-xs text-muted-foreground">No aplica</span>
                        )}
                      </td>
                      <td className="text-center tabular-nums">{p.piezasPorCanal}</td>
                      <td className="text-center tabular-nums">{p.undsPorCaja}</td>
                      <td className="text-right">
                        <Pencil className="ml-auto size-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {agregando && (
        <AgregarConservacionDialog
          cliente={cliente}
          opciones={opciones}
          cargandoProductos={catalogo.isLoading}
          onKeyboard={keyboard.open}
          onClose={() => setAgregando(false)}
        />
      )}
      {editando && <EditarConservacionDialog cliente={cliente} producto={editando} onClose={() => setEditando(null)} />}
      {copiando && (
        <CopiarDialog
          cliente={cliente}
          origenes={clientes.filter((c) => c.productos > 0 && c.id !== cliente.id)}
          onKeyboard={keyboard.open}
          onClose={() => setCopiando(false)}
        />
      )}
    </section>
  );
}

// Más piezas por canal que esto es casi seguro un error de digitación.
const PIEZAS_MAX_NORMAL = 20;
const UNDS_MAX_NORMAL = 50;

function alertaPiezas(p: Pick<ProductoAsignado, 'piezasPorCanal' | 'undsPorCaja'>) {
  if (p.piezasPorCanal === 1 && p.undsPorCaja === 1) return 'Sin configurar: 1 pieza por canal y 1 por caja (valores por defecto).';
  if (p.piezasPorCanal > PIEZAS_MAX_NORMAL) return `Más de ${PIEZAS_MAX_NORMAL} piezas por canal: revisa el valor.`;
  if (p.undsPorCaja > UNDS_MAX_NORMAL) return `Más de ${UNDS_MAX_NORMAL} unidades por caja: revisa el valor.`;
  return null;
}

/** Piezas por canal y unidades por caja de cada producto, con edición rápida y simulador del desposte. */
function PiezasDespostePanel({ clienteId, lista, cargando }: { clienteId: string; lista: ProductoAsignado[]; cargando: boolean }) {
  const actualizar = useActualizarConservacion(clienteId);
  const [busqueda, setBusqueda] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [masivo, setMasivo] = useState({ piezas: '', unds: '' });
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canales, setCanales] = useState(10);

  const sinConfigurar = lista.filter((p) => p.piezasPorCanal === 1 && p.undsPorCaja === 1).length;
  const raros = lista.filter((p) => p.piezasPorCanal > PIEZAS_MAX_NORMAL || p.undsPorCaja > UNDS_MAX_NORMAL).length;
  const q = busqueda.trim().toUpperCase();
  const filtrados = lista.filter(
    (p) => (!soloAlertas || alertaPiezas(p)) && (!q || p.codigo.toUpperCase().includes(q) || p.nombre.toUpperCase().includes(q)),
  );
  const todosMarcados = filtrados.length > 0 && filtrados.every((p) => marcados.has(p.id));
  const simulacion = filtrados
    .map((p) => {
      const piezas = canales * p.piezasPorCanal;
      return { p, piezas, cajas: Math.ceil(piezas / Math.max(1, p.undsPorCaja)) };
    })
    .filter((s) => s.piezas > 0);

  function guardar(p: ProductoAsignado, datos: { piezasPorCanal?: number; undsPorCaja?: number }) {
    setError(null);
    actualizar.mutate(
      { productId: p.id, ...datos },
      { onError: (err) => setError(isAxiosError(err) && typeof err.response?.data?.message === 'string' ? err.response.data.message : 'No se pudo guardar.') },
    );
  }

  async function aplicarMasivo() {
    const piezas = Number(masivo.piezas);
    const unds = Number(masivo.unds);
    const datos = {
      ...(masivo.piezas && piezas >= 1 ? { piezasPorCanal: Math.min(999, piezas) } : {}),
      ...(masivo.unds && unds >= 1 ? { undsPorCaja: Math.min(999, unds) } : {}),
    };
    if (!Object.keys(datos).length || !marcados.size) return;
    setAplicando(true);
    setError(null);
    try {
      await Promise.all([...marcados].map((productId) => actualizar.mutateAsync({ productId, ...datos })));
      setMarcados(new Set());
      setMasivo({ piezas: '', unds: '' });
    } catch {
      setError('No se pudieron guardar todos los cambios.');
    } finally {
      setAplicando(false);
    }
  }

  return (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador icon={Package} titulo="Productos" valor={lista.length} detalle="Configurados para este cliente" />
        <Indicador
          icon={AlertTriangle}
          titulo="Sin configurar"
          valor={sinConfigurar}
          detalle="1 pieza por canal y 1 por caja"
          alerta={sinConfigurar > 0}
        />
        <Indicador icon={AlertTriangle} titulo="Fuera de lo normal" valor={raros} detalle={`Más de ${PIEZAS_MAX_NORMAL} piezas o ${UNDS_MAX_NORMAL} und`} alerta={raros > 0} />
        <Indicador
          icon={Boxes}
          titulo="Piezas por canal"
          valor={lista.reduce((s, p) => s + p.piezasPorCanal, 0)}
          detalle="Suma de todos los productos"
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar código o producto…" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 px-2 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
              Solo por revisar
            </label>
            {marcados.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2 rounded-lg border-2 border-primary/30 bg-primary/5 px-2 py-1">
                <span className="text-sm font-semibold">{marcados.size} marcado(s):</span>
                <Input
                  className="h-9 w-24"
                  inputMode="numeric"
                  placeholder="Piezas"
                  value={masivo.piezas}
                  onChange={(e) => setMasivo({ ...masivo, piezas: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                />
                <Input
                  className="h-9 w-24"
                  inputMode="numeric"
                  placeholder="Und/caja"
                  value={masivo.unds}
                  onChange={(e) => setMasivo({ ...masivo, unds: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                />
                <Button className="h-9" onClick={() => void aplicarMasivo()} disabled={aplicando || (!masivo.piezas && !masivo.unds)}>
                  {aplicando ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Aplicar
                </Button>
              </div>
            )}
          </div>
          {error && <p className="mx-3 mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={todosMarcados}
                      onChange={() => setMarcados(todosMarcados ? new Set() : new Set(filtrados.map((p) => p.id)))}
                      aria-label="Marcar todos"
                    />
                  </th>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="text-center">Piezas por canal</th>
                  <th className="text-center">Unidades por caja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      <LoaderCircle className="mx-auto size-6 animate-spin" />
                    </td>
                  </tr>
                ) : !filtrados.length ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      {lista.length ? 'Ningún producto coincide con los filtros.' : 'Este cliente aún no tiene productos configurados.'}
                    </td>
                  </tr>
                ) : (
                  filtrados.map((p) => {
                    const alerta = alertaPiezas(p);
                    return (
                      <tr key={p.id} title={alerta ?? undefined} className={cn('h-14 [&>td]:px-3', alerta ? 'bg-amber-50/60' : 'hover:bg-muted/30')}>
                        <td>
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            checked={marcados.has(p.id)}
                            onChange={() =>
                              setMarcados((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              })
                            }
                            aria-label={`Marcar ${p.nombre}`}
                          />
                        </td>
                        <td className="font-semibold tabular-nums">{p.codigo}</td>
                        <td className="font-medium uppercase">
                          {p.nombre}
                          {alerta && <div className="text-[11px] font-semibold normal-case text-amber-700">{alerta}</div>}
                        </td>
                        <td>
                          <Paso valor={p.piezasPorCanal} onChange={(n) => guardar(p, { piezasPorCanal: n })} />
                        </td>
                        <td>
                          <Paso valor={p.undsPorCaja} onChange={(n) => guardar(p, { undsPorCaja: n })} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Simulador */}
        <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Simulador del desposte</h3>
            <p className="text-xs text-muted-foreground">Cuánto debería salir de los productos de la lista con esta cantidad de canales.</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-sm font-semibold">Canales</span>
            <Paso valor={canales} onChange={setCanales} max={9999} />
          </div>
          <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5">
                  <th>Producto</th>
                  <th className="text-right">Piezas</th>
                  <th className="text-right">Cajas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {simulacion.map(({ p, piezas, cajas }) => (
                  <tr key={p.id} className="[&>td]:px-2 [&>td]:py-1.5">
                    <td className="max-w-40 truncate uppercase" title={p.nombre}>
                      {p.nombre}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{piezas}</td>
                    <td className="text-right tabular-nums">{cajas}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted font-semibold">
                <tr className="[&>td]:px-2 [&>td]:py-1.5">
                  <td>Total</td>
                  <td className="text-right tabular-nums">{simulacion.reduce((s, x) => s + x.piezas, 0)}</td>
                  <td className="text-right tabular-nums">{simulacion.reduce((s, x) => s + x.cajas, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/** Número con botones − / + grandes (táctil); al escribir se guarda al salir del campo o con Enter. */
function Paso({ valor, onChange, max = 999 }: { valor: number; onChange: (n: number) => void; max?: number }) {
  const [texto, setTexto] = useState<string | null>(null);
  const confirmar = () => {
    if (texto == null) return;
    const n = Math.min(max, Math.max(1, Number(texto) || 1));
    setTexto(null);
    if (n !== valor) onChange(n);
  };
  const boton = 'flex size-10 items-center justify-center rounded-lg border border-border bg-card text-lg font-bold hover:bg-muted disabled:opacity-40';
  return (
    <div className="mx-auto flex w-fit items-center gap-1">
      <button type="button" className={boton} onClick={() => onChange(valor - 1)} disabled={valor <= 1} aria-label="Restar">
        −
      </button>
      <input
        value={texto ?? String(valor)}
        onChange={(e) => setTexto(e.target.value.replace(/\D/g, '').slice(0, String(max).length))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        inputMode="numeric"
        className="h-10 w-14 rounded-lg border border-input bg-background text-center text-base font-bold tabular-nums outline-none focus:border-primary"
      />
      <button type="button" className={boton} onClick={() => onChange(valor + 1)} disabled={valor >= max} aria-label="Sumar">
        +
      </button>
    </div>
  );
}

function Dias({ dias, temp, alerta }: { dias: number; temp: string; alerta: boolean }) {
  return (
    <span className={cn('inline-flex flex-col leading-tight', alerta && 'rounded-md bg-amber-200/70 px-2 py-0.5 text-amber-900')}>
      <b className="tabular-nums">{dias} días</b>
      <span className="text-[11px] text-muted-foreground">{temp}</span>
    </span>
  );
}

function Indicador({
  icon: Icon,
  titulo,
  valor,
  detalle,
  alerta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  valor: React.ReactNode;
  detalle: string;
  alerta?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-3 shadow-sm', alerta ? 'border-amber-300 bg-amber-50' : 'border-border')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('size-4', alerta ? 'text-amber-600' : 'text-primary')} />
        {titulo}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', alerta && 'text-amber-800')}>{valor}</div>
      <div className="text-xs text-muted-foreground">{detalle}</div>
    </div>
  );
}

/** Copia días, temperaturas, PLU y piezas de otro cliente: lo más rápido para configurar un cliente nuevo. */
function CopiarDialog({
  cliente,
  origenes,
  onKeyboard,
  onClose,
}: {
  cliente: ConservacionCliente;
  origenes: ConservacionCliente[];
  onKeyboard: () => void;
  onClose: () => void;
}) {
  const copiar = useCopiarConservacion(cliente.id);
  const [origenId, setOrigenId] = useState('');
  const [sobrescribir, setSobrescribir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ creados: number; actualizados: number; omitidos: number } | null>(null);
  const origen = origenes.find((c) => c.id === origenId);

  async function confirmar() {
    setError(null);
    try {
      setResultado(await copiar.mutateAsync({ origenId, sobrescribir }));
    } catch (err) {
      const m = isAxiosError(err) ? err.response?.data?.message : null;
      setError(typeof m === 'string' ? m : 'No se pudo copiar la conservación.');
    }
  }

  return (
    <Dialog open onClose={onClose} title="Copiar conservación de otro cliente" description={`Destino: ${etiquetaCliente(cliente)}`}>
      {resultado ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">Conservación copiada.</p>
            <p>
              {resultado.creados} producto(s) agregado(s)
              {resultado.actualizados ? ` · ${resultado.actualizados} actualizado(s)` : ''}
              {resultado.omitidos ? ` · ${resultado.omitidos} ya existían y no se tocaron` : ''}.
            </p>
          </div>
          <div className="flex justify-end">
            <Button className="h-10 px-8" onClick={onClose}>
              Listo
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="copiar-origen">Copiar desde</Label>
            <Combobox
              id="copiar-origen"
              className="h-10"
              options={origenes.map((c) => ({ value: c.id, label: `${c.concepto} · ${c.productos} productos` }))}
              value={origenId}
              onChange={setOrigenId}
              placeholder="Buscar cliente con productos configurados…"
              emptyText="Ningún otro cliente tiene productos configurados"
              onKeyboard={onKeyboard}
            />
          </div>
          {origen && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm">
              Se copiarán los <b>{origen.productos}</b> productos de <b>{origen.concepto}</b> con sus días de caducidad, temperaturas, PLU,
              piezas por canal y unidades por caja.
            </p>
          )}
          {cliente.productos > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-4 py-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} />
              <span>
                <b>Reemplazar los que ya tiene.</b> {cliente.concepto} ya tiene {cliente.productos} producto(s); si no lo marcas, esos se dejan como
                están y solo se agregan los que le faltan.
              </span>
            </label>
          )}
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" className="h-10" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="h-10 px-6" onClick={() => void confirmar()} disabled={!origenId || copiar.isPending}>
              {copiar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Copy className="size-4" />}
              Copiar
            </Button>
          </div>
        </div>
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

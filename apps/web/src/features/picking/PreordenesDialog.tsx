import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { ArrowLeft, Check, FileSpreadsheet, LoaderCircle, Pencil, Plus, Trash2, TriangleAlert, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn, soloDecimal } from '@/lib/utils';
import { useProducts } from '../products/api';
import {
  useEliminarPreorden,
  useGuardarPreorden,
  useImportarOrdenesCompra,
  useLiberarPreorden,
  usePicking,
  usePreorden,
  type FilaOrdenCompra,
  type PreordenResumen,
  type TipoPicking,
} from './picking-api';

const kg = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mensajeApi = (err: unknown, porDefecto: string) => {
  if (err instanceof Error && !isAxiosError(err)) return err.message;
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/**
 * Lee el Excel de órdenes de compra del cliente (columnas Dep, Dep Desc, Orden, Plu, PRODUCTO,
 * PEDIDO en kilos). Busca la fila de títulos en las primeras 20 filas.
 */
async function leerExcelOrdenes(file: File): Promise<FilaOrdenCompra[]> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('No se pudo leer el archivo. Guárdalo como Excel .xlsx e inténtalo de nuevo.');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El archivo no tiene hojas.');
  let fila = 0;
  const col: Record<'dep' | 'depDesc' | 'orden' | 'plu' | 'producto' | 'pedido', number> = {
    dep: 0,
    depDesc: 0,
    orden: 0,
    plu: 0,
    producto: 0,
    pedido: 0,
  };
  for (let r = 1; r <= Math.min(ws.rowCount, 20) && !fila; r++) {
    Object.keys(col).forEach((k) => (col[k as keyof typeof col] = 0));
    ws.getRow(r).eachCell((c, i) => {
      const t = normalizar(c.text);
      if (t === 'DEP' || t === 'TIENDA' || t === 'COD TIENDA') col.dep = i;
      else if (t === 'DEP DESC' || t === 'DESC DEP' || t === 'NOMBRE TIENDA') col.depDesc = i;
      else if (t === 'ORDEN' || t === 'OC' || t === 'ORDEN DE COMPRA') col.orden = i;
      else if (t === 'PLU' || t === 'SKU') col.plu = i;
      else if (t === 'PRODUCTO' || t === 'DESCRIPCION') col.producto = i;
      else if (t === 'PEDIDO' || t === 'KG' || t === 'CANTIDAD') col.pedido = i;
    });
    if (col.orden && col.plu && col.pedido) fila = r;
  }
  if (!fila) throw new Error('El archivo debe tener las columnas Orden, Plu y PEDIDO.');

  const filas: FilaOrdenCompra[] = [];
  for (let r = fila + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const texto = (c: number) => (c ? row.getCell(c).text.trim() : '');
    const ocNumero = texto(col.orden);
    const plu = texto(col.plu);
    const crudo = row.getCell(col.pedido).value;
    const kgPedidos =
      typeof crudo === 'number' ? crudo : Number(texto(col.pedido).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (!ocNumero || !plu || !Number.isFinite(kgPedidos) || kgPedidos <= 0) continue;
    filas.push({
      ocNumero,
      plu,
      kgPedidos: Math.round(kgPedidos * 100) / 100,
      tiendaCodigo: texto(col.dep) || undefined,
      tiendaNombre: texto(col.depDesc) || undefined,
      producto: texto(col.producto) || undefined,
    });
  }
  if (!filas.length) throw new Error('No se encontraron filas con orden, PLU y kilos pedidos.');
  return filas;
}

type Vista = { tipo: 'lista' } | { tipo: 'editar'; id: string | null } | { tipo: 'mapeo'; filas: FilaOrdenCompra[]; pendientes: { plu: string; producto: string | null }[] };

/**
 * Pre-órdenes de la orden: una por cada orden de compra del cliente (tienda). La terminal
 * alista cada pre-orden y muestra su avance (por kilos) contra la orden de compra.
 */
export function PreordenesDialog({
  tipo,
  ordenId,
  numero,
  onClose,
  onMensaje,
}: {
  tipo: TipoPicking;
  ordenId: string;
  numero: string;
  onClose: () => void;
  onMensaje: (texto: string) => void;
}) {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });
  const titulo =
    vista.tipo === 'lista'
      ? `Pre-órdenes y órdenes de compra · ${numero}`
      : vista.tipo === 'mapeo'
        ? `Equivalencia de PLU · ${numero}`
        : `${vista.id ? 'Editar' : 'Nueva'} pre-orden · ${numero}`;

  return (
    <Dialog open onClose={onClose} title={titulo} className="max-w-5xl" scrollInterno>
      {vista.tipo === 'lista' ? (
        <Lista tipo={tipo} ordenId={ordenId} onVista={setVista} onMensaje={onMensaje} />
      ) : vista.tipo === 'mapeo' ? (
        <Mapeo
          tipo={tipo}
          ordenId={ordenId}
          filas={vista.filas}
          pendientes={vista.pendientes}
          onVolver={() => setVista({ tipo: 'lista' })}
          onMensaje={onMensaje}
        />
      ) : (
        <Editar tipo={tipo} ordenId={ordenId} id={vista.id} onVolver={() => setVista({ tipo: 'lista' })} onMensaje={onMensaje} />
      )}
    </Dialog>
  );
}

function Lista({
  tipo,
  ordenId,
  onVista,
  onMensaje,
}: {
  tipo: TipoPicking;
  ordenId: string;
  onVista: (v: Vista) => void;
  onMensaje: (texto: string) => void;
}) {
  const picking = usePicking(tipo, ordenId);
  const importar = useImportarOrdenesCompra(tipo, ordenId);
  const eliminar = useEliminarPreorden();
  const liberar = useLiberarPreorden();
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const p = picking.data;

  async function cargar(file: File) {
    setError(null);
    setLeyendo(true);
    try {
      const filas = await leerExcelOrdenes(file);
      const r = await importar.mutateAsync({ filas });
      if (r.pendientes.length) onVista({ tipo: 'mapeo', filas, pendientes: r.pendientes });
      else onMensaje(`Órdenes de compra importadas: ${r.creadas} pre-orden(es) nuevas, ${r.actualizadas} actualizadas.`);
    } catch (e) {
      setError(mensajeApi(e, 'No se pudo importar el archivo.'));
    } finally {
      setLeyendo(false);
      if (archivo.current) archivo.current.value = '';
    }
  }

  function borrar(pre: PreordenResumen) {
    if (!window.confirm(`¿Eliminar la pre-orden ${pre.nombre}?`)) return;
    eliminar.mutate(pre.id, { onError: (e) => setError(mensajeApi(e, 'No se pudo eliminar la pre-orden.')) });
  }

  function soltar(pre: PreordenResumen) {
    if (!window.confirm(`¿Liberar la pre-orden ${pre.nombre}? ${pre.asignado?.nombre ?? 'El alistador'} ya no la tendrá asignada.`)) return;
    liberar.mutate(pre.id, { onError: (e) => setError(mensajeApi(e, 'No se pudo liberar la pre-orden.')) });
  }

  if (picking.isLoading)
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" /> Cargando…
      </div>
    );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avance de la orden</p>
          <p className="text-3xl font-bold tabular-nums">{p?.porcentaje == null ? '—' : `${p.porcentaje.toLocaleString('es-CO')}%`}</p>
          {!!p?.kgPedidos && <p className="text-xs text-muted-foreground">{kg(p.kgPedidos)} kg pedidos</p>}
        </div>
        <input
          ref={archivo}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void cargar(f);
          }}
        />
        <Button variant="outline" className="h-12 px-4" onClick={() => onVista({ tipo: 'editar', id: null })}>
          <Plus className="size-5" /> Pre-orden manual
        </Button>
        <Button className="h-12 px-5 text-base" onClick={() => archivo.current?.click()} disabled={leyendo}>
          {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
          Importar Excel de OC
        </Button>
      </div>

      {error && <MensajeError texto={error} />}

      <div className="scrollbar-app max-h-[55vh] overflow-auto rounded-lg border border-border">
        {!p?.preordenes.length ? (
          <p className="px-3 py-8 text-center text-muted-foreground">
            Sin pre-órdenes. Importa el Excel de órdenes de compra del cliente (una pre-orden por tienda) o crea una manual.
          </p>
        ) : (
          p.preordenes.map((pre) => {
            const pct = pre.porcentaje ?? 0;
            const completa = pre.porcentaje != null && pre.porcentaje >= 100;
            return (
              <div
                key={pre.id}
                className={cn('flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0', completa && 'bg-emerald-50')}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold uppercase">{pre.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {pre.ocNumero ? `OC ${pre.ocNumero} · ` : 'Sin orden de compra · '}
                    {pre.lineasTotal ? `${pre.lineasCompletas}/${pre.lineasTotal} productos · ` : ''}
                    {pre.empaques} empaque(s){pre.porPesar ? ` · ${pre.porPesar} por pesar` : ''}
                  </p>
                  {pre.asignado && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-primary">
                      <UserRound className="size-3.5" /> {pre.asignado.nombre}
                      <button
                        type="button"
                        className="ml-1 rounded px-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        disabled={liberar.isPending}
                        onClick={() => soltar(pre)}
                      >
                        Liberar
                      </button>
                    </p>
                  )}
                  {pre.porcentaje != null && (
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', completa ? 'bg-emerald-600' : 'bg-primary')}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="w-24 text-right">
                  <p className={cn('text-xl font-bold tabular-nums', completa && 'text-emerald-700')}>
                    {pre.porcentaje == null ? '—' : `${pct.toLocaleString('es-CO')}%`}
                  </p>
                  <p className="text-xs text-muted-foreground">{kg(pre.kgAlistados)} kg</p>
                </div>
                <span
                  className={cn(
                    'w-24 rounded-full px-2 py-1 text-center text-xs font-semibold',
                    pre.status === 'terminado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900',
                  )}
                >
                  {pre.status === 'terminado' ? 'Terminada' : 'En curso'}
                </span>
                <Button variant="ghost" size="icon" aria-label={`Editar ${pre.nombre}`} onClick={() => onVista({ tipo: 'editar', id: pre.id })}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${pre.nombre}`}
                  disabled={pre.empaques > 0 || eliminar.isPending}
                  title={pre.empaques > 0 ? 'Tiene empaques alistados' : undefined}
                  onClick={() => borrar(pre)}
                >
                  <Trash2 className="size-4 text-red-600" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** PLU del cliente sin producto equivalente: se eligen aquí y quedan guardados para el cliente. */
function Mapeo({
  tipo,
  ordenId,
  filas,
  pendientes,
  onVolver,
  onMensaje,
}: {
  tipo: TipoPicking;
  ordenId: string;
  filas: FilaOrdenCompra[];
  pendientes: { plu: string; producto: string | null }[];
  onVolver: () => void;
  onMensaje: (texto: string) => void;
}) {
  const productos = useProducts('');
  const importar = useImportarOrdenesCompra(tipo, ordenId);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const opciones = useMemo(
    () => (productos.data ?? []).map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nombre}` })),
    [productos.data],
  );
  const faltan = pendientes.filter((p) => !mapa[p.plu]).length;

  function enviar() {
    if (faltan) return setError(`Falta elegir el producto de ${faltan} PLU.`);
    setError(null);
    importar.mutate(
      { filas, mapeos: pendientes.map((p) => ({ plu: p.plu, productoId: mapa[p.plu] })) },
      {
        onSuccess: (r) => {
          if (r.pendientes.length) return setError(`Aún faltan PLU: ${r.pendientes.map((p) => p.plu).join(', ')}`);
          onMensaje(`Órdenes de compra importadas: ${r.creadas} pre-orden(es) nuevas, ${r.actualizadas} actualizadas.`);
          onVolver();
        },
        onError: (e) => setError(mensajeApi(e, 'No se pudo importar.')),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Estos PLU del cliente aún no tienen producto. Elige el equivalente: queda guardado y la próxima vez se importa solo.
      </p>
      <div className="scrollbar-app max-h-[50vh] overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-28 px-3 py-2 text-left">PLU</th>
              <th className="px-3 py-2 text-left">Producto del cliente</th>
              <th className="w-[45%] px-3 py-2 text-left">Producto equivalente</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((p) => (
              <tr key={p.plu} className={cn('border-t border-border', mapa[p.plu] && 'bg-emerald-50')}>
                <td className="px-3 py-2 font-bold tabular-nums">{p.plu}</td>
                <td className="px-3 py-2 uppercase">{p.producto ?? '—'}</td>
                <td className="px-3 py-1.5">
                  <Combobox
                    options={opciones}
                    value={mapa[p.plu] ?? ''}
                    onChange={(v) => setMapa((m) => ({ ...m, [p.plu]: v }))}
                    placeholder={productos.isLoading ? 'Cargando…' : 'Busca por código o nombre'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <MensajeError texto={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="outline" className="h-12 px-5" onClick={onVolver}>
          <ArrowLeft className="size-5" /> Cancelar
        </Button>
        <Button className="h-12 px-6 text-base" onClick={enviar} disabled={importar.isPending}>
          {importar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
          Guardar e importar
        </Button>
      </div>
    </div>
  );
}

interface Linea {
  productoId: string;
  codigo: string;
  nombre: string;
  plu: string | null;
  kg: string;
}

function Editar({
  tipo,
  ordenId,
  id,
  onVolver,
  onMensaje,
}: {
  tipo: TipoPicking;
  ordenId: string;
  id: string | null;
  onVolver: () => void;
  onMensaje: (texto: string) => void;
}) {
  const pre = usePreorden(id);
  const productos = useProducts('');
  const guardar = useGuardarPreorden(tipo, ordenId);
  const [cargada, setCargada] = useState(!id);
  const [ocNumero, setOcNumero] = useState('');
  const [tiendaCodigo, setTiendaCodigo] = useState('');
  const [tiendaNombre, setTiendaNombre] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cargada || !pre.data) return;
    const d = pre.data;
    setOcNumero(d.ocNumero ?? '');
    setTiendaCodigo(d.tiendaCodigo ?? '');
    setTiendaNombre(d.tiendaNombre ?? '');
    setObservaciones(d.observaciones ?? '');
    setLineas(
      d.avance
        .filter((a) => a.kgPedidos != null)
        .map((a) => ({ productoId: a.productoId, codigo: a.productoCodigo, nombre: a.productoNombre, plu: a.plu, kg: String(a.kgPedidos) })),
    );
    setCargada(true);
  }, [pre.data, cargada]);

  const avance = useMemo(() => new Map((pre.data?.avance ?? []).map((a) => [a.productoId, a])), [pre.data]);
  const fuera = (pre.data?.avance ?? []).filter((a) => !lineas.some((l) => l.productoId === a.productoId) && a.kgAlistados > 0);
  const opciones = useMemo(
    () =>
      (productos.data ?? [])
        .filter((p) => !lineas.some((l) => l.productoId === p.id))
        .map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nombre}` })),
    [productos.data, lineas],
  );
  const totalPedido = lineas.reduce((s, l) => s + (Number(l.kg) || 0), 0);

  function agregar(productoId: string) {
    const p = productos.data?.find((x) => x.id === productoId);
    if (p) setLineas((ls) => [...ls, { productoId: p.id, codigo: p.codigo, nombre: p.nombre, plu: null, kg: '' }]);
  }

  function enviar() {
    const sinKg = lineas.find((l) => !(Number(l.kg) > 0));
    if (sinKg) return setError(`Escribe los kilos pedidos de ${sinKg.nombre}.`);
    if (lineas.length && !ocNumero.trim()) return setError('Escribe el número de la orden de compra.');
    setError(null);
    guardar.mutate(
      {
        id,
        ocNumero: ocNumero.trim() || undefined,
        tiendaCodigo: tiendaCodigo.trim() || undefined,
        tiendaNombre: tiendaNombre.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        lineas: lineas.map((l) => ({ productoId: l.productoId, kgPedidos: Number(Number(l.kg).toFixed(2)) })),
      },
      {
        onSuccess: (r) => {
          onMensaje(`Pre-orden ${r.nombre} guardada: ${lineas.length} producto(s).`);
          onVolver();
        },
        onError: (e) => setError(mensajeApi(e, 'No se pudo guardar la pre-orden.')),
      },
    );
  }

  if (!cargada)
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" /> Cargando…
      </div>
    );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid gap-3 sm:grid-cols-[180px_120px_minmax(0,1fr)]">
        <Campo label="N.º orden de compra" value={ocNumero} onChange={(v) => setOcNumero(v.slice(0, 40))} placeholder="Ej. 4501234" />
        <Campo label="Cód. tienda" value={tiendaCodigo} onChange={(v) => setTiendaCodigo(v.slice(0, 20))} placeholder="Opcional" />
        <Campo label="Tienda" value={tiendaNombre} onChange={(v) => setTiendaNombre(v.slice(0, 120))} placeholder="Opcional" />
      </div>
      <Campo label="Observaciones" value={observaciones} onChange={(v) => setObservaciones(v.slice(0, 500))} placeholder="Opcional" />

      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agregar producto</span>
        <Combobox
          options={opciones}
          value=""
          onChange={(v) => v && agregar(v)}
          placeholder={productos.isLoading ? 'Cargando productos…' : 'Busca por código o nombre'}
          className="mt-1"
        />
      </div>

      <div className="scrollbar-app max-h-[40vh] overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="w-36 px-3 py-2 text-right">Kg pedidos</th>
              <th className="px-3 py-2 text-right">Alistado</th>
              <th className="px-3 py-2 text-right">Pesado</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Agrega los productos que pidió el cliente (o deja vacío para alistar sin orden de compra).
                </td>
              </tr>
            )}
            {lineas.map((l, idx) => {
              const a = avance.get(l.productoId);
              const pedido = Number(l.kg) || 0;
              const alistado = a?.kgAlistados ?? 0;
              const completo = pedido > 0 && alistado >= pedido;
              return (
                <tr key={l.productoId} className={cn('border-t border-border', completo && 'bg-emerald-50')}>
                  <td className="px-3 py-2">
                    <p className="font-semibold uppercase">
                      {l.codigo} · {l.nombre}
                    </p>
                    {l.plu && <p className="text-xs text-muted-foreground">PLU {l.plu}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      value={l.kg}
                      onChange={(e) => {
                        const v = soloDecimal(e.target.value);
                        setLineas((ls) => ls.map((x, i) => (i === idx ? { ...x, kg: v } : x)));
                      }}
                      inputMode="decimal"
                      autoFocus={!l.kg}
                      className="h-10 text-right text-base font-bold tabular-nums"
                    />
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      pedido > 0 && alistado > pedido ? 'font-bold text-amber-700' : completo && 'font-bold text-emerald-700',
                    )}
                  >
                    {kg(alistado)}
                    <span className="block text-xs font-normal text-muted-foreground">{a?.empaques ?? 0} emp.</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{kg(a?.kgPesados ?? 0)}</td>
                  <td className="px-2 py-2">
                    <Button variant="ghost" size="icon" aria-label={`Quitar ${l.nombre}`} onClick={() => setLineas((ls) => ls.filter((_, i) => i !== idx))}>
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {lineas.length > 0 && (
            <tfoot className="border-t border-border bg-muted/40 font-bold">
              <tr>
                <td className="px-3 py-2 text-right text-xs uppercase text-muted-foreground">Total pedido</td>
                <td className="px-3 py-2 text-right tabular-nums">{kg(totalPedido)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {fuera.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Alistado fuera de la orden de compra:</b> {fuera.map((a) => `${a.productoNombre} (${kg(a.kgAlistados)} kg)`).join(' · ')}
        </p>
      )}
      {error && <MensajeError texto={error} />}

      <div className="flex justify-end gap-2">
        <Button variant="outline" className="h-12 px-5" onClick={onVolver}>
          <ArrowLeft className="size-5" /> Volver
        </Button>
        <Button className="h-12 px-6 text-base" onClick={enviar} disabled={guardar.isPending}>
          {guardar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
          Guardar pre-orden
        </Button>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 h-11" />
    </label>
  );
}

function MensajeError({ texto }: { texto: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      <TriangleAlert className="size-4 shrink-0" />
      {texto}
    </p>
  );
}
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Copy, Download, FileUp, Plus, Save, Search, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { cn, plantToday } from '@/lib/utils';
import { useClientesAdmin } from '../clientes/api';
import { descargarExcel, FMT_KG } from './excel';
import {
  mensajeError,
  useCrearListaPrecios,
  useEditarListaPrecios,
  useEliminarListaPrecios,
  useGuardarPrecios,
  useListaPrecios,
  useListasPrecios,
  type ListaPrecios,
  type ListaPreciosResumen,
} from './maestros-api';
import { Encabezado, etiquetaDia, SinDatos } from './ui';

const normalizar = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function PreciosPage() {
  const listas = useListasPrecios();
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const activa = seleccion ?? listas.data?.find((l) => l.vigente && !l.clienteId)?.id ?? listas.data?.[0]?.id ?? null;

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Encabezado
        titulo="Productos y precios"
        descripcion="Listas de precios de venta por kg con fecha de vigencia. Cada lote toma la lista vigente en su fecha; la de un cliente prima sobre la general."
        cargando={listas.isFetching}
        onRefrescar={() => listas.refetch()}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="flex min-h-0 flex-col p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide">Listas</h2>
            <Button size="sm" onClick={() => setNueva(true)}>
              <Plus /> Nueva lista
            </Button>
          </div>
          <div className="scrollbar-app min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {(listas.data ?? []).map((l) => (
              <ItemLista key={l.id} lista={l} activa={l.id === activa} onClick={() => setSeleccion(l.id)} />
            ))}
            {listas.data?.length === 0 && <SinDatos texto="Aún no hay listas" />}
          </div>
        </Card>
        {activa ? <EditorLista key={activa} id={activa} listas={listas.data ?? []} onEliminada={() => setSeleccion(null)} /> : <Card className="p-6"><SinDatos texto="Crea una lista de precios" /></Card>}
      </div>
      {nueva && <NuevaListaDialog listas={listas.data ?? []} onClose={() => setNueva(false)} onCreada={(id) => setSeleccion(id)} />}
    </div>
  );
}

function ItemLista({ lista: l, activa, onClick }: { lista: ListaPreciosResumen; activa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        activa ? 'border-[#156F21] bg-emerald-50' : 'border-border bg-card hover:bg-muted/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight">{l.nombre}</span>
        {l.vigente ? <Badge tone="success">Vigente</Badge> : l.futura ? <Badge tone="info">Futura</Badge> : <Badge>Anterior</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{l.cliente ?? 'General (todos los clientes)'}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5" /> Desde {etiquetaDia(l.vigenteDesde)}/{l.vigenteDesde.slice(0, 4)}
        </span>
        <span className="tabular-nums">
          {l.conPrecio}/{l.productos} con precio
        </span>
      </div>
    </button>
  );
}

function NuevaListaDialog({ listas, onClose, onCreada }: { listas: ListaPreciosResumen[]; onClose: () => void; onCreada: (id: string) => void }) {
  const clientes = useClientesAdmin();
  const crear = useCrearListaPrecios();
  const [nombre, setNombre] = useState('');
  const [vigenteDesde, setVigenteDesde] = useState(plantToday);
  const [clienteId, setClienteId] = useState('');
  const [copiarDeId, setCopiarDeId] = useState(() => listas.find((l) => l.vigente && !l.clienteId)?.id ?? '');
  const [error, setError] = useState('');

  async function guardar() {
    setError('');
    try {
      const l = await crear.mutateAsync({ nombre, vigenteDesde, clienteId: clienteId || undefined, copiarDeId: copiarDeId || undefined });
      onCreada(l.id);
      onClose();
    } catch (e) {
      setError(mensajeError(e, 'No se pudo crear la lista.'));
    }
  }

  return (
    <Dialog open onClose={onClose} title="Nueva lista de precios" description="Desde la fecha de vigencia, los lotes usarán estos precios.">
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <Label htmlFor="np-nombre">Nombre</Label>
          <Input id="np-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. LISTA NOVIEMBRE 2026" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="np-desde">Vigente desde</Label>
            <Input id="np-desde" type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np-copiar">Precios iniciales</Label>
            <Select id="np-copiar" value={copiarDeId} onChange={(e) => setCopiarDeId(e.target.value)}>
              <option value="">Todos en cero</option>
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  Copiar de {l.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="np-cliente">Cliente (opcional)</Label>
          <Combobox
            id="np-cliente"
            options={(clientes.data ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.concepto }))}
            value={clienteId}
            onChange={setClienteId}
            placeholder="General — escribe para elegir un cliente"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={nombre.trim().length < 2 || !vigenteDesde || crear.isPending}>
            <Plus /> Crear lista
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function EditorLista({ id, listas, onEliminada }: { id: string; listas: ListaPreciosResumen[]; onEliminada: () => void }) {
  const q = useListaPrecios(id);
  const guardar = useGuardarPrecios();
  const editar = useEditarListaPrecios();
  const eliminar = useEliminarListaPrecios();
  const [busqueda, setBusqueda] = useState('');
  const [soloSinPrecio, setSoloSinPrecio] = useState(false);
  const [cambios, setCambios] = useState<Map<string, string>>(new Map());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const resumen = listas.find((l) => l.id === id);

  useEffect(() => setCambios(new Map()), [id]);

  const filas = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (q.data?.precios ?? []).filter((p) => {
      const valor = cambios.has(p.productId) ? Number(cambios.get(p.productId)) : p.precioKg;
      if (soloSinPrecio && valor > 0) return false;
      return !t || p.codigo.includes(t) || p.nombre.toUpperCase().includes(t);
    });
  }, [q.data, busqueda, soloSinPrecio, cambios]);

  if (!q.data) return <Card className="p-6"><SinDatos texto="Cargando lista…" /></Card>;
  const lista = q.data;

  async function guardarCambios() {
    setMsg(null);
    const precios = [...cambios].map(([productId, v]) => ({ productId, precioKg: Number(v.replace(',', '.')) || 0 }));
    try {
      const r = await guardar.mutateAsync({ id, precios });
      setCambios(new Map());
      setMsg({ ok: true, texto: `${r.actualizados} precio(s) guardados.` });
    } catch (e) {
      setMsg({ ok: false, texto: mensajeError(e, 'No se pudieron guardar los precios.') });
    }
  }

  async function cargarExcel(file: File) {
    setMsg(null);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      // Busca la fila de títulos con una columna de código y otra de precio.
      let fila = 0;
      let colCodigo = 0;
      let colPrecio = 0;
      for (let r = 1; r <= Math.min(ws.rowCount, 20) && !fila; r++) {
        ws.getRow(r).eachCell((c, i) => {
          const t = normalizar(c.text);
          if (!colCodigo && (t === 'CODIGO' || t.startsWith('COD'))) colCodigo = i;
          if (!colPrecio && (t.includes('PRECIO') || t.includes('VALOR'))) colPrecio = i;
        });
        if (colCodigo && colPrecio) fila = r;
        else {
          colCodigo = 0;
          colPrecio = 0;
        }
      }
      if (!fila) throw new Error('El archivo debe tener columnas CÓDIGO y PRECIO.');
      const precios: { codigo: string; precioKg: number }[] = [];
      for (let r = fila + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const codigo = row.getCell(colCodigo).text.trim();
        const valor = Number(String(row.getCell(colPrecio).text).replace(/[$\s.]/g, '').replace(',', '.'));
        const crudo = row.getCell(colPrecio).value;
        const precio = typeof crudo === 'number' ? crudo : valor;
        if (codigo && Number.isFinite(precio) && precio >= 0) precios.push({ codigo, precioKg: Math.round(precio * 100) / 100 });
      }
      if (!precios.length) throw new Error('No se encontraron filas con código y precio.');
      const r = await guardar.mutateAsync({ id, precios });
      setMsg({
        ok: true,
        texto: `${r.actualizados} precio(s) cargados desde ${file.name}.${r.noEncontrados.length ? ` Códigos que no existen: ${r.noEncontrados.slice(0, 15).join(', ')}${r.noEncontrados.length > 15 ? '…' : ''}` : ''}`,
      });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error && !('isAxiosError' in e) ? e.message : mensajeError(e, 'No se pudo cargar el archivo.') });
    }
  }

  async function plantilla(l: ListaPrecios) {
    await descargarExcel(`Precios ${l.nombre}.xlsx`, [
      {
        nombre: 'Precios',
        titulo: `${l.nombre} — vigente desde ${l.vigenteDesde}${l.cliente ? ` — ${l.cliente}` : ''}`,
        columnas: [
          { titulo: 'CODIGO', valor: (p: (typeof l.precios)[number]) => p.codigo, ancho: 12 },
          { titulo: 'PRODUCTO', valor: (p: (typeof l.precios)[number]) => p.nombre, ancho: 44 },
          { titulo: 'PRECIO KG', valor: (p: (typeof l.precios)[number]) => p.precioKg, ancho: 14, formato: FMT_KG },
        ],
        filas: l.precios,
      },
    ]);
  }

  const conPrecio = lista.precios.filter((p) => p.precioKg > 0).length;

  return (
    <Card className="flex min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ed-nombre">Nombre</Label>
            <Input
              id="ed-nombre"
              key={`n-${lista.nombre}`}
              defaultValue={lista.nombre}
              className="h-9 w-72"
              onBlur={(e) => e.target.value.trim() !== lista.nombre && editar.mutate({ id, nombre: e.target.value.trim() })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-desde">Vigente desde</Label>
            <Input
              id="ed-desde"
              type="date"
              key={`d-${lista.vigenteDesde}`}
              defaultValue={lista.vigenteDesde}
              className="h-9 w-40"
              onBlur={(e) => e.target.value && e.target.value !== lista.vigenteDesde && editar.mutate({ id, vigenteDesde: e.target.value })}
            />
          </div>
          <div className="pb-2 text-sm text-muted-foreground">
            <Tag className="mr-1 inline size-3.5" />
            {lista.cliente ?? 'General'} · {conPrecio}/{lista.precios.length} con precio
            {resumen?.vigente && <Badge tone="success" className="ml-2">Vigente</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={archivo} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) cargarExcel(f); }} />
          <Button variant="outline" onClick={() => plantilla(lista)} title="Descarga la lista para llenarla en Excel">
            <Download /> Plantilla Excel
          </Button>
          <Button variant="outline" onClick={() => archivo.current?.click()} disabled={guardar.isPending}>
            <FileUp /> Cargar Excel
          </Button>
          <Button
            variant="outline"
            title="Eliminar lista"
            onClick={async () => {
              if (!window.confirm(`¿Eliminar la lista "${lista.nombre}"?`)) return;
              await eliminar.mutateAsync(id);
              onEliminada();
            }}
          >
            <Trash2 />
          </Button>
          <Button onClick={guardarCambios} disabled={!cambios.size || guardar.isPending}>
            <Save /> Guardar {cambios.size ? `(${cambios.size})` : ''}
          </Button>
        </div>
      </div>

      {msg && (
        <p className={cn('rounded-md border px-3 py-2 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800')}>
          {msg.texto}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-80">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar por código o producto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloSinPrecio} onChange={(e) => setSoloSinPrecio(e.target.checked)} />
          Solo sin precio
        </label>
        <span className="text-xs text-muted-foreground">
          <Copy className="mr-1 inline size-3.5" />
          Para una nueva vigencia crea otra lista copiando esta: el historial se conserva.
        </span>
      </div>

      <div className="scrollbar-app min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="w-48 px-3 py-2 text-right">Precio por kg</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => {
              const editado = cambios.has(p.productId);
              const valor = editado ? cambios.get(p.productId)! : p.precioKg ? String(p.precioKg) : '';
              return (
                <tr key={p.productId} className={cn('border-t border-border', editado && 'bg-amber-50')}>
                  <td className="px-3 py-1.5 tabular-nums">{p.codigo}</td>
                  <td className="px-3 py-1.5">{p.nombre}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.categoria ?? '—'}</td>
                  <td className="px-3 py-1">
                    <Input
                      inputMode="decimal"
                      className="h-8 text-right tabular-nums"
                      placeholder="0"
                      value={valor}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.,]/g, '');
                        setCambios((prev) => new Map(prev).set(p.productId, v));
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filas.length && <SinDatos texto="Ningún producto coincide" />}
      </div>
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Trash2,
  Barcode,
  LoaderCircle,
  Package,
  ScanLine,
} from 'lucide-react';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  useEtiquetas,
  useCreateEtiqueta,
  useRemoveEtiqueta,
  type Conservacion,
  type RotuladoOrden,
  type RotuladoStage,
} from '../api';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function num(s: string) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function kg(n: number) {
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function EmbalajeTab({
  stage,
  orden,
  productoSel,
  embalajeLabel,
}: {
  stage: RotuladoStage;
  orden: RotuladoOrden | null;
  productoSel: { codigo: string | null; nombre: string } | null;
  embalajeLabel: string;
}) {
  const [codTienda, setCodTienda] = useState('');
  const [codigo, setCodigo] = useState('');
  const [producto, setProducto] = useState('');
  const [sacrificio, setSacrificio] = useState('');
  const [empaque, setEmpaque] = useState(today());
  const [vencimiento, setVencimiento] = useState('');
  const [dias, setDias] = useState('');
  const [conservacion, setConservacion] = useState<Conservacion>('refrigerado');
  const [ref, setRef] = useState('');
  const [tipoEmpaque, setTipoEmpaque] = useState('A GRANEL');
  const [tara, setTara] = useState('');
  const [bruto, setBruto] = useState('');
  const [bodega, setBodega] = useState('');
  const [procesadoPara, setProcesadoPara] = useState('');
  const [imprimir, setImprimir] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const etiquetas = useEtiquetas(orden?.id ?? null);
  const create = useCreateEtiqueta();
  const remove = useRemoveEtiqueta();

  const tiendas = orden?.tiendas ?? [];

  // Al elegir un producto en la pestaña Productos, se carga acá.
  useEffect(() => {
    if (productoSel) {
      setProducto(productoSel.nombre);
      setCodigo(productoSel.codigo ?? '');
    }
  }, [productoSel]);

  const tiendaNombre = useMemo(() => {
    const t = tiendas.find((x) => String(x.codTienda) === codTienda);
    return t?.nombre ?? '';
  }, [tiendas, codTienda]);

  const neto = Math.max(0, num(bruto) - num(tara));

  const rows = etiquetas.data ?? [];
  const totalNeto = rows.reduce((s, r) => s + (r.neto ?? 0), 0);
  const ultima = rows.at(-1) ?? null;

  function limpiar() {
    setCodigo('');
    setProducto('');
    setSacrificio('');
    setVencimiento('');
    setDias('');
    setRef('');
    setTara('');
    setBruto('');
    setError(null);
  }

  async function agregar() {
    setError(null);
    if (!orden) {
      setError('Seleccioná una orden primero.');
      return;
    }
    if (!producto.trim()) {
      setError('Elegí un producto en la pestaña Productos.');
      return;
    }
    try {
      await create.mutateAsync({
        ordenId: orden.id,
        codTienda: codTienda ? parseInt(codTienda, 10) : undefined,
        tienda: tiendaNombre || undefined,
        codigoProducto: codigo.trim() || undefined,
        producto: producto.trim(),
        fechaSacrificio: sacrificio || undefined,
        fechaEmpaque: empaque || undefined,
        fechaVencimiento: vencimiento || undefined,
        dias: dias ? parseInt(dias, 10) : undefined,
        conservacion,
        ref: ref.trim() || undefined,
        empaque: tipoEmpaque.trim() || undefined,
        tara: tara ? num(tara) : undefined,
        bruto: bruto ? num(bruto) : undefined,
        neto,
        bodega: bodega.trim() || undefined,
        procesadoPara: procesadoPara.trim() || undefined,
        imprimir,
      });
      setTara('');
      setBruto('');
    } catch {
      setError('No se pudo registrar la etiqueta.');
    }
  }

  const disabled = !orden;

  return (
    <div className="space-y-4">
      {!orden && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Seleccioná una orden en la pestaña Órdenes para empezar a rotular.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Identificación */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Cód. Tienda</Label>
          <Select
            className="h-9"
            value={codTienda}
            onChange={(e) => setCodTienda(e.target.value)}
            disabled={disabled}
          >
            <option value="">—</option>
            {tiendas.map((t) => (
              <option key={t.codTienda} value={t.codTienda}>
                {t.codTienda}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Tienda</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-red-600">
            {tiendaNombre || '—'}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Lote No.</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-lg font-bold tabular-nums">
            {orden?.lote ?? '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Código</Label>
          <Input
            className="h-9"
            value={codigo}
            readOnly
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label>Producto</Label>
          <Input
            className="h-9"
            value={producto}
            readOnly
            placeholder="Elegí un producto en la pestaña Productos…"
          />
        </div>
      </div>

      {/* Fechas + conservación */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Sacrificio</Label>
          <Input
            type="date"
            className="h-9"
            value={sacrificio}
            onChange={(e) => setSacrificio(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Empaque</Label>
          <Input
            type="date"
            className="h-9 text-red-600"
            value={empaque}
            onChange={(e) => setEmpaque(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Vencimiento</Label>
          <Input
            type="date"
            className="h-9"
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Días</Label>
          <Input
            inputMode="numeric"
            className="h-9"
            value={dias}
            onChange={(e) => setDias(e.target.value.replace(/[^\d]/g, ''))}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Conservación</Label>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          {(['refrigerado', 'congelado'] as Conservacion[]).map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => setConservacion(c)}
              className={cn(
                'h-9 rounded-md border text-sm font-semibold uppercase tracking-wide transition-colors disabled:opacity-50',
                conservacion === c
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-card hover:bg-muted/60',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Ref / empaque / pesos */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label>Ref.</Label>
          <Input
            className="h-9"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Empaque</Label>
          <Input
            className={cn('h-9 font-semibold', tipoEmpaque === 'A GRANEL' && 'text-red-600')}
            value={tipoEmpaque}
            onChange={(e) => setTipoEmpaque(e.target.value.toUpperCase())}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tara (kg)</Label>
          <Input
            inputMode="decimal"
            className="h-9 tabular-nums"
            value={tara}
            onChange={(e) => setTara(e.target.value.replace(/[^\d.]/g, ''))}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Bruto (kg)</Label>
          <Input
            inputMode="decimal"
            className="h-9 tabular-nums text-red-600"
            value={bruto}
            onChange={(e) => setBruto(e.target.value.replace(/[^\d.]/g, ''))}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Neto (kg)</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-lg font-bold tabular-nums text-emerald-600">
            {kg(neto)}
          </div>
        </div>
      </div>

      {/* Bodega / procesado para */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Bodegas</Label>
          <Input
            className="h-9"
            value={bodega}
            onChange={(e) => setBodega(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Procesado Para</Label>
          <Input
            className="h-9"
            value={procesadoPara}
            onChange={(e) => setProcesadoPara(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-emerald-700">
        <input
          type="checkbox"
          className="size-4 accent-emerald-600"
          checked={imprimir}
          onChange={(e) => setImprimir(e.target.checked)}
        />
        Imprimir Etiqueta de Producto
      </label>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          className="h-9 px-5"
          onClick={agregar}
          disabled={disabled || create.isPending}
        >
          {create.isPending ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Barcode className="size-5" />
          )}
          Registrar etiqueta
        </Button>
        <Button
          variant="outline"
          className="h-9 px-5"
          onClick={limpiar}
          disabled={disabled}
        >
          Limpiar
        </Button>
        <Button variant="outline" className="h-9 px-5" disabled={rows.length === 0}>
          <ScanLine className="size-5" />
          Impresión de etiquetas en tirilla ({embalajeLabel})
        </Button>
      </div>

      {/* Etiquetas registradas */}
      <div className="rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH className="w-16">#</TH>
              <TH>Producto</TH>
              <TH className="w-28">Empaque</TH>
              <TH className="w-24 text-right">Neto</TH>
              <TH className="w-32">Etiqueta</TH>
              <TH className="w-16" />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR className="hover:bg-transparent">
                <TD colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Package className="mx-auto mb-1 size-6" />
                  Sin etiquetas registradas para esta orden.
                </TD>
              </TR>
            ) : (
              rows.map((r, i) => (
                <TR key={r.id}>
                  <TD className="tabular-nums">{i + 1}</TD>
                  <TD>{r.producto}</TD>
                  <TD>{r.empaque ?? '—'}</TD>
                  <TD className="text-right tabular-nums">{kg(r.neto ?? 0)}</TD>
                  <TD className="font-mono text-xs">{r.barcode}</TD>
                  <TD>
                    <button
                      onClick={() => remove.mutate(r.id)}
                      className="text-muted-foreground transition-colors hover:text-red-600"
                      title="Eliminar etiqueta"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Unds" value={String(rows.length)} />
        <Stat label="Total Neto (kg)" value={kg(totalNeto)} tone="text-emerald-600" />
        <Stat label="Última etiqueta" value={ultima?.barcode ?? '—'} mono />
        <Stat
          label="Último empaque"
          value={ultima?.empaque ?? '—'}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Módulo: {stage === 'desposte' ? 'Desposte' : 'Acondicionamiento'}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 truncate text-xl font-semibold tabular-nums',
          mono && 'font-mono text-sm',
          tone,
        )}
      >
        {value}
      </p>
    </div>
  );
}

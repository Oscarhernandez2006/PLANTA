import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Pencil, Save, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '../auth/auth-context';
import type { LineaGasto } from './api';
import { descargarFacturacionInterna, type DocumentoFacturacion } from './facturacion-pdf';
import {
  BASE_LABEL,
  CATEGORIA_LABEL,
  mensajeError,
  pesos,
  pesosDec,
  useGuardarServicios,
  useServicios,
  useTarifas,
  type CategoriaTarifa,
  type RefServicios,
  type TarifaBase,
} from './maestros-api';

/** Abrevia valores grandes para gráficas y tarjetas: $ 12,3 M. */
export const millones = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `$ ${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M` : pesos(v);

/** Descarga la facturación interna (PDF) de un lote o proceso. */
export function BotonFacturacion({ documento }: { documento: Omit<DocumentoFacturacion, 'operario'> }) {
  const { user } = useAuth();
  const [generando, setGenerando] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8"
      disabled={generando}
      onClick={async () => {
        setGenerando(true);
        try {
          await descargarFacturacionInterna({ ...documento, operario: user?.fullName ?? '' });
        } finally {
          setGenerando(false);
        }
      }}
    >
      <FileText className="size-4 text-red-700" />
      {generando ? 'Generando…' : 'Facturación interna'}
    </Button>
  );
}

export function Pendientes({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {items.map((p) => (
        <li key={p} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {p}
        </li>
      ))}
    </ul>
  );
}

/** Indicador de utilidad: verde si gana, rojo si pierde, con aviso si faltan datos. */
export function Utilidad({ valor, margen, parcial }: { valor: number; margen: number | null; parcial?: boolean }) {
  return (
    <span className={cn('font-semibold tabular-nums', valor >= 0 ? 'text-[#156F21]' : 'text-red-700')} title={parcial ? 'Faltan datos: el valor es parcial' : undefined}>
      {pesos(valor)}
      {margen != null && <span className="ml-1 text-xs font-normal">({margen.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %)</span>}
      {parcial && <span className="ml-1 text-amber-600">*</span>}
    </span>
  );
}

const CATEGORIAS_DESPOSTE: CategoriaTarifa[] = ['desposte', 'empaque', 'caja', 'bolsa', 'etiqueta', 'servicio'];
const CATEGORIAS_ACOND: CategoriaTarifa[] = ['porcionado', 'inyeccion', 'empaque', 'caja', 'bolsa', 'termoformado', 'etiqueta', 'servicio'];

/**
 * Gastos de proceso de un lote/proceso con sus cantidades. Las que no se calculan
 * solas (cajas, bolsas, termoformados…) se digitan aquí; quedan guardadas.
 */
export function GastosProceso({
  gastos,
  refServicios,
  clienteId,
  tipo,
}: {
  gastos: LineaGasto[];
  refServicios: RefServicios;
  clienteId: string;
  tipo: 'desposte' | 'acond';
}) {
  const [editando, setEditando] = useState(false);
  const total = gastos.reduce((s, g) => s + g.total, 0);
  const th = 'px-2 py-1 text-xs uppercase text-muted-foreground';
  const td = 'px-2 py-1.5 tabular-nums';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gastos de proceso</h3>
        {!editando && (
          <Button variant="outline" size="sm" className="h-7" onClick={() => setEditando(true)}>
            <Pencil className="size-3.5" /> Cantidades
          </Button>
        )}
      </div>
      {editando ? (
        <EditorServicios refServicios={refServicios} clienteId={clienteId} gastos={gastos} categorias={tipo === 'desposte' ? CATEGORIAS_DESPOSTE : CATEGORIAS_ACOND} onClose={() => setEditando(false)} />
      ) : gastos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin gastos calculados. Revisa las tarifas o digita las cantidades.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'text-left')}>Concepto</th>
              <th className={cn(th, 'text-right')}>Cantidad</th>
              <th className={cn(th, 'text-right')}>Tarifa</th>
              <th className={cn(th, 'text-right')}>Total</th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.concepto} className="border-t border-border/60">
                <td className="px-2 py-1.5">
                  {g.concepto}
                  {g.manual && <Badge tone="info" className="ml-2">Digitado</Badge>}
                </td>
                <td className={cn(td, 'text-right')}>
                  {g.cantidad.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                  <span className="ml-1 text-xs text-muted-foreground">{BASE_LABEL[g.base as TarifaBase]?.replace('Por ', '') ?? ''}</span>
                </td>
                <td className={cn(td, 'text-right')}>{pesosDec(g.valorUnitario)}</td>
                <td className={cn(td, 'text-right font-medium')}>{pesos(g.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="px-2 py-1.5" colSpan={3}>
                Total gastos
              </td>
              <td className={cn(td, 'text-right')}>{pesos(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function EditorServicios({
  refServicios,
  clienteId,
  gastos,
  categorias,
  onClose,
}: {
  refServicios: RefServicios;
  clienteId: string;
  gastos: LineaGasto[];
  categorias: CategoriaTarifa[];
  onClose: () => void;
}) {
  const tarifas = useTarifas(clienteId);
  const manuales = useServicios(refServicios);
  const guardar = useGuardarServicios();
  const [valores, setValores] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');

  useEffect(() => {
    if (manuales.data) setValores(new Map(manuales.data.map((m) => [m.concepto, String(m.cantidad)])));
  }, [manuales.data]);

  const conceptos = useMemo(
    () => (tarifas.data ?? []).filter((t) => t.activo && categorias.includes(t.categoria)),
    [tarifas.data, categorias],
  );
  const auto = new Map(gastos.filter((g) => !g.manual).map((g) => [g.concepto, g.cantidad]));

  async function enviar() {
    setError('');
    try {
      await guardar.mutateAsync({
        ...refServicios,
        servicios: [...valores]
          .filter(([, v]) => v.trim() !== '')
          .map(([concepto, v]) => ({ concepto, cantidad: Number(v.replace(',', '.')) || 0, valorUnitario: null })),
      });
      onClose();
    } catch (e) {
      setError(mensajeError(e, 'No se pudieron guardar las cantidades.'));
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        Deja vacío para usar la cantidad calculada (se muestra en gris). Escribe 0 para no cobrar un concepto en este lote.
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {conceptos.map((t) => (
          <label key={t.concepto} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate" title={`${CATEGORIA_LABEL[t.categoria]} · ${BASE_LABEL[t.base]} · ${pesosDec(t.valor)}`}>
              {t.concepto}
              <span className="ml-1 text-xs text-muted-foreground">{pesosDec(t.valor)}</span>
            </span>
            <Input
              inputMode="decimal"
              className="h-8 w-28 text-right tabular-nums"
              placeholder={auto.has(t.concepto) ? String(auto.get(t.concepto)) : '0'}
              value={valores.get(t.concepto) ?? ''}
              onChange={(e) => setValores((prev) => new Map(prev).set(t.concepto, e.target.value.replace(/[^\d.,]/g, '')))}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          <X /> Cancelar
        </Button>
        <Button size="sm" onClick={enviar} disabled={guardar.isPending}>
          <Save /> Guardar cantidades
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Equal,
  LoaderCircle,
  Minus,
  Plus,
  Split,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatOB } from './orden-beneficio-api';

/** Reparte `total` animales en `partes` órdenes lo más parejo posible. */
function repartir(total: number, partes: number) {
  const base = Math.floor(total / partes);
  const resto = total % partes;
  return Array.from({ length: partes }, (_, i) => base + (i < resto ? 1 : 0));
}

/**
 * Antes de crear la orden de beneficio pregunta si va una sola orden con
 * todos los animales de la guía o si se dividen en varias órdenes
 * consecutivas (OB n, n+1…). Al dividir, la suma debe ser exactamente el
 * total de animales disponibles de la guía.
 */
export function DividirOrdenModal({
  open,
  onClose,
  guia,
  cliente,
  disponibles,
  primeraReferencia,
  guardando,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  guia: string;
  cliente: string;
  disponibles: number;
  /** Próximo consecutivo OB (vista previa; se confirma al guardar). */
  primeraReferencia: number | null;
  guardando: boolean;
  error: string | null;
  onConfirm: (cantidades: number[]) => void;
}) {
  const [modo, setModo] = useState<'elegir' | 'dividir'>('elegir');
  const [cantidades, setCantidades] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setModo('elegir');
      setCantidades(repartir(disponibles, 2));
    }
  }, [open, disponibles]);

  const repartidos = cantidades.reduce((s, c) => s + c, 0);
  const faltan = disponibles - repartidos;
  const valido = faltan === 0 && cantidades.every((c) => c >= 1);
  const ob = (i: number) =>
    primeraReferencia != null ? formatOB(primeraReferencia + i) : `Orden ${i + 1}`;

  function setCantidad(i: number, valor: number) {
    // Cada orden lleva al menos 1 animal y no puede pasarse del total.
    const otros = repartidos - cantidades[i];
    const max = Math.max(1, disponibles - otros);
    const v = Math.min(Math.max(1, Math.round(valor) || 1), max);
    setCantidades((cs) => cs.map((c, j) => (j === i ? v : c)));
  }

  function agregarOrden() {
    if (cantidades.length >= disponibles) return;
    setCantidades((cs) => repartir(disponibles, cs.length + 1));
  }

  function quitarOrden(i: number) {
    if (cantidades.length <= 2) return;
    setCantidades((cs) => cs.filter((_, j) => j !== i));
  }

  const btnPaso =
    'flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-border bg-card text-foreground transition-colors hover:bg-muted active:bg-muted disabled:pointer-events-none disabled:opacity-40';

  return (
    <Dialog
      open={open}
      onClose={guardando ? () => {} : onClose}
      title={modo === 'elegir' ? '¿Cómo querés crear la orden?' : 'Dividir en varias órdenes'}
      description={`Guía ${guia} · ${cliente} · ${disponibles} ${disponibles === 1 ? 'animal disponible' : 'animales disponibles'}`}
      className="max-w-2xl"
    >
      {modo === 'elegir' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => onConfirm([disponibles])}
            className="flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
          >
            <span className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {guardando ? (
                <LoaderCircle className="size-7 animate-spin" />
              ) : (
                <ClipboardList className="size-7" />
              )}
            </span>
            <span className="text-lg font-semibold">Una sola orden</span>
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{ob(0)}</span> con los{' '}
              {disponibles} animales de la guía.
            </span>
          </button>
          <button
            type="button"
            disabled={guardando || disponibles < 2}
            onClick={() => setModo('dividir')}
            title={disponibles < 2 ? 'Se necesitan al menos 2 animales para dividir' : undefined}
            className="flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-card p-5 text-left transition-colors hover:border-sky-600 hover:bg-sky-50 disabled:opacity-50"
          >
            <span className="flex size-12 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Split className="size-7" />
            </span>
            <span className="text-lg font-semibold">Dividir en varias órdenes</span>
            <span className="text-sm text-muted-foreground">
              Repartí los {disponibles} animales en 2 o más órdenes consecutivas.
            </span>
          </button>
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Resumen del reparto */}
          <div
            className={cn(
              'rounded-lg border-2 px-4 py-3',
              faltan === 0
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-amber-300 bg-amber-50',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                Repartidos{' '}
                <span className="text-xl font-bold tabular-nums">{repartidos}</span> de{' '}
                <span className="text-xl font-bold tabular-nums">{disponibles}</span>
              </span>
              <span
                className={cn(
                  'text-sm font-semibold',
                  faltan === 0 ? 'text-emerald-700' : 'text-amber-700',
                )}
              >
                {faltan === 0
                  ? '✓ Todos los animales repartidos'
                  : `Faltan ${faltan} ${faltan === 1 ? 'animal' : 'animales'}`}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  faltan === 0 ? 'bg-emerald-500' : 'bg-amber-500',
                )}
                style={{ width: `${Math.min(100, (repartidos / disponibles) * 100)}%` }}
              />
            </div>
          </div>

          {/* Una fila por orden */}
          <ul className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {cantidades.map((c, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border-2 border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Orden {i + 1}
                  </p>
                  <p className="truncate text-lg font-bold tabular-nums text-primary">
                    {ob(i)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Quitar un animal de ${ob(i)}`}
                  className={btnPaso}
                  disabled={c <= 1}
                  onClick={() => setCantidad(i, c - 1)}
                >
                  <Minus className="size-6" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={disponibles}
                  value={c}
                  onChange={(e) => setCantidad(i, Number(e.target.value))}
                  aria-label={`Animales de ${ob(i)}`}
                  className="h-12 w-16 rounded-md border-2 border-border bg-background text-center text-2xl font-bold tabular-nums outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label={`Agregar un animal a ${ob(i)}`}
                  className={btnPaso}
                  disabled={faltan <= 0}
                  onClick={() => setCantidad(i, c + 1)}
                >
                  <Plus className="size-6" />
                </button>
                <span className="w-16 text-sm text-muted-foreground">
                  {c === 1 ? 'animal' : 'animales'}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${ob(i)}`}
                  title={cantidades.length <= 2 ? 'Mínimo 2 órdenes al dividir' : 'Quitar esta orden'}
                  className={cn(btnPaso, 'border-transparent text-red-600 hover:bg-red-50')}
                  disabled={cantidades.length <= 2}
                  onClick={() => quitarOrden(i)}
                >
                  <Trash2 className="size-6" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4 text-base [&_svg]:size-5"
              onClick={agregarOrden}
              disabled={cantidades.length >= disponibles}
            >
              <Plus /> Agregar orden
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4 text-base [&_svg]:size-5"
              onClick={() => setCantidades(repartir(disponibles, cantidades.length))}
            >
              <Equal /> Repartir en partes iguales
            </Button>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4 text-base [&_svg]:size-5"
              onClick={() => setModo('elegir')}
              disabled={guardando}
            >
              <ArrowLeft /> Volver
            </Button>
            <Button
              type="button"
              className="h-12 px-6 text-base [&_svg]:size-5"
              disabled={!valido || guardando}
              onClick={() => onConfirm(cantidades)}
            >
              {guardando ? <LoaderCircle className="animate-spin" /> : <Check />}
              Crear {cantidades.length} órdenes
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Check, Gauge, LoaderCircle, ScanBarcode, Smartphone, TriangleAlert } from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn, soloDecimal } from '@/lib/utils';
import { usePicking, useRegistrarArrume, type ArrumeRegistrado, type TipoPicking } from './picking-api';

const TARAS = [1.5, 1.75, 1.8, 2.02, 0];

const kg = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

/**
 * Pesaje de un arrume: las canastillas alistadas en la terminal (picking) se pesan juntas en
 * la báscula y se registran en la orden repartiendo el neto en proporción a cada etiqueta.
 */
export function ArrumeDialog({
  tipo,
  ordenId,
  numero,
  onClose,
  onRegistrado,
}: {
  tipo: TipoPicking;
  ordenId: string;
  numero: string;
  onClose: () => void;
  onRegistrado: (r: ArrumeRegistrado) => void;
}) {
  const picking = usePicking(tipo, ordenId);
  const registrar = useRegistrarArrume(tipo, ordenId);
  const { peso, setPeso, leyendo, error: errorBascula, leerBascula } = useBascula('0.00');
  const [tecladoPeso, setTecladoPeso] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [taraCanastilla, setTaraCanastilla] = useState(TARAS[0]);
  const [canastillas, setCanastillas] = useState('0');
  const [taraEstiba, setTaraEstiba] = useState('0');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  const p = picking.data;
  const pendientes = useMemo(() => (p?.items ?? []).filter((i) => !i.pesado), [p]);
  const pesados = (p?.items.length ?? 0) - pendientes.length;
  const elegidos = pendientes.filter((i) => seleccion.has(i.codigo));

  // N.º de canastillas sigue a la selección (el operario puede corregirlo).
  useEffect(() => setCanastillas(String(elegidos.length)), [elegidos.length]);
  useEffect(() => setError(errorBascula), [errorBascula]);

  const brutoKg = Number(peso) || 0;
  const taraTotal = Number((taraCanastilla * (Number(canastillas) || 0) + (Number(taraEstiba) || 0)).toFixed(2));
  const neto = Number((brutoKg - taraTotal).toFixed(2));
  const netoEtiquetas = elegidos.reduce((s, i) => s + i.netoEtiquetaKg, 0);
  const diferencia = neto - netoEtiquetas;

  function alternar(c: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  }

  function pistolear() {
    const valor = codigo.trim().toUpperCase();
    setCodigo('');
    if (!valor) return;
    const item = p?.items.find((i) => i.codigo === valor);
    if (!item) return setError(`${valor} no está en el picking de ${numero}.`);
    if (item.pesado) return setError(`${valor} ya fue pesada.`);
    setError(null);
    setSeleccion((s) => new Set(s).add(valor));
  }

  function guardar() {
    if (!elegidos.length) return setError('Selecciona las canastillas del arrume.');
    if (brutoKg <= 0) return setError('Toma el peso del arrume.');
    if (neto <= 0) return setError('El peso bruto debe ser mayor que la tara.');
    setError(null);
    registrar.mutate(
      {
        codigos: elegidos.map((i) => i.codigo),
        pesoBrutoKg: brutoKg,
        taraCanastillaKg: taraCanastilla,
        canastillas: Number(canastillas) || 0,
        taraEstibaKg: Number(taraEstiba) || 0,
      },
      {
        onSuccess: (r) => {
          setSeleccion(new Set());
          setPeso('0.00');
          onRegistrado(r);
          codigoRef.current?.focus();
        },
        onError: (err) => setError(mensajeApi(err, 'No se pudo registrar el arrume.')),
      },
    );
  }

  const todos = pendientes.length > 0 && elegidos.length === pendientes.length;

  return (
    <Dialog open onClose={onClose} title={`Pesar arrume · ${numero}`} className="max-w-5xl" scrollInterno>
      {picking.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" /> Cargando picking…
        </div>
      ) : !p?.items.length ? (
        <Aviso texto="Esta orden no tiene picking. El alistador debe pistolear las canastillas en la terminal móvil." />
      ) : p.status === 'en_curso' ? (
        <Aviso
          texto={`El picking está en curso (${p.items.length} etiquetas). El alistador debe terminarlo en la terminal antes de pesar.`}
        />
      ) : !pendientes.length ? (
        <Aviso ok texto={`Todo el picking ya fue pesado (${pesados} etiquetas).`} />
      ) : (
        <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Canastillas del arrume */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex h-12 items-center gap-2 rounded-xl border-2 border-input bg-background px-3 focus-within:border-primary">
              <ScanBarcode className="size-5 shrink-0 text-muted-foreground" />
              <input
                ref={codigoRef}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') pistolear();
                }}
                autoFocus
                placeholder="Pistolea las canastillas del arrume"
                className="h-full w-full min-w-0 bg-transparent text-lg font-bold tabular-nums outline-none placeholder:text-sm placeholder:font-normal"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={todos}
                  onChange={() => setSeleccion(todos ? new Set() : new Set(pendientes.map((i) => i.codigo)))}
                />
                Seleccionar todo ({pendientes.length} por pesar)
              </label>
              {pesados > 0 && <span className="text-muted-foreground">{pesados} ya pesadas</span>}
            </div>
            <div className="scrollbar-app max-h-[50vh] overflow-auto rounded-lg border border-border">
              {pendientes.map((i) => (
                <label
                  key={i.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0',
                    seleccion.has(i.codigo) ? 'bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <input type="checkbox" className="size-4 accent-primary" checked={seleccion.has(i.codigo)} onChange={() => alternar(i.codigo)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold uppercase">
                      {i.productoCodigo} · {i.productoNombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.codigo} · {i.tipo === 'canastilla' ? 'Canastilla' : 'Pieza'} · {i.unds} und
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{kg(i.netoEtiquetaKg)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Báscula y taras */}
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peso bruto del arrume</span>
              <div className="relative mt-1 flex items-baseline justify-center gap-2 rounded-xl border-2 border-primary/40 bg-muted/30 px-4 py-2 focus-within:border-primary">
                <input
                  value={peso}
                  onChange={(e) => setPeso(soloDecimal(e.target.value))}
                  onClick={() => setTecladoPeso(true)}
                  onFocus={(e) => e.currentTarget.select()}
                  inputMode="none"
                  aria-label="Peso bruto en kg"
                  className="w-full min-w-0 bg-transparent text-right text-4xl font-bold tabular-nums outline-none"
                />
                <span className="text-xl font-semibold text-muted-foreground">kg</span>
                {tecladoPeso && <NumericKeypad value={peso} onChange={setPeso} onClose={() => setTecladoPeso(false)} />}
              </div>
            </div>
            <Button variant="outline" className="h-12 text-base" onClick={() => void leerBascula()} disabled={leyendo}>
              {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
              Leer báscula
            </Button>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tara por canastilla (kg)</span>
              <div className="mt-1 grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
                {TARAS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTaraCanastilla(t)}
                    aria-pressed={taraCanastilla === t}
                    className={cn(
                      'h-9 rounded-md text-sm font-bold tabular-nums transition-colors',
                      taraCanastilla === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-card hover:text-foreground',
                    )}
                  >
                    {t === 0 ? '0.0' : t.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">N.º canastillas</span>
                <Input
                  value={canastillas}
                  onChange={(e) => setCanastillas(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  className="mt-1 h-11 text-right text-lg font-bold tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tara estiba (kg)</span>
                <Input
                  value={taraEstiba}
                  onChange={(e) => setTaraEstiba(soloDecimal(e.target.value))}
                  inputMode="decimal"
                  className="mt-1 h-11 text-right text-lg font-bold tabular-nums"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <Fila label="Bruto" valor={kg(brutoKg)} />
              <Fila label="Tara total" valor={kg(taraTotal)} />
              <Fila label="Neto" valor={kg(Math.max(neto, 0))} className="text-emerald-700" />
              <Fila label="Neto etiquetas" valor={kg(netoEtiquetas)} />
              <Fila
                label="Diferencia"
                valor={kg(elegidos.length && neto > 0 ? diferencia : 0)}
                className={cn('col-span-2', diferencia < 0 ? 'text-red-600' : 'text-blue-700')}
              />
            </div>

            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <TriangleAlert className="size-4 shrink-0" />
                {error}
              </p>
            )}

            <Button className="h-14 text-base" onClick={guardar} disabled={registrar.isPending || !elegidos.length}>
              {registrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
              Registrar arrume ({elegidos.length})
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Aviso({ texto, ok }: { texto: string; ok?: boolean }) {
  return (
    <div
      className={cn(
        'm-6 flex items-center gap-3 rounded-xl border px-4 py-4 text-base',
        ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      <Smartphone className="size-6 shrink-0" />
      {texto}
    </div>
  );
}

function Fila({ label, valor, className }: { label: string; valor: string; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-lg font-bold tabular-nums">{valor}</span>
    </div>
  );
}

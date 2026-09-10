import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Gauge,
  Inbox,
  LoaderCircle,
  Printer,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PielesIcon } from '@/components/icons/PielesIcon';
import { readScale } from '@/lib/device';
import { cn } from '@/lib/utils';
import {
  usePielesLotes,
  usePielLoteDetail,
  useRegistrarPiel,
  useRegistrarPielLote,
  type PielAnimal,
  type PielLoteDetail,
} from './api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function PielesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lotes = usePielesLotes();
  const detail = usePielLoteDetail(selectedId);

  const lista = lotes.data ?? [];
  const refrescando = lotes.isFetching || detail.isFetching;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PielesIcon className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pieles</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Elige un lote para tomar el peso de las pieles de los animales ya
              beneficiados: uno por uno o todo el lote.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{today()}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              lotes.refetch();
              if (selectedId) detail.refetch();
            }}
            disabled={refrescando}
          >
            <RefreshCw className={cn('size-4', refrescando && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {!selectedId ? (
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
            <PielesIcon className="size-4" /> Lotes con animales beneficiados
          </div>
          {lotes.isLoading ? (
            <Loading />
          ) : !lista.length ? (
            <Empty text="Aún no hay animales caídos. En cuanto se insensibilice un animal, su lote aparecerá aquí." />
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((l) => {
                const pct = l.caidos
                  ? Math.round((l.pesados / l.caidos) * 100)
                  : 0;
                const completo = l.pesados === l.caidos;
                return (
                  <li key={l.ordenBeneficioId}>
                    <button
                      onClick={() => setSelectedId(l.ordenBeneficioId)}
                      className="flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">
                          N.º {l.reference} · {l.cliente}
                          {completo && (
                            <CheckCircle2 className="ml-2 inline size-4 text-emerald-600" />
                          )}
                        </div>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {l.pesados}/{l.caidos} pesados
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.guias.length ? l.guias.join(', ') : '—'} · {l.caidos}{' '}
                        caídos de {l.animalCount}
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : detail.isLoading || !detail.data ? (
        <Card>
          <Loading />
        </Card>
      ) : (
        <LoteDetalle data={detail.data} onBack={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function LoteDetalle({
  data,
  onBack,
}: {
  data: PielLoteDetail;
  onBack: () => void;
}) {
  const [modo, setModo] = useState<'individual' | 'lote'>('individual');
  const pendientes = data.animales.filter((a) => !a.pesado);
  const pesados = data.animales.filter((a) => a.pesado);

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Cabecera del lote */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" /> Cambiar lote
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">
              Lote N.º {data.reference} · {data.date}
            </div>
            <div className="text-lg font-semibold">
              {data.cliente}
              {data.guias.length ? (
                <span className="text-muted-foreground">
                  {' '}
                  · {data.guias.join(', ')}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {data.pesados}/{data.caidos} pesados
        </span>
      </div>

      {/* Switch de modo */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-sm font-medium text-muted-foreground">
          Toma de peso:
        </span>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          <button
            onClick={() => setModo('individual')}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              modo === 'individual'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Individual
          </button>
          <button
            onClick={() => setModo('lote')}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              modo === 'lote'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Todo el lote
          </button>
        </div>
      </div>

      {modo === 'individual' ? (
        <IndividualView pendientes={pendientes} pesados={pesados} />
      ) : (
        <LoteView data={data} pendientes={pendientes} pesados={pesados} />
      )}
    </Card>
  );
}

function IndividualView({
  pendientes,
  pesados,
}: {
  pendientes: PielAnimal[];
  pesados: PielAnimal[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Selecciona automáticamente el primer animal por pesar.
  useEffect(() => {
    if (!pendientes.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && pendientes.some((a) => a.eventoId === prev)
        ? prev
        : pendientes[0].eventoId,
    );
  }, [pendientes]);

  const seleccionado = pendientes.find((a) => a.eventoId === selectedId) ?? null;

  return (
    <div className="border-t border-border">
      {seleccionado && (
        <WeighPanel key={seleccionado.eventoId} animal={seleccionado} />
      )}

      <div className="px-5 py-3 text-sm font-semibold">
        Por pesar ({pendientes.length})
      </div>
      {!pendientes.length ? (
        <div className="flex items-center justify-center gap-2 px-5 pb-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" /> Todas las pieles
          de este lote ya fueron pesadas.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {pendientes.map((a) => {
            const activo = a.eventoId === selectedId;
            return (
              <li key={a.eventoId}>
                <button
                  onClick={() => setSelectedId(a.eventoId)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors',
                    activo ? 'bg-emerald-50' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold tabular-nums">
                      #{a.consecutivo}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      cayó {hora(a.stunnedAt)}
                    </span>
                  </div>
                  {activo && (
                    <span className="text-xs font-medium text-emerald-700">
                      Seleccionado
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pesados.length > 0 && (
        <>
          <div className="border-t border-border px-5 py-3 text-sm font-semibold">
            Pesados ({pesados.length})
          </div>
          <ul className="divide-y divide-border">
            {pesados.map((a) => (
              <li
                key={a.eventoId}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">
                    #{a.consecutivo}
                  </span>
                  <span className="text-muted-foreground">
                    {hora(a.pieladoAt)} · {a.operatorName ?? '—'}
                  </span>
                </div>
                <span className="font-semibold tabular-nums">
                  {a.pesoKg?.toFixed(2)} kg
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Lee la báscula del equipo (con simulación de respaldo si no hay báscula).
function useBascula(initial = '0.0') {
  const [peso, setPeso] = useState(initial);
  const [leyendo, setLeyendo] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    [],
  );

  async function leerBascula() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setLeyendo(true);
    try {
      const result = await readScale({ timeoutMs: 4000 });
      if (result.ok && result.value !== null) {
        setPeso(result.value.toFixed(1));
        setLeyendo(false);
        return;
      }
      throw new Error(result.error ?? 'scale_not_found');
    } catch {
      const samples: number[] = [];
      let current = 0;
      let stable = 0;
      timerRef.current = window.setInterval(() => {
        const next = Math.max(
          0,
          Number((current + (Math.random() - 0.5) * 2.4).toFixed(1)),
        );
        samples.push(next);
        if (samples.length > 6) samples.shift();
        current = next;
        setPeso(next.toFixed(1));
        if (samples.length >= 4) {
          const min = Math.min(...samples);
          const max = Math.max(...samples);
          stable = max - min <= 0.2 ? stable + 1 : 0;
        }
        if (stable >= 2) {
          window.clearInterval(timerRef.current ?? undefined);
          timerRef.current = null;
          setLeyendo(false);
        }
      }, 300);
    }
  }

  return { peso, setPeso, leyendo, leerBascula };
}

function BasculaField({
  label = 'Peso (kg):',
  peso,
  setPeso,
  leyendo,
  onLeer,
  onEnter,
}: {
  label?: string;
  peso: string;
  setPeso: (v: string) => void;
  leyendo: boolean;
  onLeer: () => void;
  onEnter?: () => void;
}) {
  return (
    <div className="flex items-end gap-3">
      <div className="relative flex-1 rounded-sm border-2 border-border bg-card pt-2">
        <span className="absolute -top-3 left-3 bg-background px-2 text-xl font-medium">
          {label}
        </span>
        <Input
          value={peso}
          onChange={(e) => setPeso(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.();
          }}
          inputMode="decimal"
          placeholder="0.0"
          className="h-14 border-0 text-center text-3xl font-bold text-emerald-700 shadow-none"
        />
      </div>
      <Button
        aria-label="Leer báscula"
        title={leyendo ? 'Leyendo báscula…' : 'Leer báscula'}
        variant="outline"
        className="size-12 p-0"
        onClick={onLeer}
        disabled={leyendo}
      >
        {leyendo ? <LoaderCircle className="size-6 animate-spin" /> : <Gauge />}
      </Button>
      <Button
        aria-label="Imprimir"
        title="Imprimir"
        variant="outline"
        className="size-12 p-0"
        onClick={() => window.print()}
      >
        <Printer />
      </Button>
    </div>
  );
}

function WeighPanel({ animal }: { animal: PielAnimal }) {
  const { peso, setPeso, leyendo, leerBascula } = useBascula('0.0');
  const registrar = useRegistrarPiel();

  const valor = Number(peso.replace(',', '.'));
  const valido = peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  function guardar() {
    if (!valido || registrar.isPending) return;
    registrar.mutate({ eventoId: animal.eventoId, pesoKg: valor });
  }

  return (
    <div className="border-b border-border bg-muted/20 px-5 py-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-2xl font-bold tabular-nums">
          #{animal.consecutivo}
        </span>
        <span className="text-sm text-muted-foreground">
          cayó {hora(animal.stunnedAt)}
        </span>
      </div>
      <BasculaField
        peso={peso}
        setPeso={setPeso}
        leyendo={leyendo}
        onLeer={leerBascula}
        onEnter={guardar}
      />
      <div className="mt-4 flex justify-end">
        <Button
          size="lg"
          onClick={guardar}
          disabled={!valido || registrar.isPending}
        >
          {registrar.isPending ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Scale className="size-5" />
          )}
          Pesar animal #{animal.consecutivo}
        </Button>
      </div>
    </div>
  );
}

function LoteView({
  data,
  pendientes,
  pesados,
}: {
  data: PielLoteDetail;
  pendientes: PielAnimal[];
  pesados: PielAnimal[];
}) {
  const { peso, setPeso, leyendo, leerBascula } = useBascula('0.0');
  const registrar = useRegistrarPielLote();

  useEffect(() => {
    setPeso('0.0');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendientes.length]);

  const valor = Number(peso.replace(',', '.'));
  const valido = peso.trim() !== '' && Number.isFinite(valor) && valor > 0;
  const porAnimal =
    valido && pendientes.length
      ? (valor / pendientes.length).toFixed(2)
      : null;

  function guardar() {
    if (!valido || !pendientes.length || registrar.isPending) return;
    registrar.mutate({
      ordenBeneficioId: data.ordenBeneficioId,
      pesoTotalKg: valor,
    });
  }

  return (
    <div className="border-t border-border">
      {!pendientes.length ? (
        <div className="flex items-center justify-center gap-2 px-5 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" /> Todas las pieles
          de este lote ya fueron pesadas.
        </div>
      ) : (
        <div className="border-b border-border bg-muted/20 px-5 py-6">
          <div className="mb-4 text-sm text-muted-foreground">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {pendientes.length}
            </span>{' '}
            animales caídos sin pesar
          </div>
          <BasculaField
            label="Peso total del lote (kg):"
            peso={peso}
            setPeso={setPeso}
            leyendo={leyendo}
            onLeer={leerBascula}
            onEnter={guardar}
          />
          {porAnimal && (
            <div className="mt-3 text-sm text-muted-foreground">
              Se repartirá en partes iguales:{' '}
              <span className="font-semibold text-foreground">
                {porAnimal} kg
              </span>{' '}
              por animal.
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              size="lg"
              onClick={guardar}
              disabled={!valido || registrar.isPending}
            >
              {registrar.isPending ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Scale className="size-5" />
              )}
              Guardar lote
            </Button>
          </div>
        </div>
      )}

      {pesados.length > 0 && (
        <>
          <div className="border-t border-border px-5 py-3 text-sm font-semibold">
            <Clock className="mr-1.5 inline size-4" /> Pesados ({pesados.length})
          </div>
          <ul className="divide-y divide-border">
            {pesados.map((a) => (
              <li
                key={a.eventoId}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">
                    #{a.consecutivo}
                  </span>
                  <span className="text-muted-foreground">
                    {hora(a.pieladoAt)} · {a.operatorName ?? '—'}
                  </span>
                </div>
                <span className="font-semibold tabular-nums">
                  {a.pesoKg?.toFixed(2)} kg
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" /> Cargando…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
      <Inbox className="size-6" />
      {text}
    </div>
  );
}

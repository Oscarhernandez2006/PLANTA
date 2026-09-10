import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PielesIcon } from '@/components/icons/PielesIcon';
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
  return (
    <div className="border-t border-border">
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
          {pendientes.map((a) => (
            <AnimalRow key={a.eventoId} animal={a} />
          ))}
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

function AnimalRow({ animal }: { animal: PielAnimal }) {
  const [peso, setPeso] = useState('');
  const registrar = useRegistrarPiel();
  const valor = Number(peso.replace(',', '.'));
  const valido = peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  function guardar() {
    if (!valido || registrar.isPending) return;
    registrar.mutate({ eventoId: animal.eventoId, pesoKg: valor });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tabular-nums">
          #{animal.consecutivo}
        </span>
        <span className="text-sm text-muted-foreground">
          cayó {hora(animal.stunnedAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar();
          }}
          className="h-9 w-28"
          placeholder="kg"
        />
        <Button onClick={guardar} disabled={!valido || registrar.isPending}>
          {registrar.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Scale className="size-4" />
          )}
          Pesar
        </Button>
      </div>
    </li>
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
  const [total, setTotal] = useState('');
  const registrar = useRegistrarPielLote();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTotal('');
  }, [pendientes.length]);

  const valor = Number(total.replace(',', '.'));
  const valido = total.trim() !== '' && Number.isFinite(valor) && valor > 0;
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
        <div className="flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1 text-sm text-muted-foreground">
            <div>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {pendientes.length}
              </span>{' '}
              animales caídos sin pesar
            </div>
            {porAnimal && (
              <div>
                Se repartirá en partes iguales:{' '}
                <span className="font-semibold text-foreground">
                  {porAnimal} kg
                </span>{' '}
                por animal.
              </div>
            )}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Peso total del lote (kg)
              <Input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') guardar();
                }}
                className="h-11 w-44 text-lg"
                placeholder="0.00"
              />
            </label>
            <Button
              size="lg"
              onClick={guardar}
              disabled={!valido || registrar.isPending}
            >
              {registrar.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Scale className="size-4" />
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

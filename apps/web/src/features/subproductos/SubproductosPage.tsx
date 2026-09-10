import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SubproductosIcon } from '@/components/icons/SubproductosIcon';
import {
  BasculaConexion,
  BasculaField,
  useBascula,
} from '@/components/bascula/Bascula';
import { cn } from '@/lib/utils';
import {
  useSubproductosLotes,
  useSubLoteDetail,
  useRegistrarSubproducto,
  type SubAnimal,
  type SubLoteDetail,
  type TipoViscera,
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

const TIPOS: { key: TipoViscera; label: string }[] = [
  { key: 'blancas', label: 'Vísceras blancas' },
  { key: 'rojas', label: 'Vísceras rojas' },
];

export function SubproductosPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lotes = useSubproductosLotes();
  const detail = useSubLoteDetail(selectedId);

  const lista = lotes.data ?? [];
  const refrescando = lotes.isFetching || detail.isFetching;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SubproductosIcon className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Subproductos
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Elige un lote para tomar el peso de las vísceras de cada animal:
              blancas y rojas se pesan por separado.
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
            <SubproductosIcon className="size-4" /> Lotes con animales
            beneficiados
          </div>
          {lotes.isLoading ? (
            <Loading />
          ) : !lista.length ? (
            <Empty text="Aún no hay animales caídos. En cuanto se insensibilice un animal, su lote aparecerá aquí." />
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((l) => {
                const total = l.caidos * 2;
                const hechos = l.pesadosBlancas + l.pesadosRojas;
                const pct = total ? Math.round((hechos / total) * 100) : 0;
                const completo = total > 0 && hechos === total;
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
                          B {l.pesadosBlancas}/{l.caidos} · R {l.pesadosRojas}/
                          {l.caidos}
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
  data: SubLoteDetail;
  onBack: () => void;
}) {
  const [tipo, setTipo] = useState<TipoViscera>('blancas');

  const pendientes = data.animales.filter((a) => !a[tipo].pesado);
  const pesados = data.animales.filter((a) => a[tipo].pesado);
  const totalPesados =
    tipo === 'blancas' ? data.pesadosBlancas : data.pesadosRojas;

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
          {totalPesados}/{data.caidos} pesados
        </span>
      </div>

      {/* Conexión a la báscula real */}
      <BasculaConexion />

      {/* Selector de tipo de víscera */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-sm font-medium text-muted-foreground">
          Tipo de víscera:
        </span>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          {TIPOS.map((t) => {
            const done =
              t.key === 'blancas' ? data.pesadosBlancas : data.pesadosRojas;
            return (
              <button
                key={t.key}
                onClick={() => setTipo(t.key)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                  tipo === t.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {done}/{data.caidos}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <IndividualView
        key={tipo}
        tipo={tipo}
        pendientes={pendientes}
        pesados={pesados}
      />
    </Card>
  );
}

function IndividualView({
  tipo,
  pendientes,
  pesados,
}: {
  tipo: TipoViscera;
  pendientes: SubAnimal[];
  pesados: SubAnimal[];
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
  const tipoLabel = tipo === 'blancas' ? 'blancas' : 'rojas';

  return (
    <div className="grid border-t border-border md:grid-cols-2">
      {/* Izquierda: animales del lote */}
      <div className="md:border-r md:border-border">
        <div className="px-5 py-3 text-sm font-semibold">
          Por pesar ({pendientes.length})
        </div>
        {!pendientes.length ? (
          <div className="flex items-center justify-center gap-2 px-5 pb-6 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" /> Todas las
            vísceras {tipoLabel} de este lote ya fueron pesadas.
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
                      activo
                        ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300'
                        : 'hover:bg-muted/40',
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
                      {hora(a[tipo].at)} · {a[tipo].operatorName ?? '—'}
                    </span>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {a[tipo].pesoKg?.toFixed(2)} kg
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Derecha: báscula del animal seleccionado */}
      <div className="border-t border-border md:border-t-0">
        <WeighPanel
          key={`${tipo}-${seleccionado?.eventoId ?? 'none'}`}
          tipo={tipo}
          animal={seleccionado}
        />
      </div>
    </div>
  );
}

function WeighPanel({
  tipo,
  animal,
}: {
  tipo: TipoViscera;
  animal: SubAnimal | null;
}) {
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const registrar = useRegistrarSubproducto();
  const tipoLabel = tipo === 'blancas' ? 'blancas' : 'rojas';

  const valor = Number(peso.replace(',', '.'));
  const valido =
    !!animal && peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  function guardar() {
    if (!animal || !valido || registrar.isPending) return;
    registrar.mutate({ eventoId: animal.eventoId, tipo, pesoKg: valor });
  }

  return (
    <div className="bg-muted/20 px-5 py-6 md:sticky md:top-4">
      <div className="mb-4 flex items-center gap-3">
        {animal ? (
          <>
            <span className="text-2xl font-bold tabular-nums">
              #{animal.consecutivo}
            </span>
            <span className="text-sm text-muted-foreground">
              cayó {hora(animal.stunnedAt)}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Selecciona un animal de la lista para registrar su peso.
          </span>
        )}
      </div>
      <BasculaField
        label={`Vísceras ${tipoLabel} (kg):`}
        peso={peso}
        setPeso={setPeso}
        leyendo={leyendo}
        onLeer={leerBascula}
        onEnter={guardar}
      />
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
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
          {animal
            ? `Pesar vísceras ${tipoLabel} #${animal.consecutivo}`
            : 'Pesar vísceras'}
        </Button>
      </div>
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

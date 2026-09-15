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
  type SubItem,
  type SubLoteDetail,
  type SubproductoGrupo,
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

const GRUPOS: { key: SubproductoGrupo; label: string }[] = [
  { key: 'blancas', label: 'Vísceras blancas' },
  { key: 'rojas', label: 'Vísceras rojas' },
];

// Un animal + un ítem puntual de su checklist (para trabajar la lista aplanada).
interface AnimalItem {
  animal: SubAnimal;
  item: SubItem;
}

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
              Elige un lote para marcar el checklist de vísceras de cada
              animal: blancas y rojas se registran por separado.
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
                const total = l.totalBlancas + l.totalRojas;
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
                          B {l.pesadosBlancas}/{l.totalBlancas} · R{' '}
                          {l.pesadosRojas}/{l.totalRojas}
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
  const [grupo, setGrupo] = useState<SubproductoGrupo>('blancas');

  const flat: AnimalItem[] = data.animales.flatMap((animal) =>
    animal.items
      .filter((item) => item.grupo === grupo)
      .map((item) => ({ animal, item })),
  );
  const pendientes = flat.filter((ai) => !ai.item.marcado);
  const pesados = flat.filter((ai) => ai.item.marcado);
  const totalGrupo = grupo === 'blancas' ? data.totalBlancas : data.totalRojas;
  const hechosGrupo =
    grupo === 'blancas' ? data.pesadosBlancas : data.pesadosRojas;

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
          {hechosGrupo}/{totalGrupo} pesados
        </span>
      </div>

      {/* Conexión a la báscula real */}
      <BasculaConexion />

      {/* Selector de grupo de víscera */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-sm font-medium text-muted-foreground">
          Grupo de vísceras:
        </span>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          {GRUPOS.map((g) => {
            const done =
              g.key === 'blancas' ? data.pesadosBlancas : data.pesadosRojas;
            const total =
              g.key === 'blancas' ? data.totalBlancas : data.totalRojas;
            return (
              <button
                key={g.key}
                onClick={() => setGrupo(g.key)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                  grupo === g.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {g.label}
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {done}/{total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ChecklistView
        key={grupo}
        grupo={grupo}
        pendientes={pendientes}
        pesados={pesados}
      />
    </Card>
  );
}

function ChecklistView({
  grupo,
  pendientes,
  pesados,
}: {
  grupo: SubproductoGrupo;
  pendientes: AnimalItem[];
  pesados: AnimalItem[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Selecciona automáticamente el primer ítem pendiente.
  useEffect(() => {
    if (!pendientes.length) {
      setSelectedKey(null);
      return;
    }
    const keys = pendientes.map((ai) => `${ai.animal.eventoId}:${ai.item.tipo}`);
    setSelectedKey((prev) =>
      prev && keys.includes(prev) ? prev : keys[0],
    );
  }, [pendientes]);

  const seleccionado =
    pendientes.find(
      (ai) => `${ai.animal.eventoId}:${ai.item.tipo}` === selectedKey,
    ) ?? null;
  const grupoLabel = grupo === 'blancas' ? 'blancas' : 'rojas';

  return (
    <div className="grid border-t border-border md:grid-cols-2">
      {/* Izquierda: ítems del lote */}
      <div className="md:border-r md:border-border">
        <div className="px-5 py-3 text-sm font-semibold">
          Por registrar ({pendientes.length})
        </div>
        {!pendientes.length ? (
          <div className="flex items-center justify-center gap-2 px-5 pb-6 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" /> Todas las
            vísceras {grupoLabel} de este lote ya fueron registradas.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pendientes.map((ai) => {
              const key = `${ai.animal.eventoId}:${ai.item.tipo}`;
              const activo = key === selectedKey;
              return (
                <li key={key}>
                  <button
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors',
                      activo
                        ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300'
                        : 'hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold tabular-nums">
                        #{ai.animal.consecutivo}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {ai.item.label}
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
              Registrados ({pesados.length})
            </div>
            <ul className="divide-y divide-border">
              {pesados.map((ai) => (
                <li
                  key={`${ai.animal.eventoId}:${ai.item.tipo}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      #{ai.animal.consecutivo}
                    </span>
                    <span className="text-muted-foreground">
                      {ai.item.label} · {hora(ai.item.registradoAt)} ·{' '}
                      {ai.item.operatorName ?? '—'}
                    </span>
                  </div>
                  {ai.item.unidad === 'kg' ? (
                    <span className="font-semibold tabular-nums">
                      {ai.item.pesoKg?.toFixed(2)} kg
                    </span>
                  ) : (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Derecha: registro del ítem seleccionado */}
      <div className="border-t border-border md:border-t-0">
        <RegistroPanel
          key={selectedKey ?? 'none'}
          animalItem={seleccionado}
        />
      </div>
    </div>
  );
}

function RegistroPanel({ animalItem }: { animalItem: AnimalItem | null }) {
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const registrar = useRegistrarSubproducto();

  const esKg = animalItem?.item.unidad === 'kg';
  const valor = Number(peso.replace(',', '.'));
  const validoKg =
    !!animalItem && peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  function guardar() {
    if (!animalItem || registrar.isPending) return;
    if (esKg && !validoKg) return;
    registrar.mutate({
      eventoId: animalItem.animal.eventoId,
      tipo: animalItem.item.tipo,
      pesoKg: esKg ? valor : undefined,
    });
  }

  return (
    <div className="bg-muted/20 px-5 py-6 md:sticky md:top-4">
      <div className="mb-4 flex items-center gap-3">
        {animalItem ? (
          <>
            <span className="text-2xl font-bold tabular-nums">
              #{animalItem.animal.consecutivo}
            </span>
            <span className="text-sm text-muted-foreground">
              {animalItem.item.label} · cayó{' '}
              {hora(animalItem.animal.stunnedAt)}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Selecciona un ítem de la lista para registrarlo.
          </span>
        )}
      </div>
      {esKg ? (
        <BasculaField
          label={`${animalItem?.item.label ?? 'Peso'} (kg):`}
          peso={peso}
          setPeso={setPeso}
          leyendo={leyendo}
          onLeer={leerBascula}
          onEnter={guardar}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Este ítem se registra por unidad, sin peso.
        </p>
      )}
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button
          size="lg"
          onClick={guardar}
          disabled={!animalItem || (esKg && !validoKg) || registrar.isPending}
        >
          {registrar.isPending ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Scale className="size-5" />
          )}
          {animalItem
            ? `Marcar ${animalItem.item.label} #${animalItem.animal.consecutivo}`
            : 'Marcar'}
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


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
import { Input } from '@/components/ui/input';
import { SubproductosIcon } from '@/components/icons/SubproductosIcon';
import {
  BasculaConexion,
  BasculaField,
  useBascula,
} from '@/components/bascula/Bascula';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import {
  useSubproductosLotes,
  useSubLoteDetail,
  useRegistrarSubproducto,
  useRegistrarRetiroSubproducto,
  useAsignarCavaSubproducto,
  type SubAnimal,
  type SubItem,
  type SubLoteDetail,
} from './api';
import { downloadOrdenSalidaPdf } from './orden-salida-print';

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
              Elige un lote para marcar el checklist de subproductos
              (códigos SIESA) de cada animal.
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
                const pct = l.total ? Math.round((l.pesados / l.total) * 100) : 0;
                const completo = l.total > 0 && l.pesados === l.total;
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
                          {l.pesados}/{l.total} registrados
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {l.guias.length ? l.guias.join(', ') : '—'} ·{' '}
                          {l.caidos} caídos de {l.animalCount}
                        </span>
                        {l.subproductoDestino === 'firmante' && (
                          <Badge tone={l.subproductoRetiroAt ? 'success' : 'info'}>
                            {l.subproductoRetiroAt ? 'Salida generada' : 'Salida'}
                          </Badge>
                        )}
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
  const [verResumen, setVerResumen] = useState(false);

  const flat: AnimalItem[] = data.animales.flatMap((animal) =>
    animal.items.map((item) => ({ animal, item })),
  );
  const pendientes = flat.filter((ai) => !ai.item.marcado);
  const pesados = flat.filter((ai) => ai.item.marcado);

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
        <div className="flex items-center gap-3">
          {data.subproductoDestino === 'firmante' ? (
            <SalidaPanel data={data} />
          ) : (
            <EntradaPanel data={data} />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVerResumen((v) => !v)}
          >
            {verResumen ? 'Ver checklist' : 'Ver resumen del lote'}
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {data.pesados}/{data.total} registrados
          </span>
        </div>
      </div>

      {/* Conexión a la báscula real */}
      <BasculaConexion />

      {verResumen ? (
        <ResumenPanel data={data} />
      ) : (
        <ChecklistView pendientes={pendientes} pesados={pesados} />
      )}
    </Card>
  );
}

function ResumenPanel({ data }: { data: SubLoteDetail }) {
  const categoriaLabel: Record<string, string> = {
    retoma: 'Retoma',
    viscera_blanca: 'Víscera blanca',
    viscera_roja: 'Víscera roja',
    cabeza_patas: 'Cabeza y patas',
  };

  // Totalizado por categoría (unidades y kilos), sumando todo lo registrado
  // en el lote: mismo lote + mismo cliente ya viene agregado en data.resumen.
  // Para unidades usa cantidadTotal (aplica el multiplicador: patas = x4).
  const totalesPorCategoria = new Map<
    string,
    { totalUnidades: number; totalKg: number }
  >();
  for (const r of data.resumen) {
    const acc = totalesPorCategoria.get(r.categoria) ?? {
      totalUnidades: 0,
      totalKg: 0,
    };
    if (r.unidad === 'unidad') acc.totalUnidades += r.cantidadTotal ?? r.marcados;
    else acc.totalKg += r.totalKg ?? 0;
    totalesPorCategoria.set(r.categoria, acc);
  }

  return (
    <div className="border-t border-border">
      <div className="px-5 py-3 text-sm font-semibold">
        Resumen por producto (lote {data.reference} · {data.cliente}) — suma
        de todos los animales, para verificar que la información sea real.
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2">Código</th>
              <th className="px-2 py-2">Producto</th>
              <th className="px-2 py-2">Categoría</th>
              <th className="px-2 py-2 text-center">Registrados</th>
              <th className="px-5 py-2 text-right">Total kg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.resumen.map((r) => (
              <tr key={r.tipo}>
                <td className="px-5 py-2 tabular-nums text-muted-foreground">
                  {r.codigo}
                </td>
                <td className="px-2 py-2">{r.label}</td>
                <td className="px-2 py-2 text-muted-foreground">
                  {categoriaLabel[r.categoria] ?? r.categoria}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">
                  {r.marcados}/{r.esperados}
                  {r.cantidadTotal != null && r.cantidadTotal !== r.marcados && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({r.cantidadTotal} und.)
                    </span>
                  )}
                </td>
                <td className="px-5 py-2 text-right tabular-nums">
                  {r.unidad === 'kg' ? (r.totalKg ?? 0).toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totalizado final por categoría: unidades y kilos por separado. */}
      <div className="border-t border-border px-5 py-3 text-sm font-semibold">
        Totalizado por categoría
      </div>
      <div className="overflow-auto pb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2">Categoría</th>
              <th className="px-2 py-2 text-right">Total unidades</th>
              <th className="px-5 py-2 text-right">Total kg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(
              ['viscera_roja', 'viscera_blanca', 'retoma'] as const
            )
              .concat(data.cabezasPatas ? (['cabeza_patas'] as const) : [])
              .map((cat) => {
                const t = totalesPorCategoria.get(cat) ?? {
                  totalUnidades: 0,
                  totalKg: 0,
                };
                return (
                  <tr key={cat}>
                    <td className="px-5 py-2 font-medium">
                      {categoriaLabel[cat]}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {t.totalUnidades}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">
                      {t.totalKg.toFixed(2)}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntradaPanel({ data }: { data: SubLoteDetail }) {
  const [cava, setCava] = useState('');
  const asignar = useAsignarCavaSubproducto();
  const [guardado, setGuardado] = useState(false);
  const completo = data.total > 0 && data.pesados === data.total;

  if (!completo) {
    return (
      <span className="text-xs text-muted-foreground">
        Completa el checklist para asignar la cava de entrada.
      </span>
    );
  }
  if (guardado) {
    return <Badge tone="success">Cava asignada: {cava}</Badge>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={cava}
        onChange={(e) => setCava(e.target.value)}
        placeholder="Cava"
        className="h-8 w-28"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={!cava.trim() || asignar.isPending}
        onClick={() =>
          asignar.mutate(
            { ordenBeneficioId: data.ordenBeneficioId, cava: cava.trim() },
            { onSuccess: () => setGuardado(true) },
          )
        }
      >
        Asignar cava (Entrada)
      </Button>
    </div>
  );
}

function SalidaPanel({ data }: { data: SubLoteDetail }) {
  const { user } = useAuth();
  const [observaciones, setObservaciones] = useState('');
  const registrarRetiro = useRegistrarRetiroSubproducto();
  const completo = data.total > 0 && data.pesados === data.total;

  if (data.subproductoRetiroAt) {
    return (
      <Badge tone="success">
        Orden de salida generada ·{' '}
        {new Date(data.subproductoRetiroAt).toLocaleString('es-CO')}
      </Badge>
    );
  }
  if (!completo) {
    return (
      <span className="text-xs text-muted-foreground">
        Completa el checklist para generar la orden de salida.
      </span>
    );
  }

  function generar() {
    registrarRetiro.mutate(
      { ordenBeneficioId: data.ordenBeneficioId, observaciones },
      {
        onSuccess: () => {
          downloadOrdenSalidaPdf({
            reference: data.reference,
            cliente: data.cliente,
            guias: data.guias,
            fecha: new Date().toLocaleString('es-CO'),
            responsable: user?.fullName ?? '—',
            observaciones: observaciones.trim() || null,
            items: data.resumen.filter((r) => r.marcados > 0),
          });
        },
      },
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
        placeholder="Observaciones (opcional)"
        className="h-8 w-48"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={registrarRetiro.isPending}
        onClick={generar}
        title="Genera la constancia y el PDF de la orden de salida"
      >
        Generar orden de salida
      </Button>
    </div>
  );
}

function ChecklistView({
  pendientes,
  pesados,
}: {
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

  return (
    <div className="grid border-t border-border md:grid-cols-2">
      {/* Izquierda: ítems del lote */}
      <div className="md:border-r md:border-border">
        <div className="px-5 py-3 text-sm font-semibold">
          Por registrar ({pendientes.length})
        </div>
        {!pendientes.length ? (
          <div className="flex items-center justify-center gap-2 px-5 pb-6 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" /> Todos los
            subproductos de este lote ya fueron registrados.
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


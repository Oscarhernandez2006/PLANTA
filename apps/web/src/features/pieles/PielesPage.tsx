import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Gauge,
  Inbox,
  LoaderCircle,
  Plug,
  PlugZap,
  Printer,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PielesIcon } from '@/components/icons/PielesIcon';
import {
  getSavedScaleBaud,
  getSavedScalePort,
  isDesktop,
  listScalePorts,
  readScale,
  setSavedScaleBaud,
  setSavedScalePort,
  type ScalePortInfo,
} from '@/lib/device';
import { cn } from '@/lib/utils';
import {
  usePielesLotes,
  usePielLoteDetail,
  useRegistrarPiel,
  useRegistrarPielLote,
  type PielAnimal,
  type PielLoteDetail,
} from './api';

const BAUD_RATES = [9600, 19200, 2400, 38400, 57600, 115200];

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

      {/* Conexión a la báscula real */}
      <BasculaConexion />

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
      <WeighPanel key={seleccionado?.eventoId ?? 'none'} animal={seleccionado} />

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

// Lee la báscula real (puerto serie). En navegador (sin app de escritorio)
// usa una simulación para poder probar la interfaz.
function useBascula(initial = '0.0') {
  const [peso, setPeso] = useState(initial);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    [],
  );

  function simular() {
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

  async function leerBascula() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setError(null);
    setLeyendo(true);

    const port = getSavedScalePort() ?? undefined;
    const baudRate = getSavedScaleBaud() ?? undefined;

    try {
      const result = await readScale({ timeoutMs: 5000, port, baudRate });
      if (result.ok && result.value !== null) {
        setPeso(result.value.toFixed(1));
        setLeyendo(false);
        return;
      }
      throw new Error(result.error ?? 'scale_not_found');
    } catch (e) {
      // En el equipo de planta reportamos el error real de la báscula;
      // en el navegador de desarrollo caemos a la simulación.
      if (isDesktop()) {
        setLeyendo(false);
        setError(
          (e as Error)?.message === 'scale_not_found'
            ? 'No se detectó la báscula. Revisa la conexión y el puerto seleccionado.'
            : 'No se pudo leer la báscula. Revisa la conexión y el puerto seleccionado.',
        );
        return;
      }
      simular();
    }
  }

  return { peso, setPeso, leyendo, error, leerBascula };
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

// Panel de conexión a la báscula real (puerto serie).
function BasculaConexion() {
  const [abierto, setAbierto] = useState(false);
  const [puertos, setPuertos] = useState<ScalePortInfo[]>([]);
  const [puerto, setPuerto] = useState<string>(getSavedScalePort() ?? '');
  const [baud, setBaud] = useState<string>(
    getSavedScaleBaud() ? String(getSavedScaleBaud()) : '',
  );
  const [buscando, setBuscando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const desktop = isDesktop();

  async function buscarPuertos() {
    setBuscando(true);
    setResultado(null);
    const lista = await listScalePorts();
    setPuertos(lista);
    setBuscando(false);
    if (!lista.length) {
      setResultado(
        desktop
          ? 'No se encontraron puertos serie. Conecta la báscula por USB/serial.'
          : 'Abre la app de escritorio para detectar la báscula real.',
      );
    }
  }

  useEffect(() => {
    if (abierto && desktop && !puertos.length) buscarPuertos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function guardarPuerto(value: string) {
    setPuerto(value);
    setSavedScalePort(value || null);
  }

  function guardarBaud(value: string) {
    setBaud(value);
    setSavedScaleBaud(value ? Number(value) : null);
  }

  async function probar() {
    setProbando(true);
    setResultado(null);
    try {
      const r = await readScale({
        timeoutMs: 5000,
        port: puerto || undefined,
        baudRate: baud ? Number(baud) : undefined,
      });
      if (r.ok && r.value !== null) {
        setResultado(
          `Báscula conectada: ${r.value.toFixed(1)} kg` +
            (r.port ? ` · ${r.port}` : '') +
            (r.baudRate ? ` @ ${r.baudRate} baud` : ''),
        );
        if (r.port && !puerto) guardarPuerto(r.port);
        if (r.baudRate && !baud) guardarBaud(String(r.baudRate));
      } else {
        setResultado(
          desktop
            ? 'No se detectó la báscula. Verifica el cable y el puerto.'
            : 'La báscula real solo funciona en la app de escritorio.',
        );
      }
    } finally {
      setProbando(false);
    }
  }

  const conectado = !!puerto;

  return (
    <div className="border-b border-border bg-card px-5 py-3">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {conectado ? (
            <PlugZap className="size-4 text-emerald-600" />
          ) : (
            <Plug className="size-4 text-muted-foreground" />
          )}
          Báscula:{' '}
          <span
            className={cn(
              'font-semibold',
              conectado ? 'text-emerald-700' : 'text-muted-foreground',
            )}
          >
            {conectado ? puerto : 'sin configurar (autodetectar)'}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {abierto ? 'Ocultar' : 'Configurar'}
        </span>
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {!desktop && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              La conexión a la báscula real solo está disponible en la app de
              escritorio del equipo de planta.
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Puerto (COM)
              <select
                value={puerto}
                onChange={(e) => guardarPuerto(e.target.value)}
                className="h-9 min-w-44 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Autodetectar</option>
                {puertos.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                    {p.friendlyName ? ` — ${p.friendlyName}` : ''}
                  </option>
                ))}
                {puerto && !puertos.some((p) => p.path === puerto) && (
                  <option value={puerto}>{puerto}</option>
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Baudios
              <select
                value={baud}
                onChange={(e) => guardarBaud(e.target.value)}
                className="h-9 min-w-32 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Auto</option>
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <Button
              variant="outline"
              size="sm"
              onClick={buscarPuertos}
              disabled={buscando}
            >
              <RefreshCw
                className={cn('size-4', buscando && 'animate-spin')}
              />
              Buscar puertos
            </Button>
            <Button size="sm" onClick={probar} disabled={probando}>
              {probando ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Gauge className="size-4" />
              )}
              Probar báscula
            </Button>
          </div>

          {resultado && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-medium">
              {resultado}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeighPanel({ animal }: { animal: PielAnimal | null }) {
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
  const registrar = useRegistrarPiel();

  const valor = Number(peso.replace(',', '.'));
  const valido =
    !!animal && peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  function guardar() {
    if (!animal || !valido || registrar.isPending) return;
    registrar.mutate({ eventoId: animal.eventoId, pesoKg: valor });
  }

  return (
    <div className="border-b border-border bg-muted/20 px-5 py-6">
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
          {animal ? `Pesar animal #${animal.consecutivo}` : 'Pesar animal'}
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
  const { peso, setPeso, leyendo, error, leerBascula } = useBascula('0.0');
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
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          )}
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

import { useEffect, useState } from 'react';
import { Gauge, LoaderCircle, Plug, PlugZap, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export const BAUD_RATES = [9600, 19200, 2400, 38400, 57600, 115200];

// Lee la báscula real (puerto serie). En navegador (sin app de escritorio)
// Lee la báscula real (puerto serie / COM) a través de la app de escritorio.
export function useBascula(initial = '0.00') {
  const [peso, setPeso] = useState(initial);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leerBascula() {
    setError(null);
    setLeyendo(true);

    const port = getSavedScalePort() ?? undefined;
    const baudRate = getSavedScaleBaud() ?? undefined;

    try {
      const result = await readScale({ timeoutMs: 5000, port, baudRate });
      if (result.ok && result.value !== null) {
        setPeso(result.value.toFixed(2));
        return;
      }
      throw new Error(result.error ?? 'scale_not_found');
    } catch (e) {
      setError(
        (e as Error)?.message === 'scale_not_found'
          ? 'No se detectó la báscula. Revisa la conexión y el puerto COM.'
          : 'No se pudo leer la báscula. Revisa la conexión y el puerto COM.',
      );
    } finally {
      setLeyendo(false);
    }
  }

  return { peso, setPeso, leyendo, error, leerBascula };
}

export function BasculaField({
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
          placeholder="0.00"
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
export function BasculaConexion() {
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
              <RefreshCw className={cn('size-4', buscando && 'animate-spin')} />
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

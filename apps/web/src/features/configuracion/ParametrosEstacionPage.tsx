import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Gauge,
  Radar,
  LoaderCircle,
  MonitorSmartphone,
  Printer,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { BAUD_RATES } from '@/components/bascula/Bascula';
import { useDevice } from '@/features/device/device-context';
import {
  detectScale,
  getSavedPrinterName,
  getSavedScaleBaud,
  getSavedScalePort,
  isDesktop,
  listPrinters,
  listScalePorts,
  printRaw,
  readScale,
  setSavedPrinterName,
  setSavedScaleBaud,
  setSavedScalePort,
  type PrinterInfo,
  type ScaleDetectPort,
  type ScalePortInfo,
} from '@/lib/device';
import { cn } from '@/lib/utils';

type Resultado = { ok: boolean; texto: string } | null;

const esWindows = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
const numeroCom = (p: string) => Number(/^COM(\d+)$/i.exec(p)?.[1] ?? 9999);

/**
 * Opciones del selector de puerto: en Windows siempre COM1–COM20 más los que
 * tenga el equipo; los que el sistema reporta se marcan como conectados.
 */
function opcionesPuerto(detectados: ScalePortInfo[]) {
  const porRuta = new Map(detectados.map((p) => [p.path.toUpperCase(), p]));
  const rutas = new Set<string>(detectados.map((p) => p.path));
  if (esWindows) for (let i = 1; i <= 20; i++) if (!porRuta.has(`COM${i}`)) rutas.add(`COM${i}`);
  return [...rutas]
    .sort((a, b) => numeroCom(a) - numeroCom(b) || a.localeCompare(b))
    .map((ruta) => {
      const info = porRuta.get(ruta.toUpperCase());
      const nombre = info?.friendlyName ?? info?.manufacturer;
      return {
        ruta,
        conectado: !!info,
        etiqueta: info ? `${ruta}${nombre ? ` — ${nombre}` : ''} (conectado)` : ruta,
      };
    });
}

function estadoPuerto(p: ScaleDetectPort) {
  if (p.valor != null) return { texto: `Báscula detectada (${p.baudRate} baudios)`, tono: 'ok' as const };
  if (p.datos) return { texto: `Envía datos sin peso (${p.baudRate} baudios)`, tono: 'aviso' as const };
  if (p.abre) return { texto: 'Disponible, sin datos', tono: 'neutro' as const };
  return { texto: 'No disponible u ocupado', tono: 'error' as const };
}

/** Etiqueta ZPL mínima para comprobar que la impresora recibe y entiende el ZPL. */
function zplPrueba(estacion: string) {
  const fecha = new Date().toLocaleString('es-CO');
  return [
    '^XA',
    '^CI28',
    '^FO40,40^A0N,40,40^FDPRUEBA DE IMPRESION^FS',
    `^FO40,100^A0N,28,28^FDEstacion: ${estacion}^FS`,
    `^FO40,145^A0N,28,28^FD${fecha}^FS`,
    '^XZ',
  ].join('\n');
}

/**
 * Parámetros de la estación: impresora de presintos/etiquetas y báscula
 * (puerto COM y baudios). Se guardan en el propio equipo y los usan todos
 * los módulos que imprimen o leen la báscula.
 */
export function ParametrosEstacionPage() {
  const desktop = isDesktop();
  const { deviceName, hostname, mac } = useDevice();
  const estacion = deviceName ?? hostname ?? 'Estación';

  // ---- Impresora ----
  const [impresoras, setImpresoras] = useState<PrinterInfo[]>([]);
  const [impresora, setImpresora] = useState(getSavedPrinterName() ?? '');
  const [buscandoImp, setBuscandoImp] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [resImp, setResImp] = useState<Resultado>(null);

  // ---- Báscula ----
  const [puertos, setPuertos] = useState<ScalePortInfo[]>([]);
  const [puerto, setPuerto] = useState(getSavedScalePort() ?? '');
  const [baud, setBaud] = useState(getSavedScaleBaud() ? String(getSavedScaleBaud()) : '');
  const [buscandoPuertos, setBuscandoPuertos] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [detectando, setDetectando] = useState(false);
  const [deteccion, setDeteccion] = useState<ScaleDetectPort[] | null>(null);
  const [resBas, setResBas] = useState<Resultado>(null);

  async function buscarImpresoras() {
    setBuscandoImp(true);
    setResImp(null);
    const lista = await listPrinters();
    setImpresoras(lista);
    setBuscandoImp(false);
    if (!lista.length && desktop) setResImp({ ok: false, texto: 'No se encontraron impresoras instaladas en este equipo.' });
  }

  async function buscarPuertos() {
    setBuscandoPuertos(true);
    setResBas(null);
    const lista = await listScalePorts();
    setPuertos(lista);
    setBuscandoPuertos(false);
    if (!lista.length && desktop) setResBas({ ok: false, texto: 'No se encontraron puertos COM. Conecta la báscula por USB/serial.' });
  }

  useEffect(() => {
    if (!desktop) return;
    void buscarImpresoras();
    void buscarPuertos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirImpresora(nombre: string) {
    setImpresora(nombre);
    setSavedPrinterName(nombre || null);
    setResImp(null);
  }

  function elegirPuerto(valor: string) {
    setPuerto(valor);
    setSavedScalePort(valor || null);
    setResBas(null);
  }

  function elegirBaud(valor: string) {
    setBaud(valor);
    setSavedScaleBaud(valor ? Number(valor) : null);
    setResBas(null);
  }

  async function imprimirPrueba() {
    if (!impresora) return;
    setImprimiendo(true);
    setResImp(null);
    const r = await printRaw(impresora, zplPrueba(estacion));
    setImprimiendo(false);
    setResImp(
      r.ok
        ? { ok: true, texto: `Etiqueta de prueba enviada a ${impresora}.` }
        : {
            ok: false,
            texto:
              r.error === 'solo_windows'
                ? 'La impresión directa solo funciona en equipos con Windows.'
                : `No se pudo imprimir: ${r.error ?? 'error desconocido'}`,
          },
    );
  }

  async function detectarBascula() {
    setDetectando(true);
    setResBas(null);
    setDeteccion(null);
    const r = await detectScale();
    setDetectando(false);
    if (!r) {
      setResBas({
        ok: false,
        texto: 'Esta versión de la app de escritorio no permite detectar la báscula. Actualiza la app de la estación.',
      });
      return;
    }
    setPuertos(r.puertos);
    setDeteccion(r.puertos);
    if (r.bascula) {
      elegirPuerto(r.bascula.port);
      elegirBaud(String(r.bascula.baudRate));
      setResBas({
        ok: true,
        texto: `Báscula detectada en ${r.bascula.port} a ${r.bascula.baudRate} baudios: ${r.bascula.value.toFixed(2)} kg. Quedó seleccionada.`,
      });
    } else {
      setResBas({
        ok: false,
        texto: r.puertos.length
          ? 'No se detectó ninguna báscula enviando peso. Revisa que esté encendida y con el cable conectado.'
          : 'El equipo no reporta ningún puerto COM. Conecta el cable de la báscula y vuelve a detectar.',
      });
    }
  }

  async function probarBascula() {
    setLeyendo(true);
    setResBas(null);
    const r = await readScale({
      timeoutMs: 5000,
      port: puerto || undefined,
      baudRate: baud ? Number(baud) : undefined,
    });
    setLeyendo(false);
    if (r.ok && r.value !== null) {
      setResBas({
        ok: true,
        texto: `Lectura correcta: ${r.value.toFixed(2)} kg${r.port ? ` · ${r.port}` : ''}${r.baudRate ? ` a ${r.baudRate} baudios` : ''}.`,
      });
      // Si estaba en automático, deja fijo lo que se detectó.
      if (r.port && !puerto) elegirPuerto(r.port);
      if (r.baudRate && !baud) elegirBaud(String(r.baudRate));
    } else {
      setResBas({
        ok: false,
        texto: r.trama
          ? `No se pudo tomar el peso. Última trama recibida: "${r.trama}"`
          : 'No se recibió una trama estable de la báscula. Revisa el cable, el puerto COM y los baudios.',
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SlidersHorizontal className="size-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Parámetros estación</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Impresora y báscula que usa este equipo. Se guardan en el equipo y aplican a todos los módulos.
          </p>
        </div>
      </div>

      {!desktop && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Estos parámetros solo se pueden configurar desde la app de escritorio instalada en la estación: el navegador
          no tiene acceso a las impresoras ni a los puertos COM del equipo.
        </div>
      )}

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <MonitorSmartphone className="size-5 text-muted-foreground" />
          {estacion}
        </span>
        <span className="text-muted-foreground">
          Equipo: <span className="font-medium text-foreground">{hostname ?? '—'}</span>
        </span>
        <span className="text-muted-foreground">
          MAC: <span className="font-mono font-medium text-foreground">{mac ?? '—'}</span>
        </span>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Impresora */}
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Printer className="size-5" />
            <h2 className="text-lg font-semibold">Impresora</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Impresora de presintos y etiquetas (Zebra u otra que acepte ZPL). Se imprime directo, sin diálogos. Sin
            impresora configurada, el presinto se descarga como archivo .zpl.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="impresora">Impresora de Windows</Label>
            <div className="flex gap-2">
              <Select
                id="impresora"
                value={impresora}
                onChange={(e) => elegirImpresora(e.target.value)}
                disabled={!desktop}
                className="h-10 flex-1"
              >
                <option value="">Sin configurar (descargar .zpl)</option>
                {impresoras.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.isDefault ? ' (predeterminada)' : ''}
                  </option>
                ))}
                {impresora && !impresoras.some((p) => p.name === impresora) && (
                  <option value={impresora}>{impresora}</option>
                )}
              </Select>
              <Button variant="outline" className="h-10" onClick={buscarImpresoras} disabled={!desktop || buscandoImp}>
                <RefreshCw className={cn('size-4', buscandoImp && 'animate-spin')} />
                Buscar
              </Button>
            </div>
          </div>
          <Button onClick={imprimirPrueba} disabled={!desktop || !impresora || imprimiendo}>
            {imprimiendo ? <LoaderCircle className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Imprimir etiqueta de prueba
          </Button>
          <Estado resultado={resImp} />
        </Card>

        {/* Báscula */}
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Scale className="size-5" />
            <h2 className="text-lg font-semibold">Báscula</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Puerto COM y velocidad por donde llega la trama de la báscula. Con el cable conectado, usa
            «Detectar báscula» para encontrar el puerto automáticamente.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="puerto">Puerto COM</Label>
              <div className="flex gap-2">
                <Select
                  id="puerto"
                  value={puerto}
                  onChange={(e) => elegirPuerto(e.target.value)}
                  disabled={!desktop}
                  className="h-10 flex-1"
                >
                  <option value="">Automático</option>
                  {opcionesPuerto(puertos).map((o) => (
                    <option key={o.ruta} value={o.ruta}>
                      {o.etiqueta}
                    </option>
                  ))}
                  {puerto && !opcionesPuerto(puertos).some((o) => o.ruta === puerto) && (
                    <option value={puerto}>{puerto}</option>
                  )}
                </Select>
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={buscarPuertos}
                  disabled={!desktop || buscandoPuertos}
                  title="Buscar puertos"
                >
                  <RefreshCw className={cn('size-4', buscandoPuertos && 'animate-spin')} />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baudios">Baudios</Label>
              <Select
                id="baudios"
                value={baud}
                onChange={(e) => elegirBaud(e.target.value)}
                disabled={!desktop}
                className="h-10"
              >
                <option value="">Automático</option>
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={detectarBascula} disabled={!desktop || detectando || leyendo}>
              {detectando ? <LoaderCircle className="size-4 animate-spin" /> : <Radar className="size-4" />}
              {detectando ? 'Detectando… (hasta 10 s)' : 'Detectar báscula'}
            </Button>
            <Button variant="outline" onClick={probarBascula} disabled={!desktop || leyendo || detectando}>
              {leyendo ? <LoaderCircle className="size-4 animate-spin" /> : <Gauge className="size-4" />}
              Probar lectura
            </Button>
          </div>
          <Estado resultado={resBas} />
          {deteccion && deteccion.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Puerto</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Trama recibida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deteccion.map((p) => {
                    const e = estadoPuerto(p);
                    return (
                      <tr key={p.path} className={cn(p.path === puerto && 'bg-emerald-50/60')}>
                        <td className="px-3 py-2 font-medium">
                          {p.path}
                          {(p.friendlyName ?? p.manufacturer) && (
                            <div className="text-xs font-normal text-muted-foreground">
                              {p.friendlyName ?? p.manufacturer}
                            </div>
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 font-medium',
                            e.tono === 'ok' && 'text-emerald-700',
                            e.tono === 'aviso' && 'text-amber-700',
                            e.tono === 'error' && 'text-muted-foreground',
                          )}
                        >
                          {e.texto}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{p.trama ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Estado({ resultado }: { resultado: Resultado }) {
  if (!resultado) return null;
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm font-medium',
        resultado.ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      {resultado.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
      {resultado.texto}
    </div>
  );
}

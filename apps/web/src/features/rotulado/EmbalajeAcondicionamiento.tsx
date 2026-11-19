import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { Barcode, Check, Gauge, LoaderCircle, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { Button } from '@/components/ui/button';
import { printRaw } from '@/lib/device';
import { cn, plantToday as today, soloDecimal } from '@/lib/utils';
import { useBodegas, type Tienda } from '../clientes/api';
import type { ProductoAsignado } from '../conservacion/api';
import { useDevice } from '../device/device-context';
import {
  formatOC,
  useBorrarEtiquetaAcond,
  useCrearEtiquetaAcond,
  useEtiquetasAcond,
  useResumenAcondicionamiento,
  type EtiquetaAcond,
  type OrdenAcondicionamiento,
} from '../registrar/orden-acondicionamiento-api';
import {
  generarEtiquetaDesposteZpl,
  obtenerLogoEtiquetaZpl,
  type EtiquetaDesposteDatos,
} from './etiqueta-desposte-zpl';
import { FieldBox, SIN_IMPRESORA, useImpresoraEtiquetas } from './ui';

type Conservacion = 'refrigerado' | 'congelado';

const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

const fechaCorta = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

/** Datos de una etiqueta de acondicionamiento (mismo formato que la de desposte). */
export function datosEtiquetaAcond(e: EtiquetaAcond, ocNumber: number): EtiquetaDesposteDatos {
  return {
    tienda: e.tiendaCodigo,
    lote: formatOC(ocNumber),
    productoCodigo: e.productoCodigo,
    productoNombre: e.productoNombre,
    empaque: e.empaque,
    pieza: e.pieza,
    netoKg: e.netoKg,
    sacrificio: e.fechaSacrificio,
    produccion: e.fechaEmpaque,
    vencimiento: e.fechaVencimiento ?? e.fechaEmpaque,
    conservacion: e.conservacion,
    temperatura: e.temperatura,
    ref: e.ref ?? '',
    codigo: e.codigo,
  };
}

export function zplEtiquetaAcond(e: EtiquetaAcond, ocNumber: number, logo: string) {
  return generarEtiquetaDesposteZpl(datosEtiquetaAcond(e, ocNumber), logo);
}

export function EmbalajeAcondicionamiento({
  orden,
  tienda,
  producto,
}: {
  orden: OrdenAcondicionamiento;
  tienda: Tienda;
  producto: ProductoAsignado;
}) {
  const empaque = today();
  const [conservacion, setConservacion] = useState<Conservacion>(
    producto.refrigeradoDias > 0 || producto.congeladoDias === 0 ? 'refrigerado' : 'congelado',
  );
  const [alVacio, setAlVacio] = useState(/VAC[IÍ]O/i.test(producto.nombre));
  const [tara, setTara] = useState('0.00');
  const [tecladoTara, setTecladoTara] = useState(false);
  const [tecladoBruto, setTecladoBruto] = useState(false);
  const [tecladoNeto, setTecladoNeto] = useState(false);
  const [netoManual, setNetoManual] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const keyboard = useKeyboard();
  const { peso: bruto, setPeso: setBruto, leyendo, error, leerBascula } = useBascula('0.00');
  const [alerta, setAlerta] = useState<{ id: number; texto: string } | null>(null);

  useEffect(() => {
    if (error) setAlerta({ id: Date.now(), texto: error });
  }, [error]);

  useEffect(() => {
    if (!alerta) return;
    const t = setTimeout(() => setAlerta(null), 3000);
    return () => clearTimeout(t);
  }, [alerta]);

  useEffect(() => {
    setNetoManual(null);
  }, [bruto, tara]);

  const [bodegaId, setBodegaId] = useState('');
  const bodegas = useBodegas(orden.cliente.id);
  const bodegasActivas = useMemo(
    () => (bodegas.data ?? []).filter((b) => b.active),
    [bodegas.data],
  );
  const bodegaSel = bodegasActivas.some((b) => b.id === bodegaId)
    ? bodegaId
    : (bodegasActivas[0]?.id ?? '');
  const [procesadoPara, setProcesadoPara] = useState('');
  const [imprimir, setImprimir] = useState(true);
  const resumen = useResumenAcondicionamiento(orden.id);
  const sacrificio = resumen.data?.sacrificio ?? null;
  const etiquetasQuery = useEtiquetasAcond(orden.id, producto.id);
  const etiquetas = etiquetasQuery.data ?? [];
  const equipo = useDevice();
  const crearEtiqueta = useCrearEtiquetaAcond(orden.id);
  const borrarEtiqueta = useBorrarEtiquetaAcond(orden.id);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const impresora = useImpresoraEtiquetas();
  const [imprimiendo, setImprimiendo] = useState(false);

  const dias = conservacion === 'refrigerado' ? producto.refrigeradoDias : producto.congeladoDias;
  const temp = conservacion === 'refrigerado' ? producto.refrigeradoTemp : producto.congeladoTemp;
  const vencimiento = sumarDias(empaque, dias);

  const taraKg = Number(tara.replace(',', '.')) || 0;
  const brutoKg = Number(bruto.replace(',', '.')) || 0;
  const netoCalculado = Math.max(brutoKg - taraKg, 0);
  const netoTexto = netoManual ?? netoCalculado.toFixed(2);
  const netoKg = netoManual !== null ? Number(netoManual) || 0 : netoCalculado;
  const ultima = etiquetas[0] ?? null;
  const totalNeto = etiquetas.reduce((s, e) => s + e.netoKg, 0);
  const prefijo = orden.cliente.nit ?? '';

  async function imprimirEtiqueta(e: EtiquetaAcond) {
    const logo = await obtenerLogoEtiquetaZpl();
    return printRaw(impresora, zplEtiquetaAcond(e, orden.ocNumber, logo));
  }

  async function reimprimir(e: EtiquetaAcond) {
    if (imprimiendo) return;
    if (!impresora) {
      setAlerta({ id: Date.now(), texto: SIN_IMPRESORA });
      return;
    }
    setImprimiendo(true);
    try {
      const r = await imprimirEtiqueta(e);
      setAlerta({
        id: Date.now(),
        texto: r.ok ? `Pieza #${e.pieza} reimpresa.` : r.error || 'No se pudo reimprimir la etiqueta.',
      });
    } catch {
      setAlerta({ id: Date.now(), texto: 'No se pudo enviar la etiqueta a la impresora.' });
    } finally {
      setImprimiendo(false);
    }
  }

  async function etiquetar() {
    if (imprimiendo) return;
    const filaSel = etiquetas.find((e) => e.id === seleccionada);
    if (filaSel) {
      await reimprimir(filaSel);
      return;
    }
    if (netoKg <= 0) return;
    if (resumen.data && !resumen.data.activa) {
      setAlerta({ id: Date.now(), texto: 'La orden de acondicionamiento ya está cerrada.' });
      return;
    }
    if (imprimir && !impresora) {
      setAlerta({ id: Date.now(), texto: SIN_IMPRESORA });
      return;
    }
    if (!sacrificio) {
      setAlerta({ id: Date.now(), texto: 'La orden de traslado no tiene productos trasladados.' });
      return;
    }
    setImprimiendo(true);
    try {
      const e = await crearEtiqueta.mutateAsync({
        productId: producto.id,
        tiendaId: tienda.id,
        bodegaId: bodegaSel || undefined,
        taraKg: Number(taraKg.toFixed(2)),
        brutoKg: Number(brutoKg.toFixed(2)),
        netoKg: Number(netoKg.toFixed(2)),
        empaque: alVacio ? 'AL VACIO' : 'A GRANEL',
        conservacion,
        temperatura: temp,
        fechaEmpaque: empaque,
        fechaVencimiento: dias > 0 ? vencimiento : undefined,
        ref: ref || undefined,
        procesadoPara: procesadoPara || undefined,
        impresa: imprimir,
        estacion: equipo.hostname ?? undefined,
      });
      setBruto('0.00');
      if (imprimir) {
        const r = await imprimirEtiqueta(e).catch(() => ({ ok: false, error: '' }));
        if (!r.ok) {
          setAlerta({
            id: Date.now(),
            texto: `La pieza #${e.pieza} quedó registrada pero no se imprimió${r.error ? `: ${r.error}` : ''}. Selecciónala en la tabla y presiona etiquetar para reimprimir.`,
          });
        }
      }
    } catch (err) {
      setAlerta({ id: Date.now(), texto: mensajeApi(err, 'No se pudo registrar la etiqueta.') });
    } finally {
      setImprimiendo(false);
    }
  }

  const filaSel = etiquetas.find((e) => e.id === seleccionada) ?? null;

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
      {alerta && (
        <div key={alerta.id} className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-4">
          <div
            role="alert"
            className="flex w-[30rem] max-w-full items-start gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg animate-in fade-in-0 slide-in-from-top-2"
          >
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <p className="text-sm font-medium text-foreground">{alerta.texto}</p>
          </div>
        </div>
      )}

      {/* Centro: producto, configuración y etiquetas */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xl font-bold uppercase">{producto.nombre}</div>
              <div className="text-sm text-muted-foreground">
                Código <span className="tabular-nums">{producto.codigo}</span> · Lote{' '}
                <span className="tabular-nums">{formatOC(orden.ocNumber)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tienda</div>
              <div className="truncate text-lg font-bold uppercase text-primary">
                <span className="tabular-nums">{prefijo ? `${prefijo}-${tienda.codigo}` : tienda.codigo}</span> · {tienda.nombre}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-4">
            <Dato label="Sacrificio">
              {resumen.isLoading ? (
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
              ) : sacrificio ? (
                fechaCorta(sacrificio)
              ) : (
                '—'
              )}
            </Dato>
            <Dato label="Empaque">{fechaCorta(empaque)}</Dato>
            <Dato label="Vencimiento">{dias > 0 ? fechaCorta(vencimiento) : '—'}</Dato>
            <Dato label="Días">{dias}</Dato>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conservación · {temp}</span>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {(['refrigerado', 'congelado'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setConservacion(c)}
                    aria-pressed={conservacion === c}
                    className={cn(
                      'h-9 rounded-md px-3 text-sm font-semibold uppercase transition-colors',
                      conservacion === c
                        ? c === 'refrigerado'
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'bg-blue-700 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empaque</span>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {[
                  { v: true, t: 'Al vacío' },
                  { v: false, t: 'A granel' },
                ].map((o) => (
                  <button
                    key={o.t}
                    onClick={() => setAlVacio(o.v)}
                    aria-pressed={alVacio === o.v}
                    className={cn(
                      'h-9 rounded-md px-3 text-sm font-semibold uppercase transition-colors',
                      alVacio === o.v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
            </div>
            <FieldBox label="Ref." className="w-32">
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value.replace(/\D/g, ''))}
                onDoubleClick={keyboard.open}
                inputMode="numeric"
                maxLength={30}
                className="h-9 w-full bg-transparent text-lg font-bold tabular-nums outline-none"
              />
            </FieldBox>
            <FieldBox label="Procesado para" className="min-w-48 flex-1">
              <select
                value={procesadoPara}
                onChange={(e) => setProcesadoPara(e.target.value)}
                className="h-9 w-full bg-transparent text-base outline-none"
              >
                <option value="" />
                <option value={orden.cliente.concepto}>{orden.cliente.concepto}</option>
              </select>
            </FieldBox>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bodega</span>
            {bodegas.isLoading ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            ) : !bodegasActivas.length ? (
              <p className="text-sm text-muted-foreground">El cliente no tiene bodegas activas (Administrativo → Clientes → Bodegas).</p>
            ) : (
              <div className="flex max-h-20 flex-wrap gap-2 overflow-auto">
                {bodegasActivas.map((b) => {
                  const sel = bodegaSel === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBodegaId(b.id)}
                      aria-pressed={sel}
                      className={cn(
                        'flex h-9 select-none items-center gap-2 rounded-lg border px-3 text-sm font-semibold uppercase transition-colors',
                        sel ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted',
                      )}
                    >
                      {sel && <Check className="size-4" />}
                      <span className="tabular-nums">{b.code}</span> - {b.nombre}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Etiquetas hechas */}
        <div className="flex min-h-40 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-4 pb-2 pt-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Etiquetas <span className="tabular-nums text-foreground">({etiquetas.length})</span> ·{' '}
              <span className="tabular-nums text-foreground">{kg(totalNeto)}</span> kg
            </h3>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Imprimir etiqueta de producto
            </label>
            {filaSel && (
              <Button
                variant="outline"
                className="ml-auto h-9 border-red-200 text-red-700 hover:bg-red-50"
                disabled={borrarEtiqueta.isPending}
                onClick={() =>
                  borrarEtiqueta.mutate(filaSel.id, {
                    onSuccess: () => setSeleccionada(null),
                    onError: (err) => setAlerta({ id: Date.now(), texto: mensajeApi(err, 'No se pudo borrar la etiqueta.') }),
                  })
                }
              >
                <Trash2 className="size-4" />
                Borrar #{filaSel.pieza}
              </Button>
            )}
          </div>
          <div className="scrollbar-app min-h-0 flex-1 overflow-auto text-sm">
            <table className="w-full tabular-nums">
              <thead className="sticky top-0 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="[&>th]:h-9 [&>th]:px-3">
                  <th>Pieza</th>
                  <th>Código de barras</th>
                  <th>Hora</th>
                  <th>Tienda</th>
                  <th className="text-right">Bruto</th>
                  <th className="text-right">Tara</th>
                  <th className="text-right">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {etiquetas.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSeleccionada((s) => (s === e.id ? null : e.id))}
                    title="Tocá para reimprimirla o borrarla"
                    className={cn(
                      'h-10 cursor-pointer transition-colors [&>td]:px-3',
                      seleccionada === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40',
                    )}
                  >
                    <td className="font-semibold">#{e.pieza}</td>
                    <td className="font-mono font-semibold">{e.codigo}</td>
                    <td>{horaDe(e.createdAt)}</td>
                    <td>{e.tiendaCodigo}</td>
                    <td className="text-right">{kg(e.brutoKg)}</td>
                    <td className="text-right">{kg(e.taraKg)}</td>
                    <td className="text-right font-bold">{kg(e.netoKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!etiquetas.length && <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay etiquetas de este producto.</p>}
          </div>
        </div>
      </div>

      {/* Panel de pesaje */}
      <div className="flex min-h-0 flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <FieldBox label="Tara (kg)">
            <input
              value={tara}
              onChange={(e) => setTara(soloDecimal(e.target.value))}
              onClick={() => setTecladoTara(true)}
              inputMode="none"
              className="h-10 w-full bg-transparent text-center text-2xl font-bold tabular-nums outline-none"
            />
            {tecladoTara && <NumericKeypad value={tara} onChange={setTara} onClose={() => setTecladoTara(false)} />}
          </FieldBox>
          <FieldBox label="Bruto (kg)">
            <input
              value={bruto}
              onChange={(e) => setBruto(soloDecimal(e.target.value))}
              onClick={() => setTecladoBruto(true)}
              inputMode="none"
              title="Digita el peso o léelo de la báscula"
              className="h-10 w-full bg-transparent text-center text-2xl font-bold tabular-nums outline-none"
            />
            {tecladoBruto && <NumericKeypad value={bruto} onChange={setBruto} onClose={() => setTecladoBruto(false)} />}
          </FieldBox>
        </div>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neto</span>
          <div className="relative mt-1 flex items-baseline justify-end gap-2 rounded-xl border-2 border-primary/40 bg-muted/30 px-4 py-3">
            <input
              value={netoTexto}
              onChange={(e) => setNetoManual(soloDecimal(e.target.value))}
              onClick={() => setTecladoNeto(true)}
              inputMode="none"
              title="Se calcula como bruto − tara; también se puede digitar"
              className="w-full min-w-0 bg-transparent text-right text-5xl font-bold tabular-nums outline-none"
            />
            <span className="text-xl font-semibold text-muted-foreground">kg</span>
            {tecladoNeto && <NumericKeypad value={netoTexto} onChange={setNetoManual} onClose={() => setTecladoNeto(false)} />}
          </div>
        </div>
        {error && <p className="-mt-1 text-xs font-medium text-red-600">{error}</p>}

        <Button variant="outline" className="h-12 text-base" onClick={() => void leerBascula()} disabled={leyendo}>
          {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
          Leer báscula
        </Button>
        <Button
          className="h-14 text-base"
          onClick={() => void etiquetar()}
          disabled={(netoKg <= 0 && !seleccionada) || imprimiendo}
          title={seleccionada ? 'Reimprimir la etiqueta seleccionada' : 'Etiquetar producto'}
        >
          {imprimiendo ? <LoaderCircle className="size-5 animate-spin" /> : <Barcode className="size-5" />}
          {seleccionada ? 'Reimprimir etiqueta' : 'Etiquetar pieza'}
        </Button>

        <div className="mt-auto space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unds</div>
              <div className="text-xl font-bold tabular-nums">{etiquetas.length}</div>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total neto</div>
              <div className="text-xl font-bold tabular-nums">{kg(totalNeto)} kg</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => ultima && void reimprimir(ultima)}
            disabled={!ultima || imprimiendo}
            title={ultima ? 'Tocá para reimprimir la última etiqueta' : undefined}
            className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Última etiqueta</span>
              <span className="block truncate text-sm tabular-nums">
                {ultima ? `#${ultima.pieza} · T${ultima.tiendaCodigo} · ${kg(ultima.netoKg)} kg · ${horaDe(ultima.createdAt)}` : '—'}
              </span>
            </span>
            {ultima && <Printer className="size-4 shrink-0 text-muted-foreground" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums">{children}</div>
    </div>
  );
}

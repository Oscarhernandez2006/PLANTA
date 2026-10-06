import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { Barcode, Check, Gauge, LoaderCircle, Trash2, TriangleAlert } from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
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
        estacion: equipo.hostname ?? equipo.deviceName ?? undefined,
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

  const botonIcono =
    'flex size-12 items-center justify-center rounded-md border-2 border-foreground/70 bg-card hover:bg-muted disabled:opacity-40';

  return (
    <div className="flex h-full flex-col gap-3 p-2 pt-4">
      {alerta && (
        <div
          key={alerta.id}
          className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
        >
          <div
            role="alert"
            className="flex max-w-md items-start gap-3 rounded-md border-2 border-amber-400 bg-card px-5 py-4 shadow-2xl"
          >
            <TriangleAlert className="mt-0.5 size-7 shrink-0 text-amber-500" />
            <p className="text-base font-semibold text-foreground">{alerta.texto}</p>
          </div>
        </div>
      )}

      {/* Tienda */}
      <div className="grid grid-cols-[200px_1fr] gap-2">
        <FieldBox label="Cód. Tienda:">
          <div className="flex h-8 items-center justify-center truncate text-lg tabular-nums">
            {prefijo ? `${prefijo}-${tienda.codigo}` : tienda.codigo}
          </div>
        </FieldBox>
        <FieldBox label="Tienda:">
          <div className="flex h-8 items-center truncate text-xl font-medium uppercase text-red-600">
            {tienda.nombre}
          </div>
        </FieldBox>
      </div>

      {/* Lote, código y producto */}
      <div className="grid grid-cols-[160px_160px_1fr] gap-2">
        <FieldBox label="Lote No.:">
          <div className="flex h-8 items-center justify-center text-xl font-bold tabular-nums">
            {formatOC(orden.ocNumber)}
          </div>
        </FieldBox>
        <FieldBox label="Código:">
          <div className="flex h-8 items-center justify-center text-xl tabular-nums">
            {producto.codigo}
          </div>
        </FieldBox>
        <FieldBox label={<span className="truncate">Producto: {producto.nombre}</span>}>
          <div className="flex h-8 items-center truncate text-xl font-medium uppercase text-red-600">
            {producto.nombre}
          </div>
        </FieldBox>
      </div>

      {/* Fechas y conservación */}
      <div className="grid grid-cols-[1fr_1fr_1fr_80px_1.4fr] gap-2">
        <FieldBox label="Sacrificio:">
          <div
            title="La fecha de sacrificio más antigua de lo trasladado en la orden de traslado"
            className="flex h-8 items-center justify-center text-xl tabular-nums"
          >
            {resumen.isLoading ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            ) : sacrificio ? (
              fechaCorta(sacrificio)
            ) : (
              '—'
            )}
          </div>
        </FieldBox>
        <FieldBox label="Empaque:">
          <div className="flex h-8 items-center justify-center text-xl tabular-nums text-red-600">
            {fechaCorta(empaque)}
          </div>
        </FieldBox>
        <FieldBox label="Vencimiento:">
          <div className="flex h-8 items-center justify-center text-xl tabular-nums text-red-600">
            {dias > 0 ? fechaCorta(vencimiento) : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Días:">
          <div className="flex h-8 items-center justify-center text-xl font-bold tabular-nums">
            {dias}
          </div>
        </FieldBox>
        <FieldBox label={`Conservación: ${temp}`}>
          <div className="flex h-8 items-center gap-2">
            {(['refrigerado', 'congelado'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setConservacion(c)}
                aria-pressed={conservacion === c}
                className={cn(
                  'h-7 flex-1 select-none text-sm font-bold uppercase transition-colors',
                  conservacion === c
                    ? cn(
                        'border-[3px] border-foreground',
                        c === 'refrigerado' ? 'bg-sky-300' : 'bg-blue-600 text-white',
                      )
                    : 'border-2 border-foreground/60 bg-card text-foreground/70 hover:bg-muted',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </FieldBox>
      </div>

      {/* Pesaje */}
      <div className="flex items-stretch gap-2">
        <FieldBox label="Ref:" className="min-w-0 flex-1">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value.replace(/\D/g, ''))}
            onDoubleClick={keyboard.open}
            inputMode="numeric"
            maxLength={30}
            className="h-9 w-full bg-transparent text-2xl font-bold tabular-nums outline-none"
          />
        </FieldBox>
        <FieldBox label="Empaque:" className="w-32 shrink-0">
          <button
            onClick={() => setAlVacio((v) => !v)}
            title="Cambiar tipo de empaque"
            className={cn(
              'my-1 h-8 w-full border-2 border-foreground/80 text-base font-medium uppercase',
              alVacio ? 'bg-sky-300' : 'bg-red-600 text-white',
            )}
          >
            {alVacio ? 'Al vacío' : 'A granel'}
          </button>
        </FieldBox>
        <FieldBox label="Tara:" className="w-28 shrink-0">
          <input
            value={tara}
            onChange={(e) => setTara(soloDecimal(e.target.value))}
            onClick={() => setTecladoTara(true)}
            inputMode="none"
            className="my-1 h-8 w-full border-2 border-foreground/80 bg-transparent text-center text-xl font-bold tabular-nums outline-none"
          />
          {tecladoTara && (
            <NumericKeypad value={tara} onChange={setTara} onClose={() => setTecladoTara(false)} />
          )}
        </FieldBox>
        <FieldBox label="Bruto(kg)" className="w-28 shrink-0">
          <input
            value={bruto}
            onChange={(e) => setBruto(soloDecimal(e.target.value))}
            onClick={() => setTecladoBruto(true)}
            inputMode="none"
            title="Digita el peso o léelo de la báscula"
            className="h-9 w-full bg-transparent text-center text-2xl font-bold tabular-nums text-red-600 outline-none"
          />
          {tecladoBruto && (
            <NumericKeypad value={bruto} onChange={setBruto} onClose={() => setTecladoBruto(false)} />
          )}
        </FieldBox>
        <FieldBox label="Neto(kg):" className="w-28 shrink-0">
          <input
            value={netoTexto}
            onChange={(e) => setNetoManual(soloDecimal(e.target.value))}
            onClick={() => setTecladoNeto(true)}
            inputMode="none"
            title="Se calcula como bruto − tara; también se puede digitar"
            className="h-9 w-full bg-transparent text-center text-2xl font-bold tabular-nums text-emerald-600 outline-none"
          />
          {tecladoNeto && (
            <NumericKeypad
              value={netoTexto}
              onChange={setNetoManual}
              onClose={() => setTecladoNeto(false)}
            />
          )}
        </FieldBox>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={leerBascula} disabled={leyendo} title="Leer báscula" className={botonIcono}>
            {leyendo ? <LoaderCircle className="size-7 animate-spin" /> : <Gauge className="size-8" />}
          </button>
          <button
            onClick={() => void etiquetar()}
            disabled={(netoKg <= 0 && !seleccionada) || imprimiendo}
            title={seleccionada ? 'Reimprimir la etiqueta seleccionada' : 'Etiquetar producto'}
            className={botonIcono}
          >
            {imprimiendo ? <LoaderCircle className="size-7 animate-spin" /> : <Barcode className="size-8" />}
          </button>
        </div>
      </div>

      {/* Bodega y destino */}
      <div className="grid grid-cols-2 gap-2">
        <FieldBox label="Bodegas:">
          {bodegas.isLoading ? (
            <LoaderCircle className="my-2 size-5 animate-spin text-muted-foreground" />
          ) : !bodegasActivas.length ? (
            <p className="py-2 text-sm text-muted-foreground">
              El cliente no tiene bodegas activas (Administrativo → Clientes → Bodegas).
            </p>
          ) : (
            <ul className="my-1 flex max-h-[5.5rem] flex-col gap-1 overflow-auto">
              {bodegasActivas.map((b) => {
                const sel = bodegaSel === b.id;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setBodegaId(b.id)}
                      aria-pressed={sel}
                      className={cn(
                        'flex h-9 w-full select-none items-center gap-2 rounded-md border-2 px-3 text-left text-sm font-semibold uppercase transition-colors',
                        sel
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-border bg-card hover:bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                          sel ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted-foreground/50',
                        )}
                      >
                        {sel && <Check className="size-3.5" />}
                      </span>
                      <span className="tabular-nums">{b.code}</span> - {b.nombre}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </FieldBox>
        <FieldBox label="Procesado Para:">
          <select
            value={procesadoPara}
            onChange={(e) => setProcesadoPara(e.target.value)}
            className="my-1 h-8 w-full border border-border bg-card px-2 text-base outline-none"
          >
            <option value="" />
            <option value={orden.cliente.concepto}>{orden.cliente.concepto}</option>
          </select>
        </FieldBox>
      </div>

      {/* Etiquetas hechas */}
      <FieldBox
        className="flex min-h-16 flex-1 flex-col"
        label={
          <span className="flex items-center gap-1.5">
            Producto Etiquetado:
            <input
              type="checkbox"
              checked={imprimir}
              onChange={(e) => setImprimir(e.target.checked)}
              className="size-4 accent-sky-600"
            />
            <span className="text-emerald-700">Imprimir Etiqueta de Producto.</span>
          </span>
        }
      >
        <div className="min-h-0 flex-1 overflow-auto pt-2 text-sm">
          <table className="w-full border-collapse tabular-nums">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b-2 border-border text-left text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-2 py-1">Pieza</th>
                <th className="px-2 py-1">Código de barras</th>
                <th className="px-2 py-1">Hora</th>
                <th className="px-2 py-1">Tienda</th>
                <th className="px-2 py-1 text-right">Bruto (kg)</th>
                <th className="px-2 py-1 text-right">Tara (kg)</th>
                <th className="px-2 py-1 text-right">Neto (kg)</th>
              </tr>
            </thead>
            <tbody>
              {etiquetas.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSeleccionada((s) => (s === e.id ? null : e.id))}
                  className={cn(
                    'cursor-pointer border-b border-border',
                    seleccionada === e.id
                      ? 'bg-sky-200 outline outline-2 -outline-offset-2 outline-sky-600'
                      : 'odd:bg-muted/30 hover:bg-muted',
                  )}
                >
                  <td className="px-2 py-1 font-semibold">#{e.pieza}</td>
                  <td className="px-2 py-1 font-semibold">{e.codigo}</td>
                  <td className="px-2 py-1">{horaDe(e.createdAt)}</td>
                  <td className="px-2 py-1">
                    {e.tiendaCodigo} · {e.tiendaNombre}
                  </td>
                  <td className="px-2 py-1 text-right">{kg(e.brutoKg)}</td>
                  <td className="px-2 py-1 text-right">{kg(e.taraKg)}</td>
                  <td className="px-2 py-1 text-right font-bold text-emerald-700">{kg(e.netoKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FieldBox>

      {/* Totales */}
      <div className="grid grid-cols-[56px_120px_200px_1fr] items-stretch gap-2">
        <button
          onClick={() => {
            if (!seleccionada) return;
            borrarEtiqueta.mutate(seleccionada, {
              onSuccess: () => setSeleccionada(null),
              onError: (err) =>
                setAlerta({ id: Date.now(), texto: mensajeApi(err, 'No se pudo borrar la etiqueta.') }),
            });
          }}
          disabled={seleccionada === null || borrarEtiqueta.isPending}
          title={
            seleccionada === null
              ? 'Selecciona una fila de la tabla'
              : `Borrar la pieza #${etiquetas.find((e) => e.id === seleccionada)?.pieza ?? ''}`
          }
          className={cn(botonIcono, 'size-auto self-stretch')}
        >
          <Trash2 className="size-8" />
        </button>
        <FieldBox label="Unds:">
          <div className="flex h-9 items-center justify-center text-2xl font-bold tabular-nums">
            {etiquetas.length}
          </div>
        </FieldBox>
        <FieldBox label="Total Neto(Kg):">
          <div className="flex h-9 items-center justify-center text-2xl font-bold tabular-nums">
            {kg(totalNeto)}
          </div>
        </FieldBox>
        <FieldBox label="Última Etiqueta:">
          <button
            type="button"
            onClick={() => ultima && void reimprimir(ultima)}
            disabled={!ultima || imprimiendo}
            title={ultima ? 'Clic para reimprimir la última etiqueta' : undefined}
            className="flex h-9 w-full items-center text-left text-base tabular-nums hover:text-sky-700 disabled:cursor-default disabled:hover:text-inherit"
          >
            {ultima
              ? `#${ultima.pieza} · T${ultima.tiendaCodigo} · ${kg(ultima.netoKg)} kg · ${horaDe(ultima.createdAt)}`
              : ''}
          </button>
        </FieldBox>
      </div>
    </div>
  );
}

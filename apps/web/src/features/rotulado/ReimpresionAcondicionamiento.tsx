import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { ArrowDown, Eraser, LoaderCircle, Printer, Search } from 'lucide-react';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { printRaw } from '@/lib/device';
import { cn } from '@/lib/utils';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatOT } from '../registrar/orden-traslado-api';
import {
  buscarEtiquetaAcond,
  formatOC,
  type EtiquetaAcondEncontrada,
} from '../registrar/orden-acondicionamiento-api';
import { datosEtiquetaAcond } from './EmbalajeAcondicionamiento';
import { EtiquetaDespostePreview } from './EtiquetaDespostePreview';
import { generarEtiquetaDesposteZpl, obtenerLogoEtiquetaZpl } from './etiqueta-desposte-zpl';
import { FieldBox, SIN_IMPRESORA, useImpresoraEtiquetas } from './ui';

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Trazabilidad hacia atrás: producto nuevo ← OC ← OT ← etiquetas de desposte (OP). */
function Trazabilidad({ e }: { e: EtiquetaAcondEncontrada }) {
  const paso = 'rounded-md border-2 px-3 py-2';
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
      <div className={cn(paso, 'border-emerald-600 bg-emerald-50')}>
        <p className="text-xs font-semibold uppercase text-emerald-800">Producto acondicionado</p>
        <p className="font-bold uppercase">
          {e.productoCodigo} · {e.productoNombre}
        </p>
        <p className="tabular-nums">
          Pieza #{e.pieza} · {kg(e.netoKg)} kg · {formatOC(e.ocNumber)}
        </p>
      </div>
      <ArrowDown className="mx-auto size-4 rotate-180 text-muted-foreground" />
      <div className={cn(paso, 'border-sky-600 bg-sky-50')}>
        <p className="text-xs font-semibold uppercase text-sky-800">Orden de traslado</p>
        <p className="font-bold tabular-nums">{formatOT(e.otNumber)}</p>
      </div>
      <ArrowDown className="mx-auto size-4 rotate-180 text-muted-foreground" />
      <div className={cn(paso, 'flex min-h-0 flex-1 flex-col border-amber-500 bg-amber-50')}>
        <p className="text-xs font-semibold uppercase text-amber-800">
          Productos de origen ({e.origen.length})
        </p>
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse whitespace-nowrap text-xs tabular-nums">
            <thead className="sticky top-0 bg-amber-50">
              <tr className="text-left uppercase text-muted-foreground">
                <th className="px-1 py-1">Código</th>
                <th className="px-1 py-1">Producto</th>
                <th className="px-1 py-1">Unds</th>
                <th className="px-1 py-1 text-right">Kg</th>
                <th className="px-1 py-1">Lote</th>
                <th className="px-1 py-1">Sacrif.</th>
              </tr>
            </thead>
            <tbody>
              {e.origen.map((o) => (
                <tr key={o.codigo} className="border-t border-amber-200">
                  <td className="px-1 py-1 font-semibold">{o.codigo}</td>
                  <td className="px-1 py-1 uppercase">{o.productoNombre}</td>
                  <td className="px-1 py-1">{o.unds}</td>
                  <td className="px-1 py-1 text-right">{kg(o.netoKg)}</td>
                  <td className="px-1 py-1">{o.opNumber ? formatOP(o.opNumber) : '—'}</td>
                  <td className="px-1 py-1">{fecha(o.sacrificio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Reimpresión: se consulta la etiqueta por su código, se ve su trazabilidad y se reimprime. */
export function ReimpresionAcondicionamiento() {
  const [codigo, setCodigo] = useState('');
  const [etiqueta, setEtiqueta] = useState<EtiquetaAcondEncontrada | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const impresora = useImpresoraEtiquetas();
  const keyboard = useKeyboard();
  const inputRef = useRef<HTMLInputElement>(null);

  async function buscar() {
    const valor = codigo.trim();
    if (!valor) return;
    setBuscando(true);
    setMensaje(null);
    try {
      setEtiqueta(await buscarEtiquetaAcond(valor));
    } catch (err) {
      setEtiqueta(null);
      const m = isAxiosError(err) ? err.response?.data?.message : null;
      setMensaje({ ok: false, texto: typeof m === 'string' ? m : 'No se pudo consultar la etiqueta.' });
    } finally {
      setBuscando(false);
    }
  }

  function limpiar() {
    setCodigo('');
    setEtiqueta(null);
    setMensaje(null);
    inputRef.current?.focus();
  }

  async function reimprimir() {
    if (!etiqueta || imprimiendo) return;
    if (!impresora) {
      setMensaje({ ok: false, texto: SIN_IMPRESORA });
      return;
    }
    setImprimiendo(true);
    try {
      const logo = await obtenerLogoEtiquetaZpl();
      const r = await printRaw(
        impresora,
        generarEtiquetaDesposteZpl(datosEtiquetaAcond(etiqueta, etiqueta.ocNumber), logo),
      );
      setMensaje(
        r.ok
          ? { ok: true, texto: 'Etiqueta reimpresa.' }
          : { ok: false, texto: r.error || 'No se pudo reimprimir la etiqueta.' },
      );
    } catch {
      setMensaje({ ok: false, texto: 'No se pudo enviar la etiqueta a la impresora.' });
    } finally {
      setImprimiendo(false);
    }
  }

  const botonIcono =
    'flex size-14 items-center justify-center rounded-md border-2 border-foreground/70 bg-card hover:bg-muted disabled:opacity-40';

  return (
    <div className="flex h-full flex-col gap-4 p-2 pt-4">
      <div className="flex items-stretch gap-2">
        <FieldBox label="Código de barras de etiqueta:" className="flex-1">
          <input
            ref={inputRef}
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^0-9A]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void buscar();
            }}
            onDoubleClick={keyboard.open}
            placeholder="Escanea o digita el código (empieza por A)"
            className="h-14 w-full bg-transparent text-2xl font-bold tabular-nums tracking-wider outline-none"
          />
        </FieldBox>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void buscar()}
            disabled={!codigo.trim() || buscando}
            title="Consultar etiqueta"
            className={botonIcono}
          >
            {buscando ? <LoaderCircle className="size-7 animate-spin" /> : <Search className="size-8" />}
          </button>
          <button onClick={limpiar} title="Limpiar" className={botonIcono}>
            <Eraser className="size-8" />
          </button>
        </div>
      </div>

      {mensaje && (
        <p
          className={cn(
            'rounded-md border-2 px-3 py-2 text-sm font-semibold',
            mensaje.ok
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
              : 'border-amber-400 bg-amber-50 text-amber-900',
          )}
        >
          {mensaje.texto}
        </p>
      )}

      <div className="flex min-h-0 flex-1 items-stretch gap-3">
        <FieldBox label="Vista:" className="flex min-h-0 flex-1 flex-col">
          {!etiqueta ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Consulta una etiqueta para ver cómo quedó impresa y de dónde viene.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-2">
              <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-bold uppercase">
                {etiqueta.cliente} · {etiqueta.tiendaCodigo} {etiqueta.tiendaNombre}
              </span>
              <EtiquetaDespostePreview
                datos={datosEtiquetaAcond(etiqueta, etiqueta.ocNumber)}
                className="min-h-0 w-full max-w-[440px] flex-1 drop-shadow-md"
              />
            </div>
          )}
        </FieldBox>
        {etiqueta && (
          <FieldBox label="Trazabilidad:" className="flex min-h-0 w-[380px] shrink-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col py-2">
              <Trazabilidad e={etiqueta} />
            </div>
          </FieldBox>
        )}
        <div className="flex flex-col justify-end">
          <button
            onClick={() => void reimprimir()}
            disabled={!etiqueta || imprimiendo}
            title="Reimprimir etiqueta"
            className={botonIcono}
          >
            {imprimiendo ? <LoaderCircle className="size-7 animate-spin" /> : <Printer className="size-8" />}
          </button>
        </div>
      </div>
    </div>
  );
}

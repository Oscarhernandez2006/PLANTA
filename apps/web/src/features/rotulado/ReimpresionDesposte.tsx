import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Eraser, LoaderCircle, Printer, Search } from 'lucide-react';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { api } from '@/lib/api';
import { printRaw } from '@/lib/device';
import { cn } from '@/lib/utils';
import { formatOP } from '../registrar/orden-produccion-api';
import { EtiquetaDespostePreview } from './EtiquetaDespostePreview';
import {
  generarEtiquetaDesposteZpl,
  obtenerLogoEtiquetaZpl,
  type EtiquetaDesposteDatos,
} from './etiqueta-desposte-zpl';
import { FieldBox, SIN_IMPRESORA, useImpresoraEtiquetas } from './ui';

interface EtiquetaEncontrada {
  tipo: 'pieza' | 'canastilla';
  codigo: string | null;
  opNumber: number;
  cliente: string;
  clienteNit: string | null;
  productoCodigo: string;
  productoNombre: string;
  canastillaNumero: number | null;
  tiendaCodigo: string;
  tiendaNombre: string;
  piezas: number;
  brutoKg: number;
  taraKg: number;
  netoKg: number;
  empaque: string;
  conservacion: string;
  temperatura: string;
  fechaSacrificio: string;
  fechaEmpaque: string;
  fechaVencimiento: string | null;
  ref: string | null;
}

/** Los mismos datos con que se imprime, para que la vista sea idéntica a la etiqueta. */
function datosEtiqueta(e: EtiquetaEncontrada): EtiquetaDesposteDatos {
  return {
    tienda: e.tiendaCodigo,
    lote: formatOP(e.opNumber),
    productoCodigo: e.productoCodigo,
    productoNombre: e.productoNombre,
    empaque: e.empaque,
    pieza: e.piezas,
    netoKg: e.netoKg,
    sacrificio: e.fechaSacrificio,
    produccion: e.fechaEmpaque,
    vencimiento: e.fechaVencimiento ?? e.fechaEmpaque,
    conservacion: e.conservacion,
    temperatura: e.temperatura,
    ref: e.ref ?? '',
    codigo: e.codigo ?? undefined,
    ...(e.tipo === 'canastilla' && e.canastillaNumero !== null
      ? { canastilla: { numero: e.canastillaNumero, taraKg: e.taraKg, brutoKg: e.brutoKg } }
      : e.empaque === 'AL VACIO'
        ? { taraKg: e.taraKg }
        : {}),
  };
}

/** Reimpresión: se consulta la etiqueta por su código de barras, se revisa y se reimprime. */
export function ReimpresionDesposte() {
  const [codigo, setCodigo] = useState('');
  const [etiqueta, setEtiqueta] = useState<EtiquetaEncontrada | null>(null);
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
      const { data } = await api.get<EtiquetaEncontrada>('/production-orders/rotulado/etiqueta', {
        params: { codigo: valor },
      });
      setEtiqueta(data);
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
      const resultado = await printRaw(impresora, generarEtiquetaDesposteZpl(datosEtiqueta(etiqueta), logo));
      setMensaje(
        resultado.ok
          ? { ok: true, texto: 'Etiqueta reimpresa.' }
          : { ok: false, texto: resultado.error || 'No se pudo reimprimir la etiqueta.' },
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
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^0-9C]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void buscar();
            }}
            onDoubleClick={keyboard.open}
            placeholder="Escanea o digita el código"
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
              Consulta una etiqueta para ver cómo quedó impresa.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-2">
              <span
                className={cn(
                  'rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                  etiqueta.tipo === 'canastilla' ? 'bg-sky-600 text-white' : 'bg-muted text-foreground',
                )}
              >
                {etiqueta.tipo === 'canastilla'
                  ? `Etiqueta de canastilla N.º ${etiqueta.canastillaNumero}`
                  : `Etiqueta de pieza${etiqueta.canastillaNumero ? ` · canastilla N.º ${etiqueta.canastillaNumero}` : ''}`}
                {` · ${etiqueta.cliente}`}
              </span>
              <EtiquetaDespostePreview
                datos={datosEtiqueta(etiqueta)}
                className="min-h-0 w-full max-w-[520px] flex-1 drop-shadow-md"
              />
            </div>
          )}
        </FieldBox>
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

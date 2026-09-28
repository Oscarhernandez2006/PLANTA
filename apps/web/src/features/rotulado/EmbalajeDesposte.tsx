import { useEffect, useMemo, useState } from 'react';
import { Barcode, Gauge, LoaderCircle, Package, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { api } from '@/lib/api';
import { listPrinters, printRaw, type PrinterInfo } from '@/lib/device';
import { cn, plantToday as today, soloDecimal } from '@/lib/utils';
import { useBodegas, type Tienda } from '../clientes/api';
import type { ProductoAsignado } from '../conservacion/api';
import { useItemsDespacho } from '../canal-fria/api';
import { formatOP, type OrdenProduccion } from '../registrar/orden-produccion-api';
import { generarEtiquetaDesposteZpl, obtenerLogoEtiquetaZpl } from './etiqueta-desposte-zpl';
import { FieldBox } from './ui';

type Conservacion = 'refrigerado' | 'congelado';

interface Etiqueta {
  n: number;
  taraKg: number;
  brutoKg: number;
  netoKg: number;
  hora: string;
}

/** YYYY-MM-DD → DD/MM/YYYY */
const fechaCorta = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRINTER_KEY = 'frigo.rotulado.printer.name';

export function EmbalajeDesposte({
  orden,
  tienda,
  producto,
  prefijo,
}: {
  orden: OrdenProduccion;
  tienda: Tienda;
  producto: ProductoAsignado;
  prefijo: string;
}) {
  const empaque = today();
  const [conservacion, setConservacion] = useState<Conservacion>(
    producto.refrigeradoDias > 0 || producto.congeladoDias === 0 ? 'refrigerado' : 'congelado',
  );
  const [alVacio, setAlVacio] = useState(/VAC[IÍ]O/i.test(producto.nombre));
  const [tara, setTara] = useState('0.00');
  const [tecladoTara, setTecladoTara] = useState(false);
  const [tecladoBruto, setTecladoBruto] = useState(false);
  // Número interno que digita el operario.
  const [ref, setRef] = useState('');
  const keyboard = useKeyboard();
  const { peso: bruto, setPeso: setBruto, leyendo, error, leerBascula } = useBascula('0.00');
  const [alerta, setAlerta] = useState<{ id: number; texto: string } | null>(null);

  useEffect(() => {
    if (!error) return;
    setAlerta({ id: Date.now(), texto: error });
    const t = setTimeout(() => setAlerta(null), 3000);
    return () => clearTimeout(t);
  }, [error]);
  const [bodegaId, setBodegaId] = useState('');
  const bodegas = useBodegas(orden.cliente.id);
  const bodegasActivas = useMemo(
    () => (bodegas.data ?? []).filter((b) => b.active),
    [bodegas.data],
  );
  // Normalmente el cliente tiene una sola bodega: se selecciona sola.
  const bodegaSel = bodegaId || (bodegasActivas.length === 1 ? bodegasActivas[0].id : '');
  const [procesadoPara, setProcesadoPara] = useState('');
  const [imprimir, setImprimir] = useState(true);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [impresoras, setImpresoras] = useState<PrinterInfo[]>([]);
  const [impresora, setImpresora] = useState(() => localStorage.getItem(PRINTER_KEY) ?? '');
  const [imprimiendo, setImprimiendo] = useState(false);
  const [piezaPendiente, setPiezaPendiente] = useState<number | null>(null);

  useEffect(() => {
    void listPrinters().then(setImpresoras);
  }, []);

  // Fecha de sacrificio: la más antigua de las canales despachadas en la OD.
  const itemsOd = useItemsDespacho(orden.dispatchOrder.id);
  const sacrificio = useMemo(() => {
    const fechas = (itemsOd.data ?? []).map((i) => i.date).sort();
    return fechas[0] ?? null;
  }, [itemsOd.data]);

  const dias = conservacion === 'refrigerado' ? producto.refrigeradoDias : producto.congeladoDias;
  const temp = conservacion === 'refrigerado' ? producto.refrigeradoTemp : producto.congeladoTemp;
  const vencimiento = sumarDias(empaque, dias);

  const taraKg = Number(tara.replace(',', '.')) || 0;
  const brutoKg = Number(bruto.replace(',', '.')) || 0;
  const netoKg = Math.max(brutoKg - taraKg, 0);
  const totalNeto = etiquetas.reduce((s, e) => s + e.netoKg, 0);
  const ultima = etiquetas[etiquetas.length - 1] ?? null;

  async function etiquetar() {
    if (netoKg <= 0 || imprimiendo) return;
    if (imprimir && !impresora) {
      setAlerta({ id: Date.now(), texto: 'Selecciona la impresora de etiquetas de esta estación.' });
      return;
    }
    if (!sacrificio) {
      setAlerta({ id: Date.now(), texto: 'No se encontró la fecha de sacrificio de la orden.' });
      return;
    }
    setImprimiendo(true);
    try {
      let pieza = piezaPendiente;
      if (pieza === null) {
        const response = await api.post<{ pieza: number }>(
          `/production-orders/${orden.id}/etiquetas/reservar`,
          { productId: producto.id },
        );
        pieza = response.data.pieza;
        setPiezaPendiente(pieza);
      }
      if (pieza > 9999) {
        setAlerta({ id: Date.now(), texto: 'Se agotó el consecutivo de etiquetas para este producto.' });
        return;
      }
      if (imprimir) {
        const logo = await obtenerLogoEtiquetaZpl();
        const resultado = await printRaw(impresora, generarEtiquetaDesposteZpl({
          tienda: tienda.codigo,
          lote: formatOP(orden.opNumber),
          productoCodigo: producto.codigo,
          productoNombre: producto.nombre,
          empaque: alVacio ? 'AL VACIO' : 'A GRANEL',
          pieza,
          netoKg,
          sacrificio,
          produccion: empaque,
          vencimiento,
          conservacion,
          temperatura: temp,
          ref,
        }, logo));
        if (!resultado.ok) {
          setAlerta({ id: Date.now(), texto: resultado.error || 'No se pudo imprimir la etiqueta.' });
          return;
        }
      }
      setPiezaPendiente(null);
      const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      setEtiquetas((prev) => [
        ...prev,
        { n: pieza, taraKg, brutoKg, netoKg, hora },
      ]);
      setBruto('0.00');
    } catch {
      setAlerta({ id: Date.now(), texto: 'No se pudo reservar la pieza o enviar la etiqueta a la impresora.' });
    } finally {
      setImprimiendo(false);
    }
  }

  const botonIcono =
    'flex size-14 items-center justify-center rounded-md border-2 border-foreground/70 bg-card hover:bg-muted disabled:opacity-40';

  return (
    <div className="flex flex-col gap-4 p-3 pt-5">
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="impresora-rotulado" className="font-medium">Impresora de etiquetas (6 × 6 cm):</label>
        <select
          id="impresora-rotulado"
          value={impresora}
          onChange={(e) => {
            setImpresora(e.target.value);
            if (e.target.value) localStorage.setItem(PRINTER_KEY, e.target.value);
            else localStorage.removeItem(PRINTER_KEY);
          }}
          className="h-9 min-w-52 border border-border bg-card px-2"
        >
          <option value="">Seleccionar Zebra USB</option>
          {impresoras.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          {impresora && !impresoras.some((p) => p.name === impresora) && (
            <option value={impresora}>{impresora}</option>
          )}
        </select>
        <button
          onClick={() => void listPrinters().then(setImpresoras)}
          title="Actualizar impresoras"
          aria-label="Actualizar impresoras"
          className="flex size-9 items-center justify-center border border-border bg-card hover:bg-muted"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
      {/* Tienda */}
      <div className="grid grid-cols-[200px_1fr] gap-2">
        <FieldBox label="Cód. Tienda:">
          <div className="flex h-9 items-center justify-center truncate text-lg tabular-nums">
            {prefijo}-{tienda.codigo}
          </div>
        </FieldBox>
        <FieldBox label="Tienda:">
          <div className="flex h-9 items-center truncate text-xl font-medium uppercase text-red-600">
            {tienda.nombre}
          </div>
        </FieldBox>
      </div>

      {/* Lote, código y producto */}
      <div className="grid grid-cols-[160px_160px_1fr] gap-2">
        <FieldBox label="Lote No.:">
          <div className="flex h-9 items-center justify-center text-xl font-bold tabular-nums">
            {formatOP(orden.opNumber)}
          </div>
        </FieldBox>
        <FieldBox label="Código:">
          <div className="flex h-9 items-center justify-center text-xl tabular-nums">
            {producto.codigo}
          </div>
        </FieldBox>
        <FieldBox label={<span className="truncate">Producto: {producto.nombre}</span>}>
          <div className="flex h-9 items-center truncate text-xl font-medium uppercase text-red-600">
            {producto.nombre}
          </div>
        </FieldBox>
      </div>

      {/* Fechas y conservación */}
      <div className="grid grid-cols-[1fr_1fr_1fr_80px_1.4fr] gap-2">
        <FieldBox label="Sacrificio:">
          <div className="flex h-9 items-center justify-center text-xl tabular-nums">
            {itemsOd.isLoading ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            ) : sacrificio ? (
              fechaCorta(sacrificio)
            ) : (
              '—'
            )}
          </div>
        </FieldBox>
        <FieldBox label="Empaque:">
          <div className="flex h-9 items-center justify-center text-xl tabular-nums text-red-600">
            {fechaCorta(empaque)}
          </div>
        </FieldBox>
        <FieldBox label="Vencimiento:">
          <div className="flex h-9 items-center justify-center text-xl tabular-nums text-red-600">
            {dias > 0 ? fechaCorta(vencimiento) : '—'}
          </div>
        </FieldBox>
        <FieldBox label="Días:">
          <div className="flex h-9 items-center justify-center text-xl font-bold tabular-nums">
            {dias}
          </div>
        </FieldBox>
        <FieldBox label={`Conservación: ${temp}`}>
          <div className="flex h-9 items-center gap-2">
            {(['refrigerado', 'congelado'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setConservacion(c)}
                aria-pressed={conservacion === c}
                className={cn(
                  'h-8 flex-1 select-none text-sm font-bold uppercase transition-colors',
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
      <div className="flex flex-wrap items-stretch gap-2">
        <FieldBox label="Ref:" className="w-44">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value.replace(/\D/g, ''))}
            onDoubleClick={keyboard.open}
            inputMode="numeric"
            maxLength={30}
            className="h-10 w-full bg-transparent text-2xl font-bold tabular-nums outline-none"
          />
        </FieldBox>
        <FieldBox label="Empaque:" className="w-40">
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
        <FieldBox label="Tara:" className="w-32">
          <input
            value={tara}
            onChange={(e) => setTara(soloDecimal(e.target.value))}
            onClick={() => setTecladoTara(true)}
            inputMode="none"
            className="my-1 h-8 w-full border-2 border-foreground/80 bg-transparent text-center text-xl font-bold tabular-nums outline-none"
          />
          {tecladoTara && (
            <NumericKeypad
              value={tara}
              onChange={setTara}
              onClose={() => setTecladoTara(false)}
            />
          )}
        </FieldBox>
        <FieldBox label="Bruto(kg)" className="w-32">
          <input
            value={bruto}
            onChange={(e) => setBruto(soloDecimal(e.target.value))}
            onClick={() => setTecladoBruto(true)}
            inputMode="none"
            title="Digita el peso o léelo de la báscula"
            className="h-10 w-full bg-transparent text-center text-2xl font-bold tabular-nums text-red-600 outline-none"
          />
          {tecladoBruto && (
            <NumericKeypad
              value={bruto}
              onChange={setBruto}
              onClose={() => setTecladoBruto(false)}
            />
          )}
        </FieldBox>
        <FieldBox label="Neto(kg):" className="w-32">
          <div className="flex h-10 items-center justify-center text-2xl font-bold tabular-nums text-emerald-600">
            {netoKg > 0 ? kg(netoKg) : ''}
          </div>
        </FieldBox>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={leerBascula} disabled={leyendo} title="Leer báscula" className={botonIcono}>
            {leyendo ? <LoaderCircle className="size-7 animate-spin" /> : <Gauge className="size-8" />}
          </button>
          <button
            onClick={() => void etiquetar()}
            disabled={netoKg <= 0 || imprimiendo}
            title="Etiquetar producto"
            className={botonIcono}
          >
            {imprimiendo ? <LoaderCircle className="size-7 animate-spin" /> : <Barcode className="size-8" />}
          </button>
          <button disabled title="Cerrar empaque (pendiente)" className={botonIcono}>
            <Package className="size-8" />
          </button>
        </div>
      </div>

      {/* Bodega y destino */}
      <div className="grid grid-cols-2 gap-2">
        <FieldBox label="Bodegas:">
          <select
            value={bodegaSel}
            onChange={(e) => setBodegaId(e.target.value)}
            className="my-1 h-8 w-full border border-border bg-card px-2 text-base outline-none"
          >
            <option value="">
              {bodegas.isLoading
                ? 'Cargando…'
                : bodegasActivas.length
                  ? ''
                  : 'El cliente no tiene bodegas activas'}
            </option>
            {bodegasActivas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} - {b.nombre}
              </option>
            ))}
          </select>
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
        <div className="h-28 overflow-auto pt-2 text-sm">
          {etiquetas.length === 0 ? null : (
            <ul className="divide-y divide-border">
              {[...etiquetas].reverse().map((e) => (
                <li key={e.n} className="flex justify-between py-1 tabular-nums">
                  <span>
                    #{e.n} · {e.hora}
                  </span>
                  <span>
                    Bruto {kg(e.brutoKg)} · Tara {kg(e.taraKg)} ·{' '}
                    <b>Neto {kg(e.netoKg)} kg</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FieldBox>

      {/* Totales */}
      <div className="grid grid-cols-[56px_110px_200px_1fr_1fr] items-stretch gap-2">
        <button
          onClick={() => setEtiquetas((prev) => prev.slice(0, -1))}
          disabled={!etiquetas.length}
          title="Quitar la última etiqueta"
          className={cn(botonIcono, 'size-auto self-stretch')}
        >
          <Trash2 className="size-8" />
        </button>
        <FieldBox label="Unds:">
          <div className="flex h-10 items-center justify-center text-3xl font-bold tabular-nums">
            {etiquetas.length}
          </div>
        </FieldBox>
        <FieldBox label="Total Neto(Kg):">
          <div className="flex h-10 items-center justify-center text-3xl font-bold tabular-nums">
            {kg(totalNeto)}
          </div>
        </FieldBox>
        <FieldBox label="Última Etiqueta:">
          <div className="flex h-10 items-center text-base tabular-nums">
            {ultima ? `#${ultima.n} · ${kg(ultima.netoKg)} kg · ${ultima.hora}` : ''}
          </div>
        </FieldBox>
        <FieldBox label="Último Empaque:">
          <div className="flex h-10 items-center text-base" />
        </FieldBox>
      </div>

      <div>
        <button
          disabled
          title="Pendiente"
          className="border-2 border-foreground/80 bg-card px-4 py-2 text-base font-medium uppercase disabled:opacity-60"
        >
          Impresión de etiquetas en tirilla
        </button>
      </div>
    </div>
  );
}

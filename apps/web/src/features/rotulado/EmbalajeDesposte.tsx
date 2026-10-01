import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { Barcode, Check, Gauge, LoaderCircle, Package, Trash2, TriangleAlert } from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { listPrinters, printRaw } from '@/lib/device';
import { cn, plantToday as today, soloDecimal } from '@/lib/utils';
import { useBodegas } from '../clientes/api';
import type { ProductoAsignado } from '../conservacion/api';
import { useItemsDespacho } from '../canal-fria/api';
import { useAuth } from '../auth/auth-context';
import { useDevice } from '../device/device-context';
import {
  formatOP,
  useBorrarEtiqueta,
  useCerrarCanastilla,
  useEstadoRotulado,
  useEtiquetasRotulado,
  useGuardarEtiqueta,
  usePresenciaRotulado,
  type CanastillaRotulado,
  type EstadoRotulado,
  type GuardarEtiquetaInput,
  type EtiquetaRotulado,
  type OrdenProduccion,
} from '../registrar/orden-produccion-api';
import { generarEtiquetaDesposteZpl, obtenerLogoEtiquetaZpl } from './etiqueta-desposte-zpl';
import { FieldBox } from './ui';

type Conservacion = 'refrigerado' | 'congelado';

const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

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
const SIN_IMPRESORA = 'No se encontró la impresora de etiquetas (Zebra) en este equipo.';

const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

/** Cierre de canastilla: la tara es la misma con la que se pesaron sus piezas; bruto = neto + tara. */
function CerrarCanastillaDialog({
  canastilla,
  undsPorCaja,
  guardando,
  onCerrar,
  onClose,
}: {
  canastilla: CanastillaRotulado;
  undsPorCaja: number;
  guardando: boolean;
  onCerrar: (taraKg: number) => void;
  onClose: () => void;
}) {
  const taraKg = canastilla.taraPiezas ?? 0;
  const caja = 'rounded-md border border-border px-3 py-2 text-center';
  const titulo = 'text-xs font-semibold uppercase text-muted-foreground';

  return (
    <Dialog open onClose={onClose} title={`Cerrar canastilla N.º ${canastilla.numero}`} className="max-w-lg">
      <div className="space-y-4">
        <p className="text-base">
          Tienda <b>{canastilla.tiendaCodigo} · {canastilla.tiendaNombre}</b>
        </p>
        <div className="grid grid-cols-4 gap-2">
          <div className={caja}>
            <p className={titulo}>Unds</p>
            <p className="text-2xl font-bold tabular-nums">
              {canastilla.unds}/{undsPorCaja}
            </p>
          </div>
          <div className={caja}>
            <p className={titulo}>Neto (kg)</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">{canastilla.netoKg.toFixed(2)}</p>
          </div>
          <div className={caja} title="Tara con la que se pesaron las piezas de esta canastilla">
            <p className={titulo}>Tara (kg)</p>
            <p className="text-2xl font-bold tabular-nums">{taraKg.toFixed(2)}</p>
          </div>
          <div className={caja}>
            <p className={titulo}>Bruto (kg)</p>
            <p className="text-2xl font-bold tabular-nums text-red-600">
              {(canastilla.netoKg + taraKg).toFixed(2)}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={guardando} onClick={() => onCerrar(taraKg)}>
            <Package className="size-4" />
            {guardando ? 'Cerrando…' : 'Cerrar e imprimir'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Mensaje que impide etiquetar hasta cerrar la canastilla abierta. */
function bloqueoCanastilla(estado: EstadoRotulado | undefined) {
  const c = estado?.canastilla;
  if (!estado || !c || c.unds === 0) return null;
  if (c.unds >= estado.capacidadCanastilla) {
    if (estado.capacidadCanastilla < estado.undsPorCaja) {
      const t = estado.tiendas.find((x) => x.tiendaId === c.tiendaId);
      return `La tienda ${c.tiendaCodigo} completó su pedido (${t?.etiquetadas ?? c.unds}/${t?.requeridas ?? c.unds}). Cierra la canastilla N.º ${c.numero} con el botón de caja.`;
    }
    return `Canastilla N.º ${c.numero} llena (${c.unds}/${estado.undsPorCaja}). Ciérrala con el botón de caja.`;
  }
  const sig = estado.tiendas.find((t) => t.tiendaId === estado.siguienteTiendaId);
  if (sig && sig.tiendaId !== c.tiendaId) {
    return `La tienda ${c.tiendaCodigo} completó este producto. Cierra la canastilla N.º ${c.numero} para seguir con la tienda ${sig.codigo}.`;
  }
  return null;
}

export function EmbalajeDesposte({
  orden,
  producto,
  prefijo,
}: {
  orden: OrdenProduccion;
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
  const [tecladoNeto, setTecladoNeto] = useState(false);
  // Neto digitado a mano; null = se calcula como bruto − tara.
  const [netoManual, setNetoManual] = useState<string | null>(null);
  // Número interno que digita el operario.
  const [ref, setRef] = useState('');
  const keyboard = useKeyboard();
  const { peso: bruto, setPeso: setBruto, leyendo, error, leerBascula } = useBascula('0.00');
  const [alerta, setAlerta] = useState<{ id: number; texto: string } | null>(null);

  useEffect(() => {
    if (error) setAlerta({ id: Date.now(), texto: error });
  }, [error]);

  // Toda alerta se quita sola a los 3 segundos.
  useEffect(() => {
    if (!alerta) return;
    const t = setTimeout(() => setAlerta(null), 3000);
    return () => clearTimeout(t);
  }, [alerta]);

  // Si cambia el bruto o la tara, el neto vuelve a calcularse.
  useEffect(() => {
    setNetoManual(null);
  }, [bruto, tara]);
  const [bodegaId, setBodegaId] = useState('');
  const bodegas = useBodegas(orden.cliente.id);
  const bodegasActivas = useMemo(
    () => (bodegas.data ?? []).filter((b) => b.active),
    [bodegas.data],
  );
  // Por defecto queda la primera bodega del cliente (se puede cambiar).
  const bodegaSel = bodegasActivas.some((b) => b.id === bodegaId)
    ? bodegaId
    : (bodegasActivas[0]?.id ?? '');
  const [procesadoPara, setProcesadoPara] = useState('');
  const [imprimir, setImprimir] = useState(true);
  const etiquetasQuery = useEtiquetasRotulado(orden.id, producto.id);
  const etiquetas = etiquetasQuery.data ?? [];
  const estadoQuery = useEstadoRotulado(orden.id, producto.id);
  const estado = estadoQuery.data;
  const { user } = useAuth();
  const equipo = useDevice();
  usePresenciaRotulado(orden.id, producto.id, {
    id: equipo.mac ?? equipo.hostname ?? '',
    nombre: equipo.deviceName ?? equipo.hostname ?? 'Estación',
    usuario: user?.fullName ?? '',
  });
  const guardarEtiqueta = useGuardarEtiqueta(orden.id);
  const borrarEtiqueta = useBorrarEtiqueta(orden.id);
  const cerrarCanastilla = useCerrarCanastilla(orden.id, producto.id);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [pidiendoSobrante, setPidiendoSobrante] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState<EtiquetaRotulado | null>(null);

  function borrar(etiquetaId: string, reabrir: boolean) {
    borrarEtiqueta.mutate(
      { etiquetaId, reabrir },
      {
        onSuccess: () => {
          setSeleccionada(null);
          setConfirmarBorrado(null);
        },
        onError: (err) => {
          setConfirmarBorrado(null);
          setAlerta({ id: Date.now(), texto: mensajeApi(err, 'No se pudo borrar la etiqueta.') });
        },
      },
    );
  }
  // Etiqueta ya impresa cuyo guardado falló: se reintenta sin reimprimir.
  const [registroPendiente, setRegistroPendiente] = useState<GuardarEtiquetaInput | null>(null);
  const [impresora, setImpresora] = useState(() => localStorage.getItem(PRINTER_KEY) ?? '');
  const [imprimiendo, setImprimiendo] = useState(false);
  const [piezaPendiente, setPiezaPendiente] = useState<number | null>(null);

  // Sin selector en pantalla: usa la guardada si sigue instalada, si no la Zebra o la predeterminada.
  useEffect(() => {
    void listPrinters().then((lista) => {
      const guardada = localStorage.getItem(PRINTER_KEY);
      const elegida =
        lista.find((p) => p.name === guardada) ??
        lista.find((p) => /zebra|zdesigner/i.test(p.name)) ??
        lista.find((p) => p.isDefault);
      if (elegida) setImpresora(elegida.name);
    });
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
  const netoCalculado = Math.max(brutoKg - taraKg, 0);
  const netoTexto = netoManual ?? netoCalculado.toFixed(2);
  const netoKg = netoManual !== null ? Number(netoManual) || 0 : netoCalculado;
  const ultima = etiquetas[0] ?? null;
  // La última etiqueta impresa puede ser la de una canastilla recién cerrada.
  const ultimaCanastilla = estado?.ultimaCanastilla ?? null;
  const ultimaEsCanastilla =
    !!ultimaCanastilla?.cerradaAt && (!ultima || ultimaCanastilla.cerradaAt > ultima.createdAt);
  // Tienda a la que va la siguiente pieza (en orden de código hasta completar cada una).
  const siguiente = estado?.tiendas.find((t) => t.tiendaId === estado.siguienteTiendaId) ?? null;
  const canastilla = estado?.canastilla?.unds ? estado.canastilla : null;
  const tiendaVista =
    siguiente ?? estado?.tiendas.find((t) => t.tiendaId === canastilla?.tiendaId) ?? null;
  const todasCompletas = !!estado && !siguiente;
  const bloqueo = bloqueoCanastilla(estado);
  const taraDistinta =
    canastilla?.taraPiezas != null && Math.abs(Number(taraKg.toFixed(2)) - canastilla.taraPiezas) > 0.001;

  // Mientras la canastilla tenga piezas, la tara es la de ellas.
  useEffect(() => {
    if (canastilla?.taraPiezas != null) setTara(canastilla.taraPiezas.toFixed(2));
  }, [canastilla?.id, canastilla?.taraPiezas]);

  async function registrar(registro: GuardarEtiquetaInput) {
    try {
      await guardarEtiqueta.mutateAsync(registro);
      setRegistroPendiente(null);
      setPiezaPendiente(null);
      setBruto('0.00');
    } catch (err) {
      setRegistroPendiente(registro);
      setAlerta({
        id: Date.now(),
        texto: `${mensajeApi(err, 'La etiqueta se imprimió pero no se guardó.')} Presiona etiquetar de nuevo para reintentar el guardado (no se reimprime).`,
      });
    }
  }

  async function imprimirCanastilla(c: CanastillaRotulado, reimpresion = false) {
    if (!c.datos || c.taraKg === null || c.brutoKg === null) return;
    if (!impresora) {
      setAlerta({ id: Date.now(), texto: SIN_IMPRESORA });
      return;
    }
    try {
      const logo = await obtenerLogoEtiquetaZpl();
      const resultado = await printRaw(impresora, generarEtiquetaDesposteZpl({
        tienda: c.tiendaCodigo,
        lote: formatOP(orden.opNumber),
        productoCodigo: producto.codigo,
        productoNombre: producto.nombre,
        empaque: c.datos.empaque,
        pieza: c.unds,
        netoKg: c.netoKg,
        sacrificio: c.datos.fechaSacrificio,
        produccion: c.datos.fechaEmpaque,
        vencimiento: c.datos.fechaVencimiento ?? c.datos.fechaEmpaque,
        conservacion: c.datos.conservacion,
        temperatura: c.datos.temperatura,
        ref: c.datos.ref ?? '',
        canastilla: { numero: c.numero, taraKg: c.taraKg, brutoKg: c.brutoKg },
      }, logo));
      setAlerta({
        id: Date.now(),
        texto: resultado.ok
          ? `Canastilla N.º ${c.numero} ${reimpresion ? 'reimpresa' : 'cerrada e impresa'}.`
          : resultado.error || 'No se pudo imprimir la etiqueta de la canastilla.',
      });
    } catch {
      setAlerta({ id: Date.now(), texto: 'No se pudo enviar la etiqueta de la canastilla a la impresora.' });
    }
  }

  async function cerrar(taraCanastilla: number) {
    if (!canastilla) return;
    try {
      const c = await cerrarCanastilla.mutateAsync({
        canastillaId: canastilla.id,
        taraKg: taraCanastilla,
      });
      setCerrando(false);
      await imprimirCanastilla(c);
    } catch (err) {
      setAlerta({ id: Date.now(), texto: mensajeApi(err, 'No se pudo cerrar la canastilla.') });
    }
  }

  async function reimprimir(e: EtiquetaRotulado) {
    if (imprimiendo) return;
    if (!impresora) {
      setAlerta({ id: Date.now(), texto: SIN_IMPRESORA });
      return;
    }
    setImprimiendo(true);
    try {
      const logo = await obtenerLogoEtiquetaZpl();
      const resultado = await printRaw(impresora, generarEtiquetaDesposteZpl({
        tienda: e.tiendaCodigo,
        lote: formatOP(orden.opNumber),
        productoCodigo: producto.codigo,
        productoNombre: producto.nombre,
        empaque: e.empaque,
        pieza: e.pieza,
        netoKg: e.netoKg,
        sacrificio: e.fechaSacrificio,
        produccion: e.fechaEmpaque,
        vencimiento: e.fechaVencimiento ?? e.fechaEmpaque,
        conservacion: e.conservacion,
        temperatura: e.temperatura,
        ref: e.ref ?? '',
      }, logo));
      setAlerta({
        id: Date.now(),
        texto: resultado.ok
          ? `Pieza #${e.pieza} reimpresa.`
          : resultado.error || 'No se pudo reimprimir la etiqueta.',
      });
    } catch {
      setAlerta({ id: Date.now(), texto: 'No se pudo enviar la etiqueta a la impresora.' });
    } finally {
      setImprimiendo(false);
    }
  }

  async function etiquetar() {
    if (imprimiendo) return;
    // Con una fila seleccionada, el botón reimprime esa etiqueta.
    const filaSel = etiquetas.find((e) => e.id === seleccionada);
    if (filaSel) {
      await reimprimir(filaSel);
      return;
    }
    if (registroPendiente) {
      setImprimiendo(true);
      await registrar(registroPendiente);
      setImprimiendo(false);
      return;
    }
    if (netoKg <= 0 || !estado) return;
    if (!estado.activa) {
      setAlerta({ id: Date.now(), texto: 'La orden de producción no está activa.' });
      return;
    }
    if (bloqueo) {
      setAlerta({ id: Date.now(), texto: bloqueo });
      return;
    }
    if (imprimir && !impresora) {
      setAlerta({ id: Date.now(), texto: SIN_IMPRESORA });
      return;
    }
    if (!sacrificio) {
      setAlerta({ id: Date.now(), texto: 'No se encontró la fecha de sacrificio de la orden.' });
      return;
    }
    if (siguiente) {
      await etiquetarEn(siguiente.tiendaId, siguiente.codigo, false);
    } else {
      // Todas las tiendas completas: el operario decide a qué tienda va el sobrante.
      setPidiendoSobrante(true);
    }
  }

  async function etiquetarEn(tiendaId: string, tiendaCodigo: string, sobrante: boolean) {
    if (!sacrificio) return;
    if (canastilla && canastilla.tiendaId !== tiendaId) {
      setAlerta({
        id: Date.now(),
        texto: `La canastilla N.º ${canastilla.numero} es de la tienda ${canastilla.tiendaCodigo}. Ciérrala antes de seguir.`,
      });
      return;
    }
    if (taraDistinta && canastilla?.taraPiezas != null) {
      setAlerta({
        id: Date.now(),
        texto: `La tara de la canastilla N.º ${canastilla.numero} es ${canastilla.taraPiezas.toFixed(2)} kg; todas sus piezas deben llevar la misma tara.`,
      });
      setTara(canastilla.taraPiezas.toFixed(2));
      return;
    }
    setImprimiendo(true);
    try {
      let pieza = piezaPendiente;
      if (pieza === null) {
        const response = await api.post<{ pieza: number }>(
          `/production-orders/${orden.id}/etiquetas/reservar`,
          { productId: producto.id, tiendaId, sobrante, taraKg: Number(taraKg.toFixed(2)) },
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
          tienda: tiendaCodigo,
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
      await registrar({
        productId: producto.id,
        tiendaId,
        sobrante,
        bodegaId: bodegaSel || undefined,
        pieza,
        taraKg: Number(taraKg.toFixed(2)),
        brutoKg: Number(brutoKg.toFixed(2)),
        netoKg: Number(netoKg.toFixed(2)),
        empaque: alVacio ? 'AL VACIO' : 'A GRANEL',
        conservacion,
        temperatura: temp,
        fechaSacrificio: sacrificio,
        fechaEmpaque: empaque,
        fechaVencimiento: dias > 0 ? vencimiento : undefined,
        ref: ref || undefined,
        procesadoPara: procesadoPara || undefined,
        impresa: imprimir,
      });
    } catch (err) {
      setAlerta({
        id: Date.now(),
        texto: mensajeApi(err, 'No se pudo reservar la pieza o enviar la etiqueta a la impresora.'),
      });
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
      {/* Tienda: la asigna el software según la preparación de la orden */}
      <div className="grid grid-cols-[200px_1fr_1.2fr] gap-2">
        <FieldBox label="Cód. Tienda:">
          <div className="flex h-8 items-center justify-center truncate text-lg tabular-nums">
            {tiendaVista ? `${prefijo}-${tiendaVista.codigo}` : ''}
          </div>
        </FieldBox>
        <FieldBox label="Tienda:">
          <div className="flex h-8 items-center gap-2 truncate text-xl font-medium uppercase text-red-600">
            {estadoQuery.isLoading ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            ) : (
              tiendaVista?.nombre
            )}
            {todasCompletas && (
              <span className="rounded-sm bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
                SOBRANTE
              </span>
            )}
          </div>
        </FieldBox>
        <FieldBox label={`Avance (${estado?.piezasPorCanal ?? '—'} pz x canal):`}>
          <div className="flex min-h-8 flex-wrap items-center gap-1 py-1">
            {estado?.tiendas.map((t) => {
              const completa = t.etiquetadas >= t.requeridas;
              return (
                <span
                  key={t.tiendaId}
                  title={`${t.nombre}: ${t.canales} canal(es)`}
                  className={cn(
                    'rounded-sm border px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                    completa
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : t.tiendaId === estado.siguienteTiendaId
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-border text-muted-foreground',
                  )}
                >
                  {t.codigo}: {t.etiquetadas}/{t.requeridas}
                  {t.sobrantes > 0 && ` +${t.sobrantes}`}
                </span>
              );
            })}
          </div>
        </FieldBox>
      </div>

      {/* Lote, código y producto */}
      <div className="grid grid-cols-[160px_160px_1fr] gap-2">
        <FieldBox label="Lote No.:">
          <div className="flex h-8 items-center justify-center text-xl font-bold tabular-nums">
            {formatOP(orden.opNumber)}
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
          <div className="flex h-8 items-center justify-center text-xl tabular-nums">
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
            title={
              canastilla?.taraPiezas != null
                ? `Tara de la canastilla N.º ${canastilla.numero}: ${canastilla.taraPiezas.toFixed(2)} kg`
                : undefined
            }
            className={cn(
              'my-1 h-8 w-full border-2 bg-transparent text-center text-xl font-bold tabular-nums outline-none',
              taraDistinta ? 'border-red-600 text-red-600' : 'border-foreground/80',
            )}
          />
          {tecladoTara && (
            <NumericKeypad
              value={tara}
              onChange={setTara}
              onClose={() => setTecladoTara(false)}
            />
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
            <NumericKeypad
              value={bruto}
              onChange={setBruto}
              onClose={() => setTecladoBruto(false)}
            />
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
            disabled={
              (netoKg <= 0 && !registroPendiente && !seleccionada) ||
              (!!bloqueo && !registroPendiente && !seleccionada) ||
              imprimiendo
            }
            title={seleccionada ? 'Reimprimir la etiqueta seleccionada' : (bloqueo ?? 'Etiquetar producto')}
            className={botonIcono}
          >
            {imprimiendo ? <LoaderCircle className="size-7 animate-spin" /> : <Barcode className="size-8" />}
          </button>
          <button
            onClick={() => setCerrando(true)}
            disabled={!canastilla || imprimiendo || cerrarCanastilla.isPending}
            title={canastilla ? `Cerrar la canastilla N.º ${canastilla.numero}` : 'No hay canastilla abierta'}
            className={cn(botonIcono, bloqueo && 'animate-pulse border-amber-500 bg-amber-100')}
          >
            <Package className="size-8" />
          </button>
        </div>
        <FieldBox label={canastilla ? `Canast. ${canastilla.numero}:` : 'Canast.:'} className="w-28 shrink-0">
          <div
            title={
              estado
                ? `Esta canastilla lleva hasta ${estado.capacidadCanastilla} (caja de ${estado.undsPorCaja}${
                    estado.capacidadCanastilla < estado.undsPorCaja ? '; limitada por lo que pide la tienda' : ''
                  }).`
                : undefined
            }
            className="flex h-9 items-center justify-center gap-1.5"
          >
            <span
              className={cn(
                'text-2xl font-bold tabular-nums',
                estado && canastilla && canastilla.unds >= estado.capacidadCanastilla
                  ? 'text-red-600'
                  : 'text-sky-700',
              )}
            >
              {canastilla?.unds ?? 0}/{estado?.capacidadCanastilla ?? '—'}
            </span>
            {estado && estado.capacidadCanastilla < estado.undsPorCaja && (
              <span className="text-[10px] font-semibold leading-tight text-muted-foreground">
                caja
                <br />
                de {estado.undsPorCaja}
              </span>
            )}
          </div>
        </FieldBox>
      </div>

      {bloqueo && (
        <div className="flex items-center gap-2 rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          <TriangleAlert className="size-5 shrink-0 text-amber-500" />
          {bloqueo}
        </div>
      )}

      {/* Bodega y destino */}
      <div className="grid grid-cols-2 gap-2">
        <FieldBox label="Bodegas:">
          {/* Lista táctil (no desplegable); siempre queda una seleccionada. */}
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
                <th className="px-2 py-1">Hora</th>
                <th className="px-2 py-1">Tienda</th>
                <th className="px-2 py-1">N.º canastilla</th>
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
                  <td className="px-2 py-1">{horaDe(e.createdAt)}</td>
                  <td className="px-2 py-1">
                    {e.tiendaCodigo}
                    {e.sobrante && (
                      <span className="ml-1.5 rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                        SOBRANTE
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">{e.canastillaNumero ?? ''}</td>
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
      <div className="grid grid-cols-[56px_200px_1fr_1fr] items-stretch gap-2">
        <button
          onClick={() => {
            const fila = etiquetas.find((e) => e.id === seleccionada);
            if (!fila) return;
            if (fila.canastillaCerrada) {
              setConfirmarBorrado(fila);
              return;
            }
            borrar(fila.id, false);
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
        <FieldBox label="Neto canastilla(Kg):">
          <div className="flex h-9 items-center justify-center text-2xl font-bold tabular-nums">
            {kg(canastilla?.netoKg ?? 0)}
          </div>
        </FieldBox>
        <FieldBox label="Última Etiqueta:">
          <button
            type="button"
            onClick={() => {
              if (ultimaEsCanastilla && ultimaCanastilla) void imprimirCanastilla(ultimaCanastilla, true);
              else if (ultima) void reimprimir(ultima);
            }}
            disabled={(!ultima && !ultimaEsCanastilla) || imprimiendo}
            title={ultima || ultimaEsCanastilla ? 'Clic para reimprimir la última etiqueta' : undefined}
            className="flex h-9 w-full items-center text-left text-base tabular-nums hover:text-sky-700 disabled:cursor-default disabled:hover:text-inherit"
          >
            {ultimaEsCanastilla && ultimaCanastilla
              ? `Canast. ${ultimaCanastilla.numero} · ${ultimaCanastilla.unds} und · ${kg(ultimaCanastilla.netoKg)} kg · ${horaDe(ultimaCanastilla.cerradaAt!)}`
              : ultima
                ? `#${ultima.pieza} · ${kg(ultima.netoKg)} kg · ${horaDe(ultima.createdAt)}`
                : ''}
          </button>
        </FieldBox>
        <FieldBox label="Último Empaque:">
          {(() => {
            const u = estado?.ultimaCanastilla;
            return (
              <button
                type="button"
                onClick={() => u && void imprimirCanastilla(u, true)}
                disabled={!u}
                title={u ? 'Clic para reimprimir la etiqueta de la canastilla' : undefined}
                className="flex h-9 w-full items-center text-left text-base tabular-nums hover:text-sky-700 disabled:cursor-default disabled:hover:text-inherit"
              >
                {u ? `Canast. ${u.numero} · T${u.tiendaCodigo} · ${u.unds} und · ${kg(u.netoKg)} kg` : ''}
              </button>
            );
          })()}
        </FieldBox>
      </div>

      {pidiendoSobrante && estado && (
        <Dialog
          open
          onClose={() => setPidiendoSobrante(false)}
          title="Producto completo"
          className="max-w-lg"
        >
          <div className="space-y-3">
            <p className="text-base">
              Todas las tiendas ya tienen completo <b>{producto.nombre}</b>. Si vas a etiquetar esta
              pieza, elige a qué tienda va; quedará marcada como <b>SOBRANTE</b>.
            </p>
            <div className="flex flex-col gap-2">
              {estado.tiendas.map((t) => {
                const otraCanastilla = !!canastilla && canastilla.tiendaId !== t.tiendaId;
                return (
                  <button
                    key={t.tiendaId}
                    disabled={otraCanastilla}
                    title={
                      otraCanastilla
                        ? `Cierra primero la canastilla N.º ${canastilla!.numero} (tienda ${canastilla!.tiendaCodigo}).`
                        : undefined
                    }
                    onClick={() => {
                      setPidiendoSobrante(false);
                      void etiquetarEn(t.tiendaId, t.codigo, true);
                    }}
                    className="flex h-14 items-center justify-between rounded-md border-2 border-border bg-card px-4 text-left text-lg font-semibold uppercase hover:bg-muted disabled:opacity-40"
                  >
                    <span>
                      <span className="tabular-nums">{prefijo}-{t.codigo}</span> · {t.nombre}
                    </span>
                    <span className="text-sm font-medium tabular-nums text-muted-foreground">
                      {t.etiquetadas}/{t.requeridas}
                      {t.sobrantes > 0 && ` +${t.sobrantes} sobr.`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setPidiendoSobrante(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {confirmarBorrado && (
        <Dialog
          open
          onClose={() => setConfirmarBorrado(null)}
          title="¿Borrar esta etiqueta?"
          className="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-base">
              La pieza <b>#{confirmarBorrado.pieza}</b> ({kg(confirmarBorrado.netoKg)} kg) está en la{' '}
              <b>canastilla N.º {confirmarBorrado.canastillaNumero}</b>, que ya estaba cerrada.
            </p>
            <p className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Si la borras, la pieza vuelve a quedar pendiente para la tienda {confirmarBorrado.tiendaCodigo} y la
              canastilla N.º {confirmarBorrado.canastillaNumero} se reabre: habrá que cerrarla de nuevo y
              reimprimir su etiqueta.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarBorrado(null)}>
                No
              </Button>
              <Button
                variant="destructive"
                disabled={borrarEtiqueta.isPending}
                onClick={() => borrar(confirmarBorrado.id, true)}
              >
                <Trash2 className="size-4" />
                {borrarEtiqueta.isPending ? 'Borrando…' : 'Sí, borrar'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {cerrando && canastilla && estado && (
        <CerrarCanastillaDialog
          canastilla={canastilla}
          undsPorCaja={estado.capacidadCanastilla}
          guardando={cerrarCanastilla.isPending}
          onCerrar={(t) => void cerrar(t)}
          onClose={() => setCerrando(false)}
        />
      )}
    </div>
  );
}

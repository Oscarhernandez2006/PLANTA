import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { Barcode, Check, Gauge, LoaderCircle, Package, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { useBascula } from '@/components/bascula/Bascula';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { printRaw } from '@/lib/device';
import { cn, plantToday as today, soloDecimal } from '@/lib/utils';
import { useBodegas } from '../clientes/api';
import type { ProductoAsignado } from '../conservacion/api';
import { useItemsDespacho } from '../canal-fria/api';
import { useAuth } from '../auth/auth-context';
import { useDevice } from '../device/device-context';
import {
  formatOP,
  registrarReimpresion,
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
import { formatPieza, generarEtiquetaDesposteZpl, obtenerLogoEtiquetaZpl } from './etiqueta-desposte-zpl';
import { FieldBox, SIN_IMPRESORA, useImpresoraEtiquetas } from './ui';

type Conservacion = 'refrigerado' | 'congelado';

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums">{children}</div>
    </div>
  );
}

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

/**
 * Etiquetas al cerrar una canastilla, siempre 2 iguales:
 * al vacío = una para la bolsa y otra para la canastilla; a granel = la caja impresa dos veces.
 */
const copiasCanastilla = () => 2;

type MemoriaEmbalaje = { alVacio?: boolean; tara?: string; ref?: string };
const claveMemoria = (ordenId: string) => `rotulado-desposte:${ordenId}`;

/** Lo último que digitó el operario en la OP (sesión de la app), para no repetirlo en cada producto. */
function leerMemoriaEmbalaje(ordenId: string): MemoriaEmbalaje {
  try {
    return JSON.parse(sessionStorage.getItem(claveMemoria(ordenId)) ?? '{}') as MemoriaEmbalaje;
  } catch {
    return {};
  }
}

function guardarMemoriaEmbalaje(ordenId: string, valor: MemoriaEmbalaje) {
  try {
    sessionStorage.setItem(claveMemoria(ordenId), JSON.stringify(valor));
  } catch {
    // Sin almacenamiento disponible: solo se pierde la comodidad de recordar los datos.
  }
}

const mensajeApi = (err: unknown, porDefecto: string) => {
  const m = isAxiosError(err) ? err.response?.data?.message : null;
  return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : porDefecto;
};

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
  // Empaque, tara y ref se conservan al cambiar de producto dentro de la misma OP.
  const [memoria] = useState(() => leerMemoriaEmbalaje(orden.id));
  const [alVacio, setAlVacio] = useState(memoria.alVacio ?? /VAC[IÍ]O/i.test(producto.nombre));
  const [tara, setTara] = useState(memoria.tara ?? '0.00');
  const [tecladoTara, setTecladoTara] = useState(false);
  const [tecladoBruto, setTecladoBruto] = useState(false);
  // Número interno que digita el operario.
  const [ref, setRef] = useState(memoria.ref ?? '');
  useEffect(() => {
    guardarMemoriaEmbalaje(orden.id, { alVacio, tara, ref });
  }, [orden.id, alVacio, tara, ref]);
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
    nombre: equipo.hostname ?? 'Estación',
    usuario: user?.fullName ?? '',
  });
  const guardarEtiqueta = useGuardarEtiqueta(orden.id);
  const borrarEtiqueta = useBorrarEtiqueta(orden.id);
  const cerrarCanastilla = useCerrarCanastilla(orden.id, producto.id);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [pidiendoSobrante, setPidiendoSobrante] = useState(false);
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
  const impresora = useImpresoraEtiquetas();
  const [imprimiendo, setImprimiendo] = useState(false);
  const [piezaPendiente, setPiezaPendiente] = useState<{ pieza: number; codigo: string } | null>(null);

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
  // Al vacío la tara es la bolsa: el neto es el bruto completo y la tara se imprime aparte.
  const netoCalculado = alVacio ? brutoKg : Math.max(brutoKg - taraKg, 0);
  const netoTexto = netoCalculado.toFixed(2);
  const netoKg = netoCalculado;
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

  /**
   * Lee la báscula y deja el peso en Bruto, sin importar qué casilla tenga el cursor:
   * cierra los teclados abiertos y quita el foco para que nada pise el valor leído.
   */
  async function tomarPeso() {
    setTecladoTara(false);
    setTecladoBruto(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await leerBascula();
  }

  async function registrar(registro: GuardarEtiquetaInput, autoCerrar = true) {
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
      return false;
    }
    // Al vacío: si con esta pieza la canastilla quedó llena (o su tienda completa), se cierra sola
    // y salen sus 2 etiquetas, sin preguntar. A granel el cierre lo maneja el botón de caja.
    if (autoCerrar) {
      const { data: nuevo } = await estadoQuery.refetch();
      const c = nuevo?.canastilla;
      if (c && c.unds > 0 && bloqueoCanastilla(nuevo)) {
        await cerrar(c.taraPiezas ?? registro.taraKg, c.id);
      }
    }
    return true;
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
        codigo: c.codigo ?? undefined,
        canastilla: { numero: c.numero, taraKg: c.taraKg, brutoKg: c.brutoKg },
      }, logo, reimpresion ? 1 : copiasCanastilla()));
      if (reimpresion && resultado.ok) registrarReimpresion(c.codigo, equipo.hostname);
      const copias = copiasCanastilla();
      setAlerta({
        id: Date.now(),
        texto: resultado.ok
          ? `Canastilla N.º ${c.numero} ${
              reimpresion
                ? 'reimpresa'
                : copias > 1
                  ? `cerrada: ${copias} etiquetas impresas`
                  : 'cerrada e impresa'
            }.`
          : resultado.error || 'No se pudo imprimir la etiqueta de la canastilla.',
      });
    } catch {
      setAlerta({ id: Date.now(), texto: 'No se pudo enviar la etiqueta de la canastilla a la impresora.' });
    }
  }

  async function cerrar(taraCanastilla: number, canastillaId = canastilla?.id) {
    if (!canastillaId) return;
    try {
      const c = await cerrarCanastilla.mutateAsync({
        canastillaId,
        taraKg: taraCanastilla,
      });
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
        codigo: e.codigo ?? undefined,
        ...(e.empaque === 'AL VACIO' ? { taraKg: e.taraKg } : {}),
      }, logo));
      if (resultado.ok) registrarReimpresion(e.codigo, equipo.hostname);
      setAlerta({
        id: Date.now(),
        texto: resultado.ok
          ? `Pieza #${formatPieza(e.pieza)} reimpresa.`
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

  /** A granel: pesa la caja, registra 1 pieza (sin etiqueta de pieza) y cierra enseguida (2 etiquetas de caja). */
  async function etiquetarCaja() {
    if (imprimiendo || cerrarCanastilla.isPending || netoKg <= 0 || !estado) return;
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
      await etiquetarEn(siguiente.tiendaId, siguiente.codigo, false, true);
    } else {
      setPidiendoSobrante(true);
    }
  }

  async function etiquetarEn(tiendaId: string, tiendaCodigo: string, sobrante: boolean, caja = false) {
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
      let reserva = piezaPendiente;
      if (reserva === null) {
        const response = await api.post<{ pieza: number; codigo: string }>(
          `/production-orders/${orden.id}/etiquetas/reservar`,
          {
            productId: producto.id,
            tiendaId,
            sobrante,
            taraKg: Number(taraKg.toFixed(2)),
            // El nombre del PC (p. ej. DBOVINO3) da el número que va en el código.
            estacion: equipo.hostname ?? undefined,
          },
        );
        reserva = response.data;
        setPiezaPendiente(reserva);
      }
      const { pieza, codigo } = reserva;
      // La etiqueta de pieza solo se imprime al vacío; a granel sale la etiqueta de caja al cerrar.
      if (imprimir && alVacio && !caja) {
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
          codigo,
          ...(alVacio ? { taraKg: Number(taraKg.toFixed(2)) } : {}),
        }, logo));
        if (!resultado.ok) {
          setAlerta({ id: Date.now(), texto: resultado.error || 'No se pudo imprimir la etiqueta.' });
          return;
        }
      }
      setPiezaPendiente(null);
      const ok = await registrar(
        {
          productId: producto.id,
          tiendaId,
          sobrante,
          bodegaId: bodegaSel || undefined,
          pieza,
          codigo,
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
          estacion: equipo.hostname ?? undefined,
        },
        !caja,
      );
      // A granel: cierra la caja (canastilla) enseguida e imprime sus 2 etiquetas.
      if (ok && caja) {
        const { data: nuevo } = await estadoQuery.refetch();
        const c = nuevo?.canastilla;
        if (c) await cerrar(c.taraPiezas ?? Number(taraKg.toFixed(2)), c.id);
      }
    } catch (err) {
      setAlerta({
        id: Date.now(),
        texto: mensajeApi(err, 'No se pudo reservar la pieza o enviar la etiqueta a la impresora.'),
      });
    } finally {
      setImprimiendo(false);
    }
  }

  const etiquetaDeshabilitada =
    !alVacio ||
    (netoKg <= 0 && !registroPendiente && !seleccionada) ||
    (!!bloqueo && !registroPendiente && !seleccionada) ||
    imprimiendo;
  const filaSel = etiquetas.find((e) => e.id === seleccionada) ?? null;
  const capacidad = estado?.capacidadCanastilla ?? 0;
  const llena = !!canastilla && capacidad > 0 && canastilla.unds >= capacidad;

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
        {/* Producto y tienda (la asigna el software según la preparación) */}
        <div className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xl font-bold uppercase">{producto.nombre}</div>
              <div className="text-sm text-muted-foreground">
                Código <span className="tabular-nums">{producto.codigo}</span> · Lote{' '}
                <span className="tabular-nums">{formatOP(orden.opNumber)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tienda</div>
              <div className="flex items-center justify-end gap-2 text-lg font-bold uppercase text-primary">
                {estadoQuery.isLoading ? (
                  <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
                ) : tiendaVista ? (
                  <span className="truncate">
                    <span className="tabular-nums">{prefijo}-{tiendaVista.codigo}</span> · {tiendaVista.nombre}
                  </span>
                ) : (
                  '—'
                )}
                {todasCompletas && (
                  <span className="rounded-md bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">SOBRANTE</span>
                )}
              </div>
            </div>
          </div>
          {!!estado?.tiendas.length && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">
                Avance ({estado.piezasPorCanal} pz × canal):
              </span>
              {estado.tiendas.map((t) => {
                const completa = t.etiquetadas >= t.requeridas;
                return (
                  <span
                    key={t.tiendaId}
                    title={`${t.nombre}: ${t.canales} canal(es)`}
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1',
                      completa
                        ? 'bg-primary/10 text-primary ring-primary/30'
                        : t.tiendaId === estado.siguienteTiendaId
                          ? 'bg-amber-50 text-amber-800 ring-amber-300'
                          : 'text-muted-foreground ring-border',
                    )}
                  >
                    {t.codigo}: {t.etiquetadas}/{t.requeridas}
                    {t.sobrantes > 0 && ` +${t.sobrantes}`}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Fechas, conservación, empaque, bodega */}
        <div className="shrink-0 space-y-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-4">
            <Dato label="Sacrificio">
              {itemsOd.isLoading ? (
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
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conservación · {temp}
              </span>
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
            {/* Lista táctil (no desplegable); siempre queda una seleccionada. */}
            {bodegas.isLoading ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            ) : !bodegasActivas.length ? (
              <p className="text-sm text-muted-foreground">
                El cliente no tiene bodegas activas (Administrativo → Clientes → Bodegas).
              </p>
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

        {bloqueo && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            <TriangleAlert className="size-5 shrink-0 text-amber-500" />
            {bloqueo}
          </div>
        )}

        {/* Etiquetas hechas */}
        <div className="flex min-h-40 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-4 pb-2 pt-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Etiquetas <span className="tabular-nums text-foreground">({etiquetas.length})</span>
            </h3>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={imprimir}
                onChange={(e) => setImprimir(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Imprimir etiqueta de producto
            </label>
            {filaSel && (
              <Button
                variant="outline"
                className="ml-auto h-9 border-red-200 text-red-700 hover:bg-red-50"
                disabled={borrarEtiqueta.isPending}
                onClick={() => {
                  if (filaSel.canastillaCerrada) {
                    setConfirmarBorrado(filaSel);
                    return;
                  }
                  borrar(filaSel.id, false);
                }}
              >
                <Trash2 className="size-4" />
                Borrar #{formatPieza(filaSel.pieza)}
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
                  <th>Canast.</th>
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
                    <td className="font-semibold">#{formatPieza(e.pieza)}</td>
                    <td className="font-mono font-semibold">{e.codigo ?? '—'}</td>
                    <td>{horaDe(e.createdAt)}</td>
                    <td>
                      {e.tiendaCodigo}
                      {e.sobrante && (
                        <span className="ml-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                          SOBRANTE
                        </span>
                      )}
                    </td>
                    <td>{e.canastillaNumero ?? ''}</td>
                    <td className="text-right">{kg(e.brutoKg)}</td>
                    <td className="text-right">{kg(e.taraKg)}</td>
                    <td className="text-right font-bold">{kg(e.netoKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!etiquetas.length && (
              <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay etiquetas de este producto.</p>
            )}
          </div>
        </div>
      </div>

      {/* Panel de pesaje */}
      <div className="flex min-h-0 flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4 shadow-sm">
        {/* Canastilla abierta */}
        <div
          className={cn(
            'rounded-lg px-3 py-2',
            llena ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-muted/50',
          )}
          title={
            estado
              ? `Esta canastilla lleva hasta ${estado.capacidadCanastilla} (caja de ${estado.undsPorCaja}${
                  estado.capacidadCanastilla < estado.undsPorCaja ? '; limitada por lo que pide la tienda' : ''
                }).`
              : undefined
          }
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {canastilla ? `Canastilla N.º ${canastilla.numero}` : 'Canastilla'}
            </span>
            <span className={cn('text-lg font-bold tabular-nums', llena ? 'text-amber-700' : 'text-foreground')}>
              {canastilla?.unds ?? 0}/{capacidad || '—'} und
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-background">
            <div
              className={cn('h-full rounded-full', llena ? 'bg-amber-500' : 'bg-primary')}
              style={{ width: `${capacidad ? Math.min(100, ((canastilla?.unds ?? 0) / capacidad) * 100) : 0}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Neto <b className="tabular-nums text-foreground">{kg(canastilla?.netoKg ?? 0)}</b> kg
            {estado && estado.capacidadCanastilla < estado.undsPorCaja && ` · caja de ${estado.undsPorCaja}`}
          </div>
        </div>

        {/* Tara y bruto */}
        <div className="grid grid-cols-2 gap-3">
          <FieldBox label="Tara (kg)">
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
                'h-10 w-full bg-transparent text-center text-2xl font-bold tabular-nums outline-none',
                taraDistinta && 'text-red-600',
              )}
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
        {taraDistinta && (
          <p className="-mt-1 text-xs font-medium text-red-600">La tara no coincide con la de la canastilla abierta.</p>
        )}

        {/* Neto: calculado, no se puede digitar */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neto</span>
          <div
            title={
              alVacio
                ? 'Al vacío: el neto es el bruto completo (la tara de la bolsa sale aparte en la etiqueta)'
                : 'Se calcula como bruto − tara'
            }
            className="mt-1 flex items-baseline justify-end gap-2 rounded-xl border-2 border-primary/40 bg-muted/30 px-4 py-3"
          >
            <span className="text-5xl font-bold tabular-nums">{netoTexto}</span>
            <span className="text-xl font-semibold text-muted-foreground">kg</span>
          </div>
        </div>
        {error && <p className="-mt-1 text-xs font-medium text-red-600">{error}</p>}

        <Button variant="outline" className="h-12 text-base" onClick={() => void tomarPeso()} disabled={leyendo}>
          {leyendo ? <LoaderCircle className="size-5 animate-spin" /> : <Gauge className="size-5" />}
          Leer báscula
        </Button>

        {alVacio ? (
          <>
            <Button
              className="h-14 text-base"
              onClick={() => void etiquetar()}
              disabled={etiquetaDeshabilitada}
              title={seleccionada ? 'Reimprimir la etiqueta seleccionada' : (bloqueo ?? 'Etiquetar producto')}
            >
              {imprimiendo ? <LoaderCircle className="size-5 animate-spin" /> : <Barcode className="size-5" />}
              {seleccionada ? 'Reimprimir etiqueta' : 'Etiqueta pieza'}
            </Button>
            <Button
              variant="outline"
              className={cn('h-12 text-base', bloqueo && 'animate-pulse border-amber-500 bg-amber-50 text-amber-900')}
              onClick={() => canastilla && void cerrar(canastilla.taraPiezas ?? taraKg, canastilla.id)}
              disabled={imprimiendo || cerrarCanastilla.isPending || !canastilla}
              title={
                canastilla
                  ? `Cerrar ya la canastilla N.º ${canastilla.numero} (${canastilla.unds} und) e imprimir su etiqueta`
                  : 'No hay canastilla abierta'
              }
            >
              {cerrarCanastilla.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Package className="size-5" />}
              Cerrar canastilla
            </Button>
          </>
        ) : (
          <Button
            className="h-14 text-base"
            onClick={() => void etiquetarCaja()}
            disabled={imprimiendo || cerrarCanastilla.isPending || netoKg <= 0 || !!bloqueo}
            title="Registrar la caja e imprimir sus 2 etiquetas"
          >
            {cerrarCanastilla.isPending || imprimiendo ? <LoaderCircle className="size-5 animate-spin" /> : <Package className="size-5" />}
            Registrar caja
          </Button>
        )}

        <div className="mt-auto space-y-2">
          <button
            type="button"
            onClick={() => {
              if (ultimaEsCanastilla && ultimaCanastilla) void imprimirCanastilla(ultimaCanastilla, true);
              else if (ultima) void reimprimir(ultima);
            }}
            disabled={(!ultima && !ultimaEsCanastilla) || imprimiendo}
            title={ultima || ultimaEsCanastilla ? 'Tocá para reimprimir la última etiqueta' : undefined}
            className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Última etiqueta</span>
              <span className="block truncate text-sm tabular-nums">
                {ultimaEsCanastilla && ultimaCanastilla
                  ? `Canast. ${ultimaCanastilla.numero} · ${ultimaCanastilla.unds} und · ${kg(ultimaCanastilla.netoKg)} kg · ${horaDe(ultimaCanastilla.cerradaAt!)}`
                  : ultima
                    ? `#${formatPieza(ultima.pieza)} · ${kg(ultima.netoKg)} kg · ${horaDe(ultima.createdAt)}`
                    : '—'}
              </span>
            </span>
            {(ultima || ultimaEsCanastilla) && <Printer className="size-4 shrink-0 text-muted-foreground" />}
          </button>
          {(() => {
            const u = estado?.ultimaCanastilla;
            return (
              <button
                type="button"
                onClick={() => u && void imprimirCanastilla(u, true)}
                disabled={!u}
                title={u ? 'Tocá para reimprimir la etiqueta de la canastilla' : undefined}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Último empaque</span>
                  <span className="block truncate text-sm tabular-nums">
                    {u ? `Canast. ${u.numero} · T${u.tiendaCodigo} · ${u.unds} und · ${kg(u.netoKg)} kg` : '—'}
                  </span>
                </span>
                {u && <Printer className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            );
          })()}
        </div>
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
                      void etiquetarEn(t.tiendaId, t.codigo, true, !alVacio);
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
              La pieza <b>#{formatPieza(confirmarBorrado.pieza)}</b> ({kg(confirmarBorrado.netoKg)} kg) está en la{' '}
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
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  Beef,
  Check,
  Eraser,
  Gauge,
  Inbox,
  LoaderCircle,
  Lock,
  Package,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Scale,
  Sigma,
  Tag,
  Eye,
  TrendingDown,
  Divide,
  Keyboard,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { NumericKeypad } from '@/components/keyboard/NumericKeypad';
import { cn, plantToday as today, soloDecimal } from '@/lib/utils';
import { getSavedScaleBaud, getSavedScalePort, readScale } from '@/lib/device';
import { useAuth } from '@/features/auth/auth-context';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { downloadReciboPiePdf } from './recibo-print';
import {
  usePesoEnPieList,
  useCreatePesoEnPie,
  useRegistrarPromediado,
  useUpdatePesoEnPie,
  useDeletePesoEnPie,
  useBpPreview,
  formatBP,
  formatAnimal,
  formatAnimalCorto,
  useGuiasCerradas,
  useGuiaCerradaDetalle,
  useIniciarRepesaje,
  useFinalizarRepesaje,
  useRepesarAnimal,
  type AnimalRepesaje,
  type GuiaCerrada,
  type PesoEnPie,
  type SavePesoEnPieInput,
} from './api';
import {
  usePesoCamionPieAbiertas,
  useCloseGuiaPie,
  formatReferencia,
  type PesoCamionGuia,
} from '../peso-en-camion/api';

function num(s: string) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function kg(n: number | null | undefined) {
  return (n ?? 0).toLocaleString('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
function pct(n: number) {
  return `${n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
// Merma positiva = el animal perdió peso; negativa = ganó.
function MermaValor({
  kgValor,
  porcentaje,
  unidad = false,
}: {
  kgValor: number;
  porcentaje?: number;
  unidad?: boolean;
}) {
  return (
    <span
      className={cn(
        'tabular-nums',
        kgValor > 0 && 'font-semibold text-amber-700',
        kgValor < 0 && 'font-semibold text-sky-700',
      )}
    >
      {kg(kgValor)}
      {unidad && ' kg'}
      {porcentaje != null && ` (${pct(porcentaje)})`}
    </span>
  );
}
function mensajeError(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })
    .response?.data?.message;
  return Array.isArray(detail) ? detail.join(' ') : detail || fallback;
}
// El backend reemplaza todos los campos al actualizar: arma el registro
// completo del animal con solo los cambios indicados.
function inputDesdeReporte(
  r: PesoEnPie,
  cambios: Partial<SavePesoEnPieInput> = {},
): SavePesoEnPieInput {
  return {
    date: r.date,
    bcReference: r.bcReference ?? undefined,
    guia: r.guia ?? undefined,
    procedencia: r.procedencia ?? undefined,
    proveedor: r.proveedor ?? undefined,
    cliente: r.cliente ?? undefined,
    placa: r.placa ?? undefined,
    conductor: r.conductor ?? undefined,
    corral: r.corral ?? undefined,
    tipoAnimal: r.tipoAnimal ?? undefined,
    lote: r.lote ?? undefined,
    animalNo: r.animalNo ?? undefined,
    animalCount: r.animalCount,
    tipoPesaje: r.tipoPesaje,
    pesoTotalKg: r.pesoTotalKg ?? undefined,
    pesoPromedioKg: r.pesoPromedioKg ?? undefined,
    cantidad: r.cantidad ?? undefined,
    entrada: r.entrada ?? undefined,
    salida: r.salida ?? undefined,
    observaciones: r.observaciones ?? undefined,
    ...cambios,
  };
}

export function PesoEnPiePage() {
  const [fecha, setFecha] = useState(today());
  const [guia, setGuia] = useState('');
  const [procedencia, setProcedencia] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [cliente, setCliente] = useState('');
  const [placa, setPlaca] = useState('');
  const [conductor, setConductor] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [entrada, setEntrada] = useState('');
  const [salida, setSalida] = useState('');
  // Consecutivo BC de la guía seleccionada (trazabilidad BC↔BP).
  const [bcReference, setBcReference] = useState<number | null>(null);
  const [tipoAnimal, setTipoAnimal] = useState('');
  const [corral, setCorral] = useState('');
  const [peso, setPeso] = useState('');
  // Observación del animal que se está por guardar (se limpia tras cada registro).
  const [observaciones, setObservaciones] = useState('');
  // Nota general de la guía (no es por animal); se usa en el encabezado del recibo.
  const [notaGeneral, setNotaGeneral] = useState('');
  const [tab, setTab] = useState('guias');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isReadingScale, setIsReadingScale] = useState(false);

  // Los mensajes de error se quitan solos a los 3 segundos.
  useEffect(() => {
    if (!saveError) return;
    const t = window.setTimeout(() => setSaveError(null), 3000);
    return () => window.clearTimeout(t);
  }, [saveError]);

  const { user } = useAuth();
  const lista = usePesoEnPieList();
  const guiasCamion = usePesoCamionPieAbiertas();
  const cerrarGuiaPie = useCloseGuiaPie();
  const [guiaCamionId, setGuiaCamionId] = useState<string | null>(null);
  const [netoCamion, setNetoCamion] = useState<number | null>(null);
  const crear = useCreatePesoEnPie();
  const promediar = useRegistrarPromediado();
  const actualizar = useUpdatePesoEnPie();
  const borrarAnimalMut = useDeletePesoEnPie();
  // Animal resaltado en "Registro de animales" (para editar / borrar).
  const [animalSelId, setAnimalSelId] = useState<string | null>(null);
  const [editandoAnimal, setEditandoAnimal] = useState<PesoEnPie | null>(null);

  // Repesaje de una guía cerrada: id de la guía (Peso en Camión) en repesaje.
  const guiasCerradas = useGuiasCerradas();
  const [repesajeId, setRepesajeId] = useState<string | null>(null);
  const [confirmarRepesaje, setConfirmarRepesaje] = useState<GuiaCerrada | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const repesajeDetalle = useGuiaCerradaDetalle(repesajeId);
  const iniciarRepesaje = useIniciarRepesaje();
  const finalizarRepesaje = useFinalizarRepesaje();
  const repesar = useRepesarAnimal();
  const enRepesaje = repesajeId != null;
  const rep = repesajeDetalle.data;
  const animalRepesar = rep?.items.find((i) => i.id === rep.siguienteId) ?? null;

  function avisar(texto: string, ms = 3500) {
    setNotice(texto);
    window.setTimeout(() => setNotice(null), ms);
  }

  useEffect(() => {
    // En repesaje el peso siempre se lee de nuevo: no se precarga el promedio.
    if (repesajeId) return;
    try {
      const raw = window.localStorage.getItem('frigo:last-peso-camion');
      if (!raw || peso) return;

      const saved = JSON.parse(raw) as { neto?: number; cantidad?: number } | null;
      const total = Number(saved?.neto ?? 0);
      const cantidad = Number(saved?.cantidad ?? 0);
      if (!Number.isFinite(total) || !Number.isFinite(cantidad) || cantidad <= 0) return;

      setPeso((total / cantidad).toFixed(1));
    } catch {
      // Ignora almacenamiento no válido.
    }
  }, [peso, repesajeId]);

  // En repesaje, corral y tipo son los del animal que toca repesar.
  useEffect(() => {
    if (!animalRepesar) return;
    setCorral(animalRepesar.corral ?? '');
    setTipoAnimal(animalRepesar.tipoAnimal ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animalRepesar?.id]);

  const pesoNum = num(peso);
  const reportes = lista.data ?? [];
  const reportesGuia = reportes.filter(
    (reporte) => reporte.guia === guia && reporte.date === fecha,
  );
  const animalesRegistrados = reportesGuia.reduce(
    (total, reporte) => total + reporte.animalCount,
    0,
  );
  const animalesObjetivo = cantidad ? num(cantidad) : 0;
  const totalKg = reportesGuia.reduce(
    (total, reporte) => total + (reporte.pesoTotalKg ?? 0),
    0,
  );
  // BP de la guía en curso: el real si ya hay animales pesados, o el previsto
  // (se confirma recién al guardar el primer animal) apenas se selecciona la guía.
  const bpPreview = useBpPreview(bcReference);
  const bpActual = reportesGuia[0]?.bpReference ?? bpPreview.data?.bpReference ?? null;
  // Corral y tipo del último animal registrado en la guía: valores por defecto
  // al cargar la guía (editables). Tras cada registro se conserva lo escogido.
  const ultimoDeGuia = (campo: 'corral' | 'tipoAnimal') =>
    reportesGuia
      .slice()
      .sort((a, b) => b.reference - a.reference)
      .map((reporte) => reporte[campo]?.trim())
      .find((valor): valor is string => Boolean(valor)) ?? '';
  const corralGuia = ultimoDeGuia('corral');
  const tipoGuia = ultimoDeGuia('tipoAnimal');
  // Se limpia sola si el animal deja de estar en la guía cargada.
  const animalSel = enRepesaje
    ? null
    : (reportesGuia.find((r) => r.id === animalSelId) ?? null);
  const animalSelEditable = animalSel?.status === 'pendiente';

  useEffect(() => {
    if (corralGuia && !corral) setCorral(corralGuia);
  }, [corralGuia, corral]);

  useEffect(() => {
    if (tipoGuia && !tipoAnimal) setTipoAnimal(tipoGuia);
  }, [tipoGuia, tipoAnimal]);

  const tabs: TabItem[] = [
    { value: 'guias', label: `Guías abiertas (${guiasCamion.data?.length ?? 0})` },
    { value: 'cerradas', label: `Guías cerradas (${guiasCerradas.data?.length ?? 0})` },
    { value: 'registro', label: enRepesaje ? 'Repesaje de animales' : 'Registro de animales' },
    { value: 'observaciones', label: 'Nota general de la guía' },
  ];

  const guiaSeleccionada = guia.trim().length > 0 && animalesObjetivo > 0;
  const guiaCompleta = guiaSeleccionada && animalesRegistrados >= animalesObjetivo;
  // Consecutivo del próximo animal dentro de la guía (A01, A02…): visible
  // antes de pesar para que el operario marque el animal antes de la báscula.
  // En repesaje es el siguiente animal en el orden original.
  const proximoAnimal = enRepesaje
    ? animalRepesar
      ? formatAnimalCorto(animalRepesar.reference)
      : null
    : guiaSeleccionada && !guiaCompleta && bpPreview.data
      ? formatAnimalCorto(bpPreview.data.nextAnimal)
      : null;
  const camposFaltantes = [
    !guiaSeleccionada && 'Guía de movilización',
    !corral.trim() && 'Corral',
    !tipoAnimal.trim() && 'Tipo de animal',
    pesoNum <= 0 && 'Peso',
  ].filter((campo): campo is string => Boolean(campo));
  function limpiar() {
    setGuia('');
    setProcedencia('');
    setProveedor('');
    setCliente('');
    setPlaca('');
    setConductor('');
    setCantidad('');
    setEntrada('');
    setSalida('');
    setBcReference(null);
    setGuiaCamionId(null);
    setNetoCamion(null);
    setTipoAnimal('');
    setCorral('');
    setPeso('');
    setObservaciones('');
    setNotaGeneral('');
    setSaveError(null);
    setIsReadingScale(false);
    setRepesajeId(null);
    setAnimalSelId(null);
  }

  // Tras guardar un animal se conservan corral y tipo para el siguiente
  // (normalmente iguales): solo se limpian peso y observación.
  function limpiarCaptura() {
    setPeso('');
    setObservaciones('');
    setSaveError(null);
    setIsReadingScale(false);
  }

  function seleccionarGuia(guiaCamion: PesoCamionGuia) {
    setRepesajeId(null);
    setFecha(guiaCamion.date);
    setGuia(guiaCamion.guia ?? '');
    setProcedencia(guiaCamion.procedencia ?? '');
    setProveedor(guiaCamion.proveedor ?? '');
    setCliente(guiaCamion.cliente ?? '');
    setPlaca(guiaCamion.placa ?? '');
    setConductor(guiaCamion.conductor ?? '');
    setCantidad(guiaCamion.cantidad == null ? '' : String(guiaCamion.cantidad));
    setEntrada(guiaCamion.entrada == null ? '' : String(guiaCamion.entrada));
    setSalida(guiaCamion.salida == null ? '' : String(guiaCamion.salida));
    setBcReference(guiaCamion.reference);
    setGuiaCamionId(guiaCamion.id);
    setNetoCamion(guiaCamion.neto);
    setCorral('');
    setTipoAnimal('');
    setTab('registro');
    setNotice(`Guía ${guiaCamion.guia ?? guiaCamion.reference} cargada para asignar animales.`);
    window.setTimeout(() => setNotice(null), 3000);
  }

  // Carga la guía cerrada en la zona de captura para repesar sus animales.
  function entrarRepesaje(g: GuiaCerrada) {
    limpiar();
    setFecha(g.date);
    setGuia(g.guia ?? '');
    setProcedencia(g.procedencia ?? '');
    setProveedor(g.proveedor ?? '');
    setCliente(g.cliente ?? '');
    setPlaca(g.placa ?? '');
    setConductor(g.conductor ?? '');
    setCantidad(String(g.cantidad ?? g.animales));
    setEntrada(g.entrada == null ? '' : String(g.entrada));
    setSalida(g.salida == null ? '' : String(g.salida));
    setRepesajeId(g.id);
    setTab('registro');
  }

  function pedirRepesaje(g: GuiaCerrada) {
    setSaveError(null);
    if (g.repesajeAbierto) {
      entrarRepesaje(g);
      avisar(`Continuando el repesaje de la guía ${g.guia}.`);
      return;
    }
    setConfirmarRepesaje(g);
  }

  async function aceptarRepesaje() {
    const g = confirmarRepesaje;
    if (!g) return;
    try {
      const detalle = await iniciarRepesaje.mutateAsync(g.id);
      setConfirmarRepesaje(null);
      entrarRepesaje(detalle);
      const primero = detalle.items[0];
      avisar(
        `Repesaje iniciado (ronda ${detalle.repesajeRonda}). Repesa en el mismo orden${primero ? `, empezando por ${formatAnimalCorto(primero.reference)}` : ''}.`,
      );
    } catch (error) {
      setConfirmarRepesaje(null);
      setSaveError(mensajeError(error, 'No se pudo iniciar el repesaje.'));
    }
  }

  async function terminarRepesaje() {
    if (!repesajeId || !rep) return;
    const pendientes = rep.animales - rep.repesadosRonda;
    const pregunta =
      rep.repesadosRonda === 0
        ? '¿Cancelar el repesaje? Aún no se ha repesado ningún animal.'
        : `¿Terminar el repesaje? ${pendientes} ${pendientes === 1 ? 'animal sin repesar conservará' : 'animales sin repesar conservarán'} su peso anterior.`;
    if (!window.confirm(pregunta)) return;
    try {
      const res = await finalizarRepesaje.mutateAsync(repesajeId);
      limpiar();
      setTab('cerradas');
      avisar(
        res.cancelado
          ? `Repesaje de la guía ${res.guia} cancelado.`
          : `Repesaje terminado. Merma de la guía: ${kg(res.mermaKg)} kg (${pct(res.mermaPct)}).`,
      );
    } catch (error) {
      setSaveError(mensajeError(error, 'No se pudo terminar el repesaje.'));
    }
  }

  function salirRepesaje() {
    limpiar();
    setTab('cerradas');
    avisar('El repesaje sigue abierto: puedes continuarlo desde Guías cerradas.');
  }

  async function leerBascula() {
    setSaveError(null);
    setIsReadingScale(true);

    try {
      // Puerto COM y baudios de Configuración → Parámetros estación (o autodetección).
      const result = await readScale({
        timeoutMs: 4000,
        port: getSavedScalePort() ?? undefined,
        baudRate: getSavedScaleBaud() ?? undefined,
      });
      if (result.ok && result.value !== null) {
        setPeso(result.value.toFixed(2));
        return;
      }
      throw new Error(result.error ?? 'scale_not_found');
    } catch (e) {
      setSaveError(
        (e as Error)?.message === 'scale_not_found'
          ? 'No se detectó la báscula. Revisa la conexión y el puerto COM.'
          : 'No se pudo leer la báscula. Revisa la conexión y el puerto COM.',
      );
    } finally {
      setIsReadingScale(false);
    }
  }

  // Evita guardar dos veces el mismo animal si se pulsa Enter (o el botón)
  // repetidamente mientras la primera petición está en curso.
  const guardando = useRef(false);

  async function guardarRepesaje() {
    if (!rep || !animalRepesar) {
      setSaveError('No hay animales pendientes por repesar en esta guía.');
      return;
    }
    if (pesoNum <= 0) {
      setSaveError(`Falta el peso del animal ${formatAnimalCorto(animalRepesar.reference)}.`);
      return;
    }
    setSaveError(null);
    guardando.current = true;
    try {
      const { repesado: r, guia: g } = await repesar.mutateAsync({
        id: animalRepesar.id,
        pesoKg: pesoNum,
      });
      setPeso('');
      if (r.finalizado) {
        limpiar();
        setTab('cerradas');
        avisar(
          `Repesaje terminado: ${g.animales} animales. Merma de la guía: ${kg(g.mermaKg)} kg (${pct(g.mermaPct)}).`,
          5000,
        );
      } else {
        avisar(
          `Animal ${formatAnimalCorto(r.reference)} repesado: ${kg(r.pesoNuevoKg)} kg (antes ${kg(r.pesoAnteriorKg)} kg, merma ${kg(r.mermaKg)} kg).`,
        );
      }
    } catch (error) {
      setSaveError(mensajeError(error, 'No se pudo guardar el repesaje.'));
    } finally {
      guardando.current = false;
    }
  }

  async function guardar() {
    if (guardando.current) return;
    if (enRepesaje) {
      await guardarRepesaje();
      return;
    }
    if (camposFaltantes.length > 0) {
      setSaveError(`Faltan campos obligatorios: ${camposFaltantes.join(', ')}.`);
      return;
    }
    if (guiaCompleta) {
      setSaveError(`Esta guía ya tiene registrados sus ${animalesObjetivo} animales.`);
      return;
    }
    if (netoCamion != null && totalKg + pesoNum > netoCamion + 1e-6) {
      setSaveError(
        `El total en pie (${kg(totalKg + pesoNum)} kg) superaría el neto de báscula camión (${kg(netoCamion)} kg). Disponible: ${kg(Math.max(netoCamion - totalKg, 0))} kg.`,
      );
      return;
    }
    setSaveError(null);
    guardando.current = true;
    try {
      const created = await crear.mutateAsync({
        date: fecha,
        bcReference: bcReference ?? undefined,
        guia: guia.trim() || undefined,
        procedencia: procedencia.trim() || undefined,
        proveedor: proveedor.trim() || undefined,
        cliente: cliente.trim() || undefined,
        placa: placa.trim() || undefined,
        conductor: conductor.trim() || undefined,
        cantidad: cantidad ? Number(cantidad) : undefined,
        entrada: entrada ? Number(entrada) : undefined,
        salida: salida ? Number(salida) : undefined,
        corral: corral.trim() || undefined,
        tipoAnimal: tipoAnimal.trim() || undefined,
        animalCount: 1,
        tipoPesaje: 'individual',
        pesoTotalKg: pesoNum,
        observaciones: observaciones.trim() || undefined,
      });
      limpiarCaptura();
      const siguiente = animalesRegistrados + 1;
      setNotice(
        `Animal A${String(created.reference).padStart(2, '0')} (${formatBP(created.bpReference)}) guardado. ${siguiente} de ${animalesObjetivo} animales de la guía.`,
      );
      window.setTimeout(() => setNotice(null), 3500);
    } catch (error) {
      const response = (
        error as {
          response?: { data?: { message?: string | string[] } };
        }
      ).response;
      const detail = response?.data?.message;
      setSaveError(
        Array.isArray(detail)
          ? detail.join(' ')
          : detail || 'No se pudo guardar el reporte.',
      );
    } finally {
      guardando.current = false;
    }
  }

  // Enter = Guardar, esté donde esté el foco (también si quedó en el enlace
  // del menú lateral o en el botón de leer báscula: se anula su acción para
  // que Enter solo guarde). Se ignora en la zona de pestañas (guías, tabla
  // de animales, nota general), donde Enter tiene su propio uso.
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('textarea, [role="dialog"], [data-enter-guardar="off"]')) return;
      // Con un modal abierto (p. ej. confirmar repesaje) Enter no guarda.
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      void guardarRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Pesaje promediado: neto de báscula camión (menos lo ya pesado) dividido
  // entre los animales pendientes; registra todos de una vez.
  async function pesarPromediado() {
    if (!guiaCamionId || !guiaSeleccionada) {
      setSaveError('Selecciona una guía abierta para el pesaje promediado.');
      return;
    }
    if (guiaCompleta) {
      setSaveError(`Esta guía ya tiene registrados sus ${animalesObjetivo} animales.`);
      return;
    }
    if (netoCamion == null || netoCamion <= 0) {
      setSaveError('La guía no tiene peso neto de báscula camión.');
      return;
    }
    const faltan = [!corral.trim() && 'Corral', !tipoAnimal.trim() && 'Tipo de animal'].filter(Boolean);
    if (faltan.length) {
      setSaveError(`Para el pesaje promediado selecciona: ${faltan.join(', ')}.`);
      return;
    }
    const pendientes = animalesObjetivo - animalesRegistrados;
    const disponible = netoCamion - totalKg;
    const pesoKg = Math.floor((disponible / pendientes) * 100) / 100;
    if (pesoKg <= 0) {
      setSaveError('No queda peso disponible del neto de báscula camión para los animales pendientes.');
      return;
    }
    const kg2 = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const confirmado = window.confirm(
      `Pesaje promediado de la guía ${guia}:\n\n` +
        `${pendientes} animales × ${kg2(pesoKg)} kg cada uno\n` +
        `(${animalesRegistrados ? 'neto pendiente' : 'neto báscula camión'} ${kg2(disponible)} kg ÷ ${pendientes} animales)\n` +
        `Corral ${corral} · ${tipoAnimal}\n\n¿Registrar todos los animales?`,
    );
    if (!confirmado) return;
    setSaveError(null);
    try {
      const r = await promediar.mutateAsync({ pesoCamionId: guiaCamionId, corral, tipoAnimal });
      setPeso('');
      avisar(
        `Pesaje promediado: ${r.creados} animales (${formatAnimalCorto(r.desde)} a ${formatAnimalCorto(r.hasta)}) con ${kg2(r.pesoKg)} kg cada uno.`,
        5000,
      );
    } catch (error) {
      setSaveError(mensajeError(error, 'No se pudo registrar el pesaje promediado.'));
    }
  }

  function imprimir() {
    const entradaNum = num(entrada);
    const salidaNum = num(salida);
    const netoNum = entradaNum - salidaNum;
    const cantNum = num(cantidad);
    const promNum = cantNum > 0 ? netoNum / cantNum : 0;
    const referencia = reportesGuia.length
      ? String(Math.min(...reportesGuia.map((r) => r.reference)))
      : '';
    void downloadReciboPiePdf({
      guia,
      fecha,
      proveedor,
      procedencia,
      ciudad: '',
      cliente,
      referencia,
      placa,
      conductor,
      entrada: kg(entradaNum),
      salida: kg(salidaNum),
      neto: kg(netoNum),
      cantidad: cantidad || '0',
      prom: kg(promNum),
      observaciones: notaGeneral,
      animales: reportesGuia
        .slice()
        .sort((a, b) => a.reference - b.reference)
        .map((r) => ({
          registro: formatAnimal(r.bpReference, r.reference),
          animal: r.animalNo ?? String(r.reference),
          tipo: r.tipoAnimal ?? '',
          cantidad: r.pesoTotalKg ?? 0,
          corral: r.corral ? `Corral ${r.corral}` : '',
          observaciones: r.observaciones ?? '',
        })),
      operario: user?.fullName ?? '',
      impreso: new Date().toLocaleString('es-CO'),
      logoUrl: new URL(logoSantaCruz, window.location.href).href,
    });
  }

  // Papelera: borra el animal seleccionado (registrado por error).
  async function borrarAnimal() {
    if (!animalSel) return;
    const nombre = formatAnimal(animalSel.bpReference, animalSel.reference);
    if (
      !window.confirm(
        `¿Seguro que querés borrar el animal ${nombre} (${kg(animalSel.pesoTotalKg)} kg)? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setSaveError(null);
    try {
      await borrarAnimalMut.mutateAsync(animalSel.id);
      setAnimalSelId(null);
      avisar(`Animal ${nombre} borrado.`);
    } catch (err) {
      setSaveError(mensajeError(err, 'No se pudo borrar el animal.'));
    }
  }

  async function guardarEdicionAnimal(
    r: PesoEnPie,
    cambios: { tipoAnimal: string; corral: string; pesoTotalKg: number; observaciones: string },
  ) {
    const count = r.animalCount > 0 ? r.animalCount : 1;
    await actualizar.mutateAsync({
      id: r.id,
      input: inputDesdeReporte(r, {
        ...cambios,
        pesoPromedioKg: Number((cambios.pesoTotalKg / count).toFixed(2)),
      }),
    });
    setEditandoAnimal(null);
    avisar(`Animal ${formatAnimal(r.bpReference, r.reference)} actualizado.`);
  }

  async function cerrarGuia() {
    if (!guiaCamionId) return;
    if (!window.confirm(`¿Cerrar la guía ${guia} en Peso en Pie? Sus animales pasan a beneficio.`)) return;
    setSaveError(null);
    try {
      await cerrarGuiaPie.mutateAsync(guiaCamionId);
      const cerrada = guia;
      limpiar();
      setTab('guias');
      setNotice(`Guía ${cerrada} cerrada en Peso en Pie.`);
      window.setTimeout(() => setNotice(null), 3000);
    } catch (error) {
      const detail = (
        error as { response?: { data?: { message?: string | string[] } } }
      ).response?.data?.message;
      setSaveError(
        Array.isArray(detail) ? detail.join(' ') : detail || 'No se pudo cerrar la guía.',
      );
    }
  }

  function imprimirPrecinto() {
    if (!guiaSeleccionada) {
      setSaveError('Selecciona una guía abierta para imprimir precintos.');
      return;
    }
    setSaveError(null);
    setNotice('Enviando precinto a la impresora de etiquetas…');
    window.setTimeout(() => setNotice(null), 3000);
  }

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PesoEnPieIcon className="size-8" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Peso En Pie</h1>
            <p className="text-xs text-muted-foreground">
              Registro individual de animales y peso en pie.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-7"
            title="Limpiar formulario"
            onClick={limpiar}
            disabled={crear.isPending}
          >
            <Eraser className="size-4" />
          </Button>
          <span className="mx-1 h-10 w-px bg-border" />
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-7"
            title="Pesaje promediado: neto de báscula camión ÷ animales, para todos los animales de la guía"
            onClick={pesarPromediado}
            disabled={
              enRepesaje || !guiaCamionId || guiaCompleta || netoCamion == null || promediar.isPending
            }
          >
            {promediar.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Divide className="size-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-7"
            title={
              animalSel && !animalSelEditable
                ? 'La guía de este animal ya está cerrada en Peso en Pie'
                : 'Editar animal seleccionado'
            }
            onClick={() => animalSel && setEditandoAnimal(animalSel)}
            disabled={!animalSelEditable}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-7 text-red-600 hover:bg-red-50 hover:text-red-700"
            title={
              animalSel && !animalSelEditable
                ? 'La guía de este animal ya está cerrada en Peso en Pie'
                : 'Borrar animal seleccionado'
            }
            onClick={borrarAnimal}
            disabled={!animalSelEditable || borrarAnimalMut.isPending}
          >
            {borrarAnimalMut.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-7"
            title="Imprimir registro"
            onClick={imprimir}
            disabled={animalesRegistrados < 1}
          >
            <Printer className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-7"
            title="Cerrar guía en Peso en Pie (el camión sigue con su propio estado)"
            onClick={cerrarGuia}
            disabled={!guiaCamionId || cerrarGuiaPie.isPending}
          >
            <Lock className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-7"
            title="Actualizar"
            onClick={() => {
              lista.refetch();
              guiasCamion.refetch();
            }}
            disabled={lista.isFetching || guiasCamion.isFetching}
          >
            <RefreshCw
              className={cn(
                'size-4',
                (lista.isFetching || guiasCamion.isFetching) && 'animate-spin',
              )}
            />
          </Button>
        </div>
      </div>

      {notice && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
          <div className="pointer-events-auto rounded-md bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 shadow-lg ring-1 ring-emerald-200">
            {notice}
          </div>
        </div>
      )}
      {saveError && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
          <div className="pointer-events-auto rounded-md bg-destructive/10 px-4 py-1.5 text-sm font-medium text-destructive shadow-lg ring-1 ring-destructive/20">
            {saveError}
          </div>
        </div>
      )}

      <Card className="shrink-0 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_1fr_150px]">
          <div className="space-y-0.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              className="h-8 [&::-webkit-calendar-picker-indicator]:hidden"
              value={fecha}
              min={fecha}
              max={fecha}
              onKeyDown={(e) => e.preventDefault()}
              onChange={() => {}}
            />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="guia">Guía de movilización</Label>
            <Input
              id="guia"
              value={guia}
              readOnly
              className="h-8 bg-muted/40"
              placeholder="Seleccione una guía abierta…"
            />
          </div>
          <div className="space-y-0.5">
            <Label>Consecutivo BP</Label>
            <div className="flex h-8 items-center justify-center rounded-md border border-border bg-muted/40 px-2 text-sm font-bold tabular-nums">
              {bpActual != null ? formatBP(bpActual) : '—'}
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-0.5">
            <Label htmlFor="procedencia">Procedencia</Label>
            <Input id="procedencia" value={procedencia} readOnly className="h-8 bg-muted/40" />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="proveedor">Proveedor</Label>
            <Input id="proveedor" value={proveedor} readOnly className="h-8 bg-muted/40" />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="cliente">Cliente</Label>
            <Input id="cliente" value={cliente} readOnly className="h-8 bg-muted/40" />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-6">
          <div className="space-y-0.5 sm:col-span-1">
            <Label htmlFor="placa">Placa</Label>
            <Input id="placa" value={placa} readOnly className="h-8 bg-muted/40" />
          </div>
          <div className="space-y-0.5 sm:col-span-2">
            <Label htmlFor="conductor">Conductor</Label>
            <Input id="conductor" value={conductor} readOnly className="h-8 bg-muted/40" />
          </div>
          <div className="space-y-0.5 sm:col-span-2">
            <Label htmlFor="corral">Ubicación (Corral)</Label>
            <Select id="corral" value={corral} onChange={(e) => setCorral(e.target.value)} className="h-8" disabled={enRepesaje}>
              <option value="">Seleccione...</option>
              {Array.from({ length: 26 }, (_, i) => <option key={i} value={String(i + 1)}>Corral {i + 1}</option>)}
            </Select>
          </div>
          <div className="space-y-0.5 sm:col-span-1">
            <Label htmlFor="tipo-animal">Tipo de Animal</Label>
            <Select id="tipo-animal" value={tipoAnimal} onChange={(e) => setTipoAnimal(e.target.value)} className="h-8" disabled={enRepesaje}>
              <option value="">Seleccione...</option>
              <option value="MACHO">MACHO</option>
              <option value="HEMBRA">HEMBRA</option>
              <option value="BUFALO">BUFALO</option>
              <option value="BUFALA">BUFALA</option>
            </Select>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2">
          <div className="space-y-0.5">
            <Label htmlFor="observacion-animal">Observación de este animal (opcional)</Label>
            <Input
              id="observacion-animal"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder={enRepesaje ? 'No aplica en el repesaje' : 'Ej: cojera, marca visible, etc.'}
              className="h-8"
              disabled={enRepesaje}
            />
          </div>
        </div>
      </Card>

      <div className="grid h-16 shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <Card className="flex h-16 flex-col justify-center p-2">
          <div className="flex items-center justify-around gap-3">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Package className="size-3.5" />
                Cant.
              </div>
              <p className="text-2xl font-semibold tabular-nums">
                {animalesObjetivo ? String(animalesObjetivo) : '0'}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Beef className="size-3.5" />
                {enRepesaje ? 'Repesados' : 'Registrados'}
              </div>
              <p className="text-2xl font-semibold tabular-nums">
                {enRepesaje ? (rep?.repesadosRonda ?? 0) : animalesRegistrados}
              </p>
            </div>
          </div>
        </Card>
        <Card className="flex h-16 flex-col justify-center p-2">
          <div className="flex items-center justify-around gap-3">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Scale className="size-3.5" />
                {enRepesaje ? 'Inicial (kg)' : 'Total (kg)'}
              </div>
              <p className="text-2xl font-semibold tabular-nums text-emerald-600">
                {kg(enRepesaje ? rep?.pesoInicialKg : totalKg)}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {enRepesaje ? <TrendingDown className="size-3.5" /> : <Sigma className="size-3.5" />}
                {enRepesaje ? 'Merma (kg)' : 'Prom. (kg)'}
              </div>
              <p className="text-2xl font-semibold tabular-nums">
                {enRepesaje
                  ? <MermaValor kgValor={rep?.mermaKg ?? 0} />
                  : kg(animalesRegistrados > 0 ? totalKg / animalesRegistrados : 0)}
              </p>
            </div>
          </div>
        </Card>
        <div className="col-span-2 flex h-16 items-stretch gap-2">
          <div
            className={cn(
              'relative flex h-16 w-28 shrink-0 items-center justify-center rounded-sm border-2 px-2',
              proximoAnimal
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-border bg-card',
            )}
            title="Consecutivo que se asignará al guardar este animal"
          >
            <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
              Animal:
            </span>
            <span
              className={cn(
                'text-3xl font-bold tabular-nums',
                proximoAnimal ? 'text-emerald-700' : 'text-muted-foreground/40',
              )}
            >
              {proximoAnimal ?? '—'}
            </span>
          </div>
          <div
            className="relative flex h-16 flex-1 items-center rounded-sm border-2 border-border bg-card px-3"
          >
            <span className="absolute -top-3 left-3 flex items-center gap-1.5 bg-background px-1.5 text-sm font-medium">
              Peso(kg):
              {isReadingScale && <LoaderCircle className="size-3.5 animate-spin" />}
            </span>
            <input
              inputMode="decimal"
              placeholder="0.0"
              value={peso}
              onChange={(e) => setPeso(soloDecimal(e.target.value))}
              className="h-full w-full bg-transparent text-center text-3xl font-bold text-emerald-700 outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            type="button"
            onClick={leerBascula}
            disabled={isReadingScale}
            title="Leer báscula"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border-2 border-border bg-card hover:bg-muted disabled:opacity-50"
          >
            {isReadingScale ? (
              <LoaderCircle className="size-6 animate-spin" />
            ) : (
              <Gauge className="size-6" />
            )}
          </button>
          <Button
            size="lg"
            className="h-16 shrink-0 px-5"
            title="Guardar registro (Enter)"
            onClick={guardar}
            disabled={enRepesaje ? repesar.isPending || !animalRepesar : crear.isPending || guiaCompleta}
          >
            {crear.isPending || repesar.isPending ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Check className="size-5" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {enRepesaje ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-1.5 text-sm font-medium text-sky-800">
          <span className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            {repesajeDetalle.isLoading || !rep
              ? 'Cargando repesaje…'
              : `Repesaje (ronda ${rep.repesajeRonda}) de la guía ${rep.guia}: ${rep.repesadosRonda} de ${rep.animales} animales repesados. Se repesan en el mismo orden en que se pesaron.`}
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7" onClick={salirRepesaje}>
              Salir
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={terminarRepesaje}
              disabled={!rep || finalizarRepesaje.isPending}
            >
              {rep && rep.repesadosRonda === 0 ? 'Cancelar repesaje' : 'Terminar repesaje'}
            </Button>
          </span>
        </div>
      ) : (
        <>
          {guiaCompleta && (
            <div className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
              Esta guía ya tiene registrados sus {animalesObjetivo} animales.
            </div>
          )}
          {!guiaSeleccionada && (
            <div className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
              Selecciona una guía abierta para comenzar a pesar sus animales.
            </div>
          )}
        </>
      )}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden" data-enter-guardar="off">
        <div className="shrink-0 px-4 pt-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>
        {tab === 'observaciones' ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Esta nota aparece en el encabezado del recibo impreso y aplica a toda la guía, no a un animal en particular. Para observaciones de un animal específico, usa el campo "Observación de este animal" al capturarlo, o edítala directamente en la tabla de Registro de animales.
            </p>
            <Input
              aria-label="Nota general de la guía"
              value={notaGeneral}
              onChange={(e) => setNotaGeneral(e.target.value)}
              placeholder="Nota general de la guía (opcional)"
              className="h-32 items-start py-3"
            />
          </div>
        ) : tab === 'guias' ? (
          <GuiasCamionList guias={guiasCamion.data ?? []} loading={guiasCamion.isLoading} onSelect={seleccionarGuia} />
        ) : tab === 'cerradas' ? (
          <GuiasCerradasList
            guias={guiasCerradas.data ?? []}
            loading={guiasCerradas.isLoading}
            activaId={repesajeId}
            iniciando={iniciarRepesaje.isPending}
            onRepesar={pedirRepesaje}
            onVerDetalle={(g) => setDetalleId(g.id)}
          />
        ) : null}
        {tab === 'registro' && enRepesaje ? (
          !rep ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="scrollbar-app flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">
                Inicial: {kg(rep.pesoInicialKg)} kg · Actual: {kg(rep.pesoActualKg)} kg · Merma:{' '}
                <MermaValor kgValor={rep.mermaKg} porcentaje={rep.mermaPct} unidad />
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <AnimalesRepesajeTable items={rep.items} siguienteId={rep.siguienteId} modoRepesaje />
              </div>
            </div>
          )
        ) : tab === 'registro' && lista.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : tab === 'registro' && !reportesGuia.length ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <Inbox className="size-8" /> Aún no hay animales registrados para esta guía.
          </div>
        ) : tab === 'registro' ? (
          <div className="scrollbar-app flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">
              Total: {animalesRegistrados} {animalesRegistrados === 1 ? 'animal' : 'animales'} ({kg(totalKg)} kg)
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-28 whitespace-nowrap">N.º Registro</TH>
                  <TH className="whitespace-nowrap">Animal</TH>
                  <TH className="whitespace-nowrap">Tipo</TH>
                  <TH className="whitespace-nowrap">Corral</TH>
                  <TH className="whitespace-nowrap">Fecha</TH>
                  <TH className="whitespace-nowrap text-right">Peso (kg)</TH>
                  <TH className="whitespace-nowrap">Observación del animal</TH>
                </TR>
              </THead>
              <TBody>
                {reportesGuia.map((r, i) => (
                  <AnimalRow
                    key={r.id}
                    index={i}
                    reporte={r}
                    selected={r.id === animalSelId}
                    onSelect={() =>
                      setAnimalSelId((actual) => (actual === r.id ? null : r.id))
                    }
                    onSave={(observaciones) =>
                      actualizar.mutate(
                        { id: r.id, input: inputDesdeReporte(r, { observaciones }) },
                        {
                          onSuccess: () => {
                            setNotice('Observación actualizada.');
                            window.setTimeout(() => setNotice(null), 3000);
                          },
                          onError: () => {
                            setSaveError('No se pudo guardar la observación.');
                            window.setTimeout(() => setSaveError(null), 3000);
                          },
                        },
                      )
                    }
                    saving={actualizar.isPending}
                  />
                ))}
              </TBody>
            </Table>
            </div>
          </div>
        ) : null}
      </Card>

      <EditarAnimalDialog
        reporte={editandoAnimal}
        onClose={() => setEditandoAnimal(null)}
        onSave={guardarEdicionAnimal}
        saving={actualizar.isPending}
      />

      <Dialog
        open={confirmarRepesaje != null}
        onClose={() => !iniciarRepesaje.isPending && setConfirmarRepesaje(null)}
        title="Repesaje de guía"
        className="max-w-lg"
      >
        {confirmarRepesaje && (
          <div className="space-y-4 p-6 pt-4">
            <p className="text-base">
              ¿Está seguro que quiere realizar un repesaje de la guía{' '}
              <span className="font-semibold">{confirmarRepesaje.guia}</span> (
              {confirmarRepesaje.animales} animales)?
            </p>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              La información de cada animal repesado es la que se tomará en cuenta para el beneficio.
              Los animales se repesan en el mismo orden en que fueron guardados, y el pesaje anterior,
              el nuevo y la merma quedan guardados.
            </p>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => setConfirmarRepesaje(null)}
                disabled={iniciarRepesaje.isPending}
              >
                Cancelar
              </Button>
              <Button autoFocus onClick={aceptarRepesaje} disabled={iniciarRepesaje.isPending}>
                {iniciarRepesaje.isPending && <LoaderCircle className="animate-spin" />}
                Aceptar
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <DetalleGuiaCerradaDialog id={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  );
}

function DetalleGuiaCerradaDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detalle = useGuiaCerradaDetalle(id);
  const d = detalle.data;
  return (
    <Dialog
      open={id != null}
      onClose={onClose}
      title={d ? `Guía ${d.guia} — ${d.bpReference != null ? formatBP(d.bpReference) : ''}` : 'Guía cerrada'}
      description={d ? `${d.cliente ?? '—'} · ${d.date} · ${d.animales} animales` : undefined}
      className="max-w-5xl"
      scrollInterno
    >
      {!d ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Cargando…
        </div>
      ) : (
        <div className="min-h-0 space-y-3 overflow-auto p-6 pt-4">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <ResumenDato label="Pesaje inicial" valor={`${kg(d.pesoInicialKg)} kg`} />
            <ResumenDato label="Pesaje actualizado" valor={`${kg(d.pesoActualKg)} kg`} />
            <ResumenDato
              label="Merma"
              valor={<MermaValor kgValor={d.mermaKg} porcentaje={d.mermaPct} unidad />}
            />
            <ResumenDato
              label="Repesajes"
              valor={d.repesajeAbierto ? `Ronda ${d.repesajeRonda} en curso` : String(d.repesajeRonda)}
            />
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <AnimalesRepesajeTable items={d.items} siguienteId={d.siguienteId} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ResumenDato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

function AnimalesRepesajeTable({
  items,
  siguienteId,
  modoRepesaje = false,
}: {
  items: AnimalRepesaje[];
  siguienteId: string | null;
  modoRepesaje?: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH className="whitespace-nowrap">N.º Registro</TH>
          <TH className="whitespace-nowrap">Tipo</TH>
          <TH className="whitespace-nowrap">Corral</TH>
          <TH className="whitespace-nowrap text-right">Pesaje inicial (kg)</TH>
          <TH className="whitespace-nowrap text-right">Pesaje actual (kg)</TH>
          <TH className="whitespace-nowrap text-right">Merma (kg)</TH>
          <TH className="whitespace-nowrap">{modoRepesaje ? 'Estado' : 'Historial de repesajes'}</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((a) => {
          const esSiguiente = a.id === siguienteId;
          return (
            <TR key={a.id} className={cn(modoRepesaje && esSiguiente && 'bg-emerald-50')}>
              <TD className="whitespace-nowrap font-medium tabular-nums">
                {formatAnimal(a.bpReference, a.reference)}
              </TD>
              <TD className="whitespace-nowrap">{a.tipoAnimal ?? '—'}</TD>
              <TD className="whitespace-nowrap">{a.corral ? `Corral ${a.corral}` : '—'}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{kg(a.pesoInicialKg)}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{kg(a.pesoActualKg)}</TD>
              <TD className="whitespace-nowrap text-right">
                <MermaValor kgValor={a.mermaKg} porcentaje={a.mermaPct} />
              </TD>
              <TD className="min-w-56 text-sm">
                {modoRepesaje ? (
                  a.repesadoEnRonda ? (
                    <Badge tone="success">Repesado</Badge>
                  ) : esSiguiente ? (
                    <Badge tone="info">Siguiente</Badge>
                  ) : (
                    <Badge>Pendiente</Badge>
                  )
                ) : a.historial.length ? (
                  <div className="space-y-0.5 text-muted-foreground">
                    {a.historial.map((h) => (
                      <div key={h.ronda} className="tabular-nums">
                        Ronda {h.ronda}: {kg(h.pesoAnteriorKg)} → {kg(h.pesoNuevoKg)} kg · merma{' '}
                        <MermaValor kgValor={h.mermaKg} unidad />
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Sin repesajes</span>
                )}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function GuiasCerradasList({
  guias,
  loading,
  activaId,
  iniciando,
  onRepesar,
  onVerDetalle,
}: {
  guias: GuiaCerrada[];
  loading: boolean;
  activaId: string | null;
  iniciando: boolean;
  onRepesar: (g: GuiaCerrada) => void;
  onVerDetalle: (g: GuiaCerrada) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Cargando guías cerradas…
      </div>
    );
  }
  if (!guias.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <Inbox className="size-8" />
        <p className="text-sm font-medium">No hay guías cerradas</p>
        <p className="text-sm">Las guías aparecen aquí al cerrarlas en Peso en Pie.</p>
      </div>
    );
  }
  return (
    <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
      <Table>
        <THead>
          <TR>
            <TH className="whitespace-nowrap">BP / Fecha</TH>
            <TH className="whitespace-nowrap">Guía / Cliente</TH>
            <TH className="whitespace-nowrap text-right">Animales</TH>
            <TH className="whitespace-nowrap text-right">Inicial (kg)</TH>
            <TH className="whitespace-nowrap text-right">Actual (kg)</TH>
            <TH className="whitespace-nowrap text-right">Merma (kg)</TH>
            <TH className="whitespace-nowrap">Estado</TH>
            <TH className="whitespace-nowrap text-right">Acción</TH>
          </TR>
        </THead>
        <TBody>
          {guias.map((g) => (
            <TR key={g.id} className={cn(g.id === activaId && 'bg-sky-50')}>
              <TD className="whitespace-nowrap">
                <div className="font-medium tabular-nums">
                  {g.bpReference != null ? formatBP(g.bpReference) : '—'}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {g.date} · {formatReferencia(g.bcReference)}
                </div>
              </TD>
              <TD className="max-w-64">
                <div className="truncate font-medium" title={g.guia ?? undefined}>{g.guia ?? '—'}</div>
                <div className="truncate text-xs text-muted-foreground" title={g.cliente ?? undefined}>
                  {g.cliente ?? '—'}{g.placa ? ` · ${g.placa}` : ''}
                </div>
              </TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{g.animales}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{kg(g.pesoInicialKg)}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{kg(g.pesoActualKg)}</TD>
              <TD className="whitespace-nowrap text-right">
                <MermaValor kgValor={g.mermaKg} porcentaje={g.mermaPct} />
              </TD>
              <TD className="whitespace-nowrap">
                {g.repesajeAbierto ? (
                  <Badge tone="info">
                    En repesaje {g.repesadosRonda}/{g.animales}
                  </Badge>
                ) : g.repesajeRonda > 0 ? (
                  <Badge tone="warning">
                    Repesada {g.repesajeRonda === 1 ? '1 vez' : `${g.repesajeRonda} veces`}
                  </Badge>
                ) : (
                  <Badge>Cerrada</Badge>
                )}
              </TD>
              <TD className="whitespace-nowrap text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="Ver detalle y mermas"
                    onClick={() => onVerDetalle(g)}
                  >
                    <Eye className="size-4" />
                  </Button>
                  {/* El span muestra el motivo aunque el botón esté deshabilitado. */}
                  <span
                    title={
                      g.repesajeAbierto
                        ? 'Continuar repesaje'
                        : g.motivoBloqueo
                          ? `No se puede repesar: ${g.motivoBloqueo}`
                          : 'Repesaje'
                    }
                  >
                    <Button
                      variant={g.repesajeAbierto ? 'default' : 'outline'}
                      size="icon"
                      className="size-8"
                      aria-label={g.repesajeAbierto ? 'Continuar repesaje' : 'Repesaje'}
                      disabled={iniciando || (!g.repesajeAbierto && !g.puedeRepesar)}
                      onClick={() => onRepesar(g)}
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  </span>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function EditarAnimalDialog({
  reporte,
  onClose,
  onSave,
  saving,
}: {
  reporte: PesoEnPie | null;
  onClose: () => void;
  onSave: (
    r: PesoEnPie,
    cambios: { tipoAnimal: string; corral: string; pesoTotalKg: number; observaciones: string },
  ) => Promise<void>;
  saving: boolean;
}) {
  const [tipo, setTipo] = useState('');
  const [corral, setCorral] = useState('');
  const [peso, setPeso] = useState('');
  const [obs, setObs] = useState('');
  const [tecladoPeso, setTecladoPeso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reporte) return;
    setTipo(reporte.tipoAnimal ?? '');
    setCorral(reporte.corral ?? '');
    setPeso(reporte.pesoTotalKg == null ? '' : String(reporte.pesoTotalKg));
    setObs(reporte.observaciones ?? '');
    setTecladoPeso(false);
    setError(null);
  }, [reporte]);

  if (!reporte) return null;

  async function guardar() {
    if (!reporte) return;
    const pesoNum = num(peso.replace(',', '.'));
    if (!tipo.trim()) return setError('Seleccioná el tipo de animal.');
    if (!corral.trim()) return setError('Seleccioná el corral.');
    if (pesoNum <= 0) return setError('El peso debe ser mayor a 0.');
    setError(null);
    try {
      await onSave(reporte, {
        tipoAnimal: tipo,
        corral,
        pesoTotalKg: pesoNum,
        observaciones: obs.trim(),
      });
    } catch (err) {
      setError(mensajeError(err, 'No se pudo actualizar el animal.'));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Editar animal ${formatAnimal(reporte.bpReference, reporte.reference)}`}
      description={`Guía ${reporte.guia ?? '—'} · ${reporte.date}`}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="edit-tipo">Tipo de Animal</Label>
            <Select id="edit-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9">
              <option value="">Seleccione...</option>
              <option value="MACHO">MACHO</option>
              <option value="HEMBRA">HEMBRA</option>
              <option value="BUFALO">BUFALO</option>
              <option value="BUFALA">BUFALA</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-corral">Ubicación (Corral)</Label>
            <Select id="edit-corral" value={corral} onChange={(e) => setCorral(e.target.value)} className="h-9">
              <option value="">Seleccione...</option>
              {Array.from({ length: 26 }, (_, i) => (
                <option key={i} value={String(i + 1)}>
                  Corral {i + 1}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-peso">Peso (kg)</Label>
            <div className="relative">
              <Input
                id="edit-peso"
                inputMode="decimal"
                className="h-9 pr-11 tabular-nums"
                title="Doble clic para abrir el teclado numérico"
                value={peso}
                onChange={(e) => setPeso(soloDecimal(e.target.value))}
                onDoubleClick={() => setTecladoPeso(true)}
              />
              <button
                type="button"
                aria-label="Abrir teclado numérico"
                title="Abrir teclado numérico (o doble clic en el campo)"
                onMouseDown={(e) => {
                  // Evita el blur para que el teclado escriba en este campo.
                  e.preventDefault();
                  setTecladoPeso((v) => !v);
                }}
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Keyboard className="size-5" />
              </button>
              {tecladoPeso && (
                <NumericKeypad
                  value={peso}
                  onChange={setPeso}
                  onClose={() => setTecladoPeso(false)}
                />
              )}
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="edit-obs">Observación del animal</Label>
            <Input
              id="edit-obs"
              className="h-9"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" className="h-9 px-4" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button className="h-9 px-5" onClick={guardar} disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
            Guardar cambios
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AnimalRow({
  index,
  reporte,
  selected,
  onSelect,
  onSave,
  saving,
}: {
  index: number;
  reporte: PesoEnPie;
  selected: boolean;
  onSelect: () => void;
  onSave: (observaciones: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [valor, setValor] = useState(reporte.observaciones ?? '');

  useEffect(() => {
    if (!editing) setValor(reporte.observaciones ?? '');
  }, [reporte.observaciones, editing]);

  return (
    <TR
      onClick={onSelect}
      className={cn(
        'cursor-pointer',
        selected && 'bg-sky-100 hover:bg-sky-100',
      )}
      aria-selected={selected}
    >
      <TD className="tabular-nums">{index + 1}</TD>
      <TD className="whitespace-nowrap tabular-nums">
        {formatAnimal(reporte.bpReference, reporte.reference)}
      </TD>
      <TD className="whitespace-nowrap">{reporte.tipoAnimal ?? '—'}</TD>
      <TD className="whitespace-nowrap">{reporte.corral ? `Corral ${reporte.corral}` : '—'}</TD>
      <TD className="whitespace-nowrap text-muted-foreground">{reporte.date}</TD>
      <TD className="whitespace-nowrap text-right tabular-nums">
        {kg(reporte.pesoTotalKg)}
      </TD>
      <TD className="min-w-56" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSave(valor.trim());
                  setEditing(false);
                }
                if (e.key === 'Escape') {
                  setValor(reporte.observaciones ?? '');
                  setEditing(false);
                }
              }}
              className="h-7 text-sm"
            />
            <Button
              size="sm"
              className="h-7 px-2"
              disabled={saving}
              onClick={() => {
                onSave(valor.trim());
                setEditing(false);
              }}
            >
              <Check className="size-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title="Editar observación de este animal"
          >
            <Pencil className="size-3.5 shrink-0" />
            <span className="truncate">{reporte.observaciones || 'Agregar observación…'}</span>
          </button>
        )}
      </TD>
    </TR>
  );
}

function GuiasCamionList({
  guias,
  loading,
  onSelect,
}: {
  guias: PesoCamionGuia[];
  loading: boolean;
  onSelect: (guia: PesoCamionGuia) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Cargando guías de Peso en Camión…
      </div>
    );
  }

  if (!guias.length) {
    return (
      <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
        <Table>
          <THead>
            <TR>
              <TH className="w-28 whitespace-nowrap">N.º Registro</TH>
              <TH className="whitespace-nowrap">Referencia</TH>
              <TH className="whitespace-nowrap">Guía</TH>
              <TH className="whitespace-nowrap">Cliente</TH>
              <TH className="whitespace-nowrap">Fecha</TH>
              <TH className="whitespace-nowrap">Placa</TH>
              <TH className="whitespace-nowrap text-right">Animales</TH>
              <TH className="whitespace-nowrap text-right">Entrada (kg)</TH>
              <TH className="whitespace-nowrap text-right">Salida (kg)</TH>
              <TH className="whitespace-nowrap text-right">Acción</TH>
            </TR>
          </THead>
          <TBody>
            <TR className="hover:bg-transparent">
              <TD colSpan={10} className="py-16">
                <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                  <Inbox className="size-8" />
                  <p className="text-sm font-medium">No hay guías abiertas</p>
                  <p className="text-sm">
                    Registra una guía en Peso en Camión para asignarle animales.
                  </p>
                </div>
              </TD>
            </TR>
          </TBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
      <Table>
        <THead>
          <TR>
            <TH className="w-28 whitespace-nowrap">N.º Registro</TH>
            <TH className="whitespace-nowrap">Referencia</TH>
            <TH className="whitespace-nowrap">Guía</TH>
            <TH className="whitespace-nowrap">Cliente</TH>
            <TH className="whitespace-nowrap">Fecha</TH>
            <TH className="whitespace-nowrap">Placa</TH>
            <TH className="whitespace-nowrap text-right">Animales</TH>
            <TH className="whitespace-nowrap text-right">Entrada (kg)</TH>
            <TH className="whitespace-nowrap text-right">Salida (kg)</TH>
          </TR>
        </THead>
        <TBody>
          {guias.map((guia, i) => (
            <TR
              key={guia.id}
              className="cursor-pointer"
              onClick={() => onSelect(guia)}
            >
              <TD className="tabular-nums">{i + 1}</TD>
              <TD className="whitespace-nowrap tabular-nums">
                {formatReferencia(guia.reference)}
              </TD>
              <TD className="whitespace-nowrap">
                {guia.guia ?? '—'}
              </TD>
              <TD className="whitespace-nowrap">{guia.cliente ?? '—'}</TD>
              <TD className="whitespace-nowrap text-muted-foreground">{guia.date}</TD>
              <TD className="whitespace-nowrap">{guia.placa ?? '—'}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{guia.cantidad ?? '—'}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{guia.entrada ?? '—'}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{guia.salida ?? '—'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}


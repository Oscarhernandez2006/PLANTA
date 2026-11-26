import { createContext, Fragment, useContext, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Info,
  FileBarChart,
  FileDown,
  FileSpreadsheet,
  FileText,
  Inbox,
  LoaderCircle,
  Paperclip,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn, plantToday as today } from '@/lib/utils';
import { useAuth } from '../auth/auth-context';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { descargarDespachoPdf } from './despacho-canales-export';
import { descargarListadoExcel, descargarListadoPdf, type ListadoInforme } from './listado-export';
import { desplazarFecha, pesoInforme, ResumenInforme } from './resumen-informe';
import { DescargasDesposte } from './DescargasDesposte';
import { InformeDespachos } from './InformeDespachos';
import {
  DIF_MEDIAS_MAX_KG,
  RANGO_RENDIMIENTO,
  descargarInternoExcel,
  descargarInternoPdf,
  encabezadoInterno,
  resumenInterno,
} from './canal-caliente-interno';
import { formatPieza } from '../rotulado/etiqueta-desposte-zpl';
import { formatOB, type OrdenBeneficioStatus } from '../registrar/orden-beneficio-api';
import { PrepararOrdenDialog } from '../registrar/PrepararOrden';
import {
  useDetalleCanalCaliente,
  useDetalleProduccion,
  useListadoInforme,
  exportarFilasInforme,
  useDetalleSacrificio,
  type CampoListado,
  type TipoListado,
  useDetalleProceso,
  type InformeProcesoRow,
  type InformeCanalCalienteRow,
  type InformeProduccionRow,
  type InformeSacrificioRow,
} from './api';
import {
  GRUPOS_SACRIFICIO,
  LEYENDA_SACRIFICIO,
  TIPOS_ANIMAL,
  clienteTexto,
  conteoAnimales,
  descargarSacrificioExcel,
  descargarSacrificioPdf,
  filasSacrificio,
  guiasEncabezado,
  num,
  tituloSacrificio,
} from './sacrificio-export';
import {
  COLUMNAS_ANIMALES,
  COLUMNAS_SUBPRODUCTOS,
  LEYENDA_PROCESO,
  bloquesResumen,
  descargarProcesoExcel,
  descargarProcesoPdf,
  filasAnimales,
  filasSubproductos,
  num as numProceso,
  personal,
  textoCelda,
  totalesResumen,
} from './proceso-export';
import {
  ESTADO_OP_LABEL,
  consecutivoProduccion,
  descargarProduccionExcel,
  descargarProduccionPdf,
  totalesEtiquetado,
  analisisProduccion,
  totalesProduccion,
} from './produccion-export';

const INFORMES = [
  { key: 'canal-caliente', label: 'Canal caliente', descripcion: 'Pesaje y órdenes de proceso', disponible: true },
  { key: 'produccion', label: 'Producción', descripcion: 'Órdenes, piezas y rotulado', disponible: true },
  { key: 'sacrificio', label: 'Sacrificio', descripcion: 'Guías y animales sacrificados', disponible: true },
  { key: 'proceso-general', label: 'Proceso general', descripcion: 'Trazabilidad por orden de beneficio', disponible: true },
  { key: 'despachos', label: 'Despachos', descripcion: 'Guías de transporte / remisiones', disponible: true },
  { key: 'canal-fria', label: 'Canal fría', descripcion: 'Próximamente', disponible: false },
  { key: 'productos', label: 'Productos', descripcion: 'Próximamente', disponible: false },
] as const;

type InformeKey = (typeof INFORMES)[number]['key'];

type RangoInforme = { desde: string; hasta: string };
const PeriodoInforme = createContext<{
  rango: RangoInforme;
  cambiar: (rango: RangoInforme) => void;
} | null>(null);

export function usePeriodoInforme() {
  const periodo = useContext(PeriodoInforme);
  if (!periodo) throw new Error('Falta el periodo del informe.');
  return periodo;
}

function rangoReciente(dias: number): RangoInforme {
  const hasta = today();
  return { desde: desplazarFecha(hasta, 1 - dias), hasta };
}

export function InformesPage() {
  const [seleccionado, setSeleccionado] = useState<InformeKey>('canal-caliente');
  const [periodo, setPeriodo] = useState('30');
  const [rango, setRango] = useState(() => rangoReciente(30));
  const actual = INFORMES.find((i) => i.key === seleccionado);
  const queryClient = useQueryClient();
  const queryKey = ['informes', seleccionado, 'listado-paginado'];
  const actualizando = useIsFetching({ queryKey }) > 0;

  return (
    <PeriodoInforme.Provider value={{ rango, cambiar: (r) => { setPeriodo('personalizado'); setRango(r); } }}>
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
        <FileBarChart className="size-9 shrink-0 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Consulta, analiza y exporta la información operativa de planta.</p>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Periodo" className="h-10 w-auto bg-card" value={periodo} onChange={(e) => {
            const valor = e.target.value;
            setPeriodo(valor);
            if (valor !== 'personalizado') setRango(rangoReciente(Number(valor)));
          }}>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="60">Últimos 60 días</option>
            <option value="personalizado">Periodo personalizado</option>
          </Select>
          <Button type="button" className="h-10" disabled={!actual?.disponible || actualizando} onClick={() => void queryClient.invalidateQueries({ queryKey })}>
            <RefreshCw className={cn('size-4', actualizando && 'animate-spin')} />
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label="Tipos de informe" className="order-1 min-w-0 lg:col-start-1 lg:row-start-2 lg:self-stretch lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-2 lg:shadow-sm">
          <p className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:pt-2">Tipos de informe</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1 sm:grid-cols-3 lg:grid-cols-1 lg:bg-transparent lg:p-0">
            {INFORMES.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => {
                  if (i.disponible && i.key !== 'produccion' && rango.hasta > today()) {
                    setRango(rangoReciente(30));
                    setPeriodo('30');
                  }
                  setSeleccionado(i.key);
                }}
                aria-pressed={seleccionado === i.key}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring lg:gap-3 lg:px-3 lg:py-3',
                  seleccionado === i.key ? 'bg-card text-primary shadow-sm lg:bg-primary/10 lg:shadow-none' : 'hover:bg-muted',
                  !i.disponible && seleccionado !== i.key && 'text-muted-foreground',
                )}
              >
                <FileText className="size-4 shrink-0 text-primary lg:size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold lg:text-sm">{i.label}</span>
                  <span className={cn('text-xs text-muted-foreground', i.disponible && 'hidden lg:block')}>{i.descripcion}</span>
                </span>
                <ChevronRight className="hidden size-4 shrink-0 lg:block" />
              </button>
            ))}
          </div>
        </nav>
          {seleccionado === 'canal-caliente' && <InformeCanalCaliente />}
          {seleccionado === 'produccion' && <InformeProduccion />}
          {seleccionado === 'sacrificio' && <InformeSacrificio />}
          {seleccionado === 'proceso-general' && <InformeProceso />}
          {seleccionado === 'despachos' && <InformeDespachos />}
          {actual && !actual.disponible && (
            <section className="order-2 flex min-h-60 flex-col items-center justify-center gap-2 rounded-xl bg-card p-6 text-center shadow-sm lg:col-start-2 lg:row-start-2">
              <FileText className="size-7 text-primary" />
              <h2 className="font-semibold">{actual.label}</h2>
              <p className="text-sm text-muted-foreground">Este informe aún no está disponible.</p>
            </section>
          )}
      </div>
    </div>
    </PeriodoInforme.Provider>
  );
}

/** Encabezado de los informes: logo y datos de la empresa (igual que en PDF y Excel). */
function EncabezadoInforme() {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border px-4 py-2.5">
      <img src={logoSantaCruz} alt="Agropecuaria Santa Cruz" className="h-14 w-auto shrink-0" />
      <div className="flex-1 text-center leading-tight">
        <p className="text-base font-bold tracking-wide">AGROPECUARIA SANTA CRUZ LTDA</p>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
          NIT. 830.505.537-2 · KM 3 VÍA ORIENTAL TEL. 3766701 · MALAMBO - ATLÁNTICO
        </p>
      </div>
      {/* Contrapeso del logo para que el texto quede centrado. */}
      <div className="hidden w-24 shrink-0 sm:block" />
    </div>
  );
}

const ESTADO_LABEL: Record<OrdenBeneficioStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  procesado: 'Procesado',
};

type FilaFiltrable = { cliente: string; status: string; clienteId?: string };

export function useFiltrosInforme() {
  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState('');
  const [estado, setEstado] = useState('');
  return {
    busqueda, setBusqueda,
    cliente, setCliente,
    estado, setEstado,
    limpiar: () => { setBusqueda(''); setCliente(''); setEstado(''); },
  };
}

export function FiltrosInforme({
  filtros, estados, limitarFecha = true, todosEstados = 'Todos los estados',
}: {
  filtros: ReturnType<typeof useFiltrosInforme> & { clientes: string[]; estados: string[] };
  estados: Record<string, string>;
  limitarFecha?: boolean;
  /** Texto de la opción "todos" del segundo filtro (estado, tipo…). */
  todosEstados?: string;
}) {
  const { rango: { desde, hasta }, cambiar } = usePeriodoInforme();
  const [errorFecha, setErrorFecha] = useState('');
  const cambiarFecha = (campo: keyof RangoInforme, value: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const nuevo = { desde, hasta, [campo]: value };
    if (campo === 'hasta' && (desde > value || desde < desplazarFecha(value, -60))) {
      nuevo.desde = desplazarFecha(value, -29);
    }
    if (nuevo.desde > nuevo.hasta || (limitarFecha && nuevo.hasta > today()) || nuevo.desde < desplazarFecha(nuevo.hasta, -60)) {
      setErrorFecha('Elige un rango válido, con un máximo de 60 días de diferencia.');
      return;
    }
    setErrorFecha('');
    cambiar(nuevo);
  };
  return (
    <div className="grid grid-cols-2 items-end gap-2 @min-[53rem]:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="col-span-2 min-w-0 text-xs font-semibold text-muted-foreground @min-[53rem]:col-span-1">
        <span className="sr-only">Buscar</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input className="h-9 bg-card pl-9 font-normal text-foreground shadow-none" value={filtros.busqueda} maxLength={200}
            onChange={(e) => filtros.setBusqueda(e.target.value)} placeholder="Orden, cliente u otro dato…" />
        </span>
      </label>
      <label className="min-w-0 text-xs font-semibold text-muted-foreground">
        <span className="sr-only">Cliente</span>
        <Select className="h-9 bg-card font-normal text-foreground shadow-none" value={filtros.cliente} onChange={(e) => filtros.setCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {filtros.clientes.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </label>
      <label className="min-w-0 text-xs font-semibold text-muted-foreground">
        <span className="sr-only">Estado</span>
        <Select className="h-9 bg-card font-normal text-foreground shadow-none" value={filtros.estado} onChange={(e) => filtros.setEstado(e.target.value)}>
          <option value="">{todosEstados}</option>
          {filtros.estados.map((e) => <option key={e} value={e}>{estados[e] ?? e}</option>)}
        </Select>
      </label>
      <label className="min-w-0 space-y-1 text-xs font-semibold text-muted-foreground">
        Desde
        <Input type="date" className="h-9 min-w-0 bg-card font-normal text-foreground shadow-none" value={desde}
          min={desplazarFecha(hasta, -60)} max={hasta} onChange={(e) => cambiarFecha('desde', e.target.value)} />
      </label>
      <label className="min-w-0 space-y-1 text-xs font-semibold text-muted-foreground">
        Hasta
        <Input type="date" className="h-9 min-w-0 bg-card font-normal text-foreground shadow-none" value={hasta} max={limitarFecha ? today() : undefined}
          onChange={(e) => cambiarFecha('hasta', e.target.value)} />
      </label>
      <Button type="button" variant="ghost" className="h-9 justify-self-start self-end px-2 text-xs text-muted-foreground"
        disabled={!filtros.busqueda && !filtros.cliente && !filtros.estado && !errorFecha}
        aria-label="Limpiar filtros" onClick={() => { filtros.limpiar(); setErrorFecha(''); }}>
        <X className="size-4" /> Limpiar
      </Button>
      {errorFecha && <p role="alert" className="col-span-full text-xs text-destructive">{errorFecha}</p>}
    </div>
  );
}

function ExportarListado({ preparar, disponible }: { preparar: () => Promise<ListadoInforme>; disponible: boolean }) {
  const [exportando, setExportando] = useState(false);
  const [resultado, setResultado] = useState<'error' | 'listo' | null>(null);

  async function exportar(tipo: 'pdf' | 'excel') {
    setExportando(true);
    setResultado(null);
    try {
      const listado = await preparar();
      if (tipo === 'pdf') await descargarListadoPdf(listado);
      else await descargarListadoExcel(listado);
      setResultado('listo');
    } catch (err) {
      console.error('Error al exportar el listado de informes:', err);
      setResultado('error');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Exportar listado filtrado">
        {resultado === 'error' && <span role="alert" className="text-xs text-destructive">No se pudo exportar. Intenta nuevamente.</span>}
        {resultado === 'listo' && <span role="status" className="text-xs text-primary">Archivo generado</span>}
        {exportando && <LoaderCircle aria-label="Generando archivo" className="size-4 animate-spin text-primary" />}
        <Button type="button" variant="outline" className="h-9" title="Exportar listado filtrado a PDF" disabled={!disponible || exportando} onClick={() => exportar('pdf')}>
          <FileDown className="size-4" /> PDF
        </Button>
        <Button type="button" variant="outline" className="h-9 text-primary" title="Exportar listado filtrado a Excel" disabled={!disponible || exportando} onClick={() => exportar('excel')}>
          <FileSpreadsheet className="size-4" /> Excel
        </Button>
    </div>
  );
}

function EstadoInforme({ estado, label }: { estado: string; label: string }) {
  return (
    <span className={cn(
      'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
      estado === 'activo' ? 'bg-primary/10 text-primary' :
        estado === 'inactivo' ? 'bg-muted text-muted-foreground' : 'bg-emerald-100 text-emerald-800',
    )}>{label}</span>
  );
}

function ListadoOrdenes<T extends FilaFiltrable & { id: string }>({
  titulo, archivo, descripcion, estados, tipo, columnas, campos,
  celdas, abrir, limitarFecha,
}: {
  titulo: string;
  archivo: string;
  descripcion: string;
  estados: Record<string, string>;
  tipo: TipoListado;
  columnas: string[];
  campos: (CampoListado | null)[];
  celdas: (fila: T) => string[];
  abrir: (fila: T) => void;
  limitarFecha?: boolean;
}) {
  const { rango } = usePeriodoInforme();
  const filtros = useFiltrosInforme();
  const [orden, setOrden] = useState<{ col: number; asc: boolean } | null>(null);
  const [pagina, setPagina] = useState({ clave: '', indice: 0 });
  const nombres = [...columnas, 'Estado'];
  const camposOrden = [...campos, 'estado' as const];
  const params = {
    ...rango,
    buscar: filtros.busqueda.trim() || undefined,
    cliente: filtros.cliente || undefined,
    estado: filtros.estado || undefined,
    ordenar: orden ? camposOrden[orden.col] ?? undefined : undefined,
    direccion: orden ? (orden.asc ? 'asc' as const : 'desc' as const) : undefined,
  };
  const clave = JSON.stringify(params);
  const indice = pagina.clave === clave ? pagina.indice : 0;
  const consulta = useListadoInforme<T>(tipo, { ...params, pagina: indice + 1 });
  const total = consulta.data?.total ?? 0;
  const paginas = Math.ceil(total / 20);
  const valoresDe = (fila: T) => [...celdas(fila), estados[fila.status] ?? fila.status];
  const visibles = (consulta.data?.filas ?? []).map((fila) => ({ fila, valores: valoresDe(fila) }));
  const disponible = !consulta.isLoading && !consulta.isError;
  const preparar = async (): Promise<ListadoInforme> => {
    const datos = await exportarFilasInforme<T>(tipo, params);
    if (!datos.filas.length) throw new Error('No quedan órdenes para exportar.');
    return {
      titulo, archivo, ...rango, columnas: nombres, filas: datos.filas.map(valoresDe),
      total: tipo === 'canal-caliente' ? `Peso total del listado: ${pesoInforme(datos.pesoFiltrado)}` : undefined,
      filtros: [
        params.buscar && `Búsqueda: ${params.buscar}`,
        params.cliente && `Cliente: ${params.cliente}`,
        params.estado && `Estado: ${estados[params.estado] ?? params.estado}`,
      ].filter((valor): valor is string => Boolean(valor)),
    };
  };
  const opciones = (valores: string[] | undefined, seleccion: string) =>
    [...new Set([...(valores ?? []), ...(seleccion ? [seleccion] : [])])];

  return (
    <>
    <ResumenInforme resumen={disponible ? consulta.data?.resumen : undefined} tipo={tipo} cargando={consulta.isLoading} />
    <section className="@container order-2 min-h-[27rem] min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-start-2 lg:row-start-2">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{descripcion}</p>
        </div>
        <ExportarListado preparar={preparar} disponible={disponible && total > 0} />
      </header>
      <div className="mx-3 rounded-lg bg-muted/50 px-3 py-2.5">
        <FiltrosInforme filtros={{ ...filtros,
          clientes: opciones(consulta.data?.clientes, filtros.cliente),
          estados: opciones(consulta.data?.estados, filtros.estado),
        }} estados={estados} limitarFecha={limitarFecha} />
      </div>
      <div className="px-4 py-2.5 sm:px-5">
        <p className="text-xs text-muted-foreground">
          {disponible && <><span className="font-semibold text-primary">{total} {total === 1 ? 'orden' : 'órdenes'}</span> · </>}
          {total > 0 && disponible ? 'Selecciona una orden para ver su detalle.' : 'Resultados del periodo seleccionado.'}
        </p>
      </div>
      {!disponible || !visibles.length ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-5 text-center text-sm text-muted-foreground">
          {consulta.isLoading ? <div role="status" className="w-full space-y-2">
            <span className="sr-only">Cargando órdenes…</span>
            {[1, 2, 3].map((n) => <div key={n} className="h-8 animate-pulse rounded bg-muted" />)}
          </div> : consulta.isError ? (
            <><p role="alert" className="text-destructive">No se pudieron cargar las órdenes.</p>
              <Button variant="outline" onClick={() => void consulta.refetch()}>Reintentar</Button></>
          ) : <><Inbox className="size-7" />{total > 0 ? 'Esta página ya no tiene órdenes.' : 'No hay órdenes que coincidan con los filtros.'}
            {total > 0 && <Button variant="outline" onClick={() => setPagina({ clave, indice: 0 })}>Volver a la primera página</Button>}</>}
        </div>
      ) : (
        <>
          <div className="mx-4 hidden overflow-hidden rounded-lg border border-border/60 sm:mx-5 @min-[44rem]:block">
            <Table>
              <THead className="bg-muted/45">
                <TR>
                  {nombres.map((columna, col) => (
                    <TH key={columna} scope="col" className={cn(
                      'h-11 px-4 py-2 leading-snug',
                      col === 1 && 'w-2/5',
                      camposOrden[col] === 'peso' && 'text-right',
                    )} aria-sort={orden?.col === col ? (orden.asc ? 'ascending' : 'descending') : undefined}>
                      {camposOrden[col] ? <button type="button" className="cursor-pointer text-inherit hover:text-primary" onClick={() =>
                        setOrden({ col, asc: orden?.col === col ? !orden.asc : true })}>
                        {columna}{orden?.col === col && (orden.asc ? ' ↑' : ' ↓')}
                      </button> : columna}
                    </TH>
                  ))}
                  <TH scope="col" className="w-11 px-3"><span className="sr-only">Detalle</span></TH>
                </TR>
              </THead>
              <TBody>
                {visibles.map(({ fila, valores }) => (
                  <TR key={fila.id} onClick={() => abrir(fila)} className="cursor-pointer border-border/60 hover:bg-primary/5">
                    <TD className="px-4 py-3.5">
                      <button type="button" className="font-semibold whitespace-nowrap text-primary hover:underline" onClick={(event) => {
                        event.stopPropagation();
                        abrir(fila);
                      }}>{valores[0]}</button>
                    </TD>
                    {valores.slice(1, -1).map((valor, i) => {
                      const campo = campos[i + 1];
                      return <TD key={columnas[i + 1]} className={cn(
                        'px-4 py-3.5 leading-snug wrap-anywhere',
                        campo === 'cliente' && 'font-medium',
                        (campo === 'fecha' || campo === 'peso' || campo === 'animales') && 'whitespace-nowrap tabular-nums',
                        campo === 'peso' && 'text-right',
                      )}>{valor}</TD>;
                    })}
                    <TD className="px-4 py-3.5 whitespace-nowrap"><EstadoInforme estado={fila.status} label={valores[valores.length - 1]} /></TD>
                    <TD className="px-3 py-3.5 text-muted-foreground"><ChevronRight aria-hidden="true" className="size-4" /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <ul className="divide-y divide-border/60 @min-[44rem]:hidden">
            {visibles.map(({ fila, valores }) => (
              <li key={fila.id}>
                <button type="button" onClick={() => abrir(fila)} className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-left hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-primary">{valores[0]}</span>
                      <EstadoInforme estado={fila.status} label={valores[valores.length - 1]} />
                    </span>
                    <span className="block text-sm font-medium wrap-break-word">{valores[1]}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {valores.slice(2, -1).map((valor, i) => <span key={columnas[i + 2]} className="max-w-full wrap-break-word">{columnas[i + 2]}: {valor}</span>)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
          {paginas > 1 && <nav aria-label="Paginación del listado" className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Button type="button" variant="outline" size="sm" disabled={indice === 0} onClick={() => setPagina({ clave, indice: indice - 1 })}>Anterior</Button>
            <span>Página {indice + 1} de {paginas}</span>
            <Button type="button" variant="outline" size="sm" disabled={indice + 1 >= paginas} onClick={() => setPagina({ clave, indice: indice + 1 })}>Siguiente</Button>
          </nav>}
          <div className="mx-4 mt-6 flex items-center gap-2 border-t border-border py-3 text-xs text-muted-foreground sm:mx-5">
            <Info className="size-4 shrink-0 text-primary" /> Abre una orden para consultar sus registros y descargas.
          </div>
        </>
      )}
    </section>
    </>
  );
}

function InformeProduccion() {
  const [detalle, setDetalle] = useState<InformeProduccionRow | null>(null);

  return (
    <>
      <ListadoOrdenes<InformeProduccionRow> tipo="produccion" titulo="Órdenes de producción" archivo="ordenes-produccion"
        descripcion="Consulta la materia prima, las piezas y el rotulado de cada orden."
        estados={ESTADO_OP_LABEL} campos={['orden', 'cliente', 'fecha']}
        limitarFecha={false} columnas={['Consecutivo', 'Cliente', 'Fecha de proceso']} abrir={setDetalle}
        celdas={(r) => [consecutivoProduccion(r), r.clienteNit ? `${r.clienteNit} - ${r.cliente}` : r.cliente, r.processDate]} />
      {detalle && <DetalleProduccionDialog orden={detalle} onClose={() => setDetalle(null)} />}
    </>
  );
}

function DatoInforme({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function Kpi({ label, valor, sub, destacado }: { label: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <div className={cn('rounded-xl border px-4 py-3', destacado ? 'border-primary/30 bg-primary/5' : 'border-border bg-card')}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-xl font-bold tabular-nums', destacado && 'text-primary')}>{valor}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Chip({ children, alerta }: { children: React.ReactNode; alerta?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium ring-1',
        alerta ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-background text-muted-foreground ring-border',
      )}
    >
      {children}
    </span>
  );
}

function DetalleProduccionDialog({
  orden,
  onClose,
}: {
  orden: InformeProduccionRow;
  onClose: () => void;
}) {
  const detalle = useDetalleProduccion(orden.id);
  const { user } = useAuth();
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);
  const [preparando, setPreparando] = useState(false);
  // Filas consolidadas desplegadas para ver su detalle por canastilla.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const d = detalle.data;
  const tot = d ? totalesProduccion(d) : { piezas: 0, kg: 0 };
  const te = d ? totalesEtiquetado(d) : { canastillas: 0, unds: 0, kg: 0, rendimiento: 0 };
  const an = d ? analisisProduccion(d) : null;
  const generado = new Date(detalle.dataUpdatedAt || Date.now()).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const cab = 'border border-border bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const cel = 'border border-border px-3 py-2 text-center';

  async function exportar(tipo: 'pdf' | 'excel') {
    if (!d) return;
    setExportando(tipo);
    try {
      if (tipo === 'pdf') await descargarProduccionPdf(d, user?.fullName ?? '');
      else await descargarProduccionExcel(d, user?.fullName ?? '');
    } finally {
      setExportando(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Informe de producción consecutivo: ${consecutivoProduccion(orden)} | ${generado}`}
      className="max-w-6xl"
      scrollInterno
    >
      <div className="space-y-5">
        <EncabezadoInforme />
        <DescargasDesposte opNumber={orden.opNumber} />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="h-9"
            onClick={() => detalle.refetch()}
            disabled={detalle.isFetching}
            title="Actualizar"
          >
            <RefreshCw className={cn('size-4', detalle.isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="Preparar orden"
            title="Preparar orden"
            onClick={() => setPreparando(true)}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('pdf')}
            disabled={!d || exportando !== null}
            title="Exportar a PDF"
          >
            <FileDown className="size-4 text-red-700" />
            {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('excel')}
            disabled={!d || exportando !== null}
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="size-4 text-emerald-700" />
            {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </Button>
        </div>

        {detalle.isLoading || !d || !an ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            {/* Datos de la orden y trazabilidad */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-5 py-4 sm:grid-cols-4">
              <DatoInforme label="Cliente">{d.cliente}</DatoInforme>
              <DatoInforme label="Producto terminado">{d.productoTerminado ?? '—'}</DatoInforme>
              <DatoInforme label="Consecutivo">
                <span className="text-primary">{consecutivoProduccion(d)}</span>
              </DatoInforme>
              <DatoInforme label="Estado">{ESTADO_OP_LABEL[d.status]}</DatoInforme>
              <DatoInforme label="Fecha de sacrificio">{d.fechaSacrificio ?? '—'}</DatoInforme>
              <DatoInforme label="Fecha de ingreso">{d.fechaIngreso ?? '—'}</DatoInforme>
              <DatoInforme label="Fecha de proceso">{d.processDate}</DatoInforme>
              <DatoInforme label="Cierre">
                {d.cerradaAt
                  ? `${new Date(d.cerradaAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}${d.cerradaPor ? ` · ${d.cerradaPor}` : ''}`
                  : '—'}
              </DatoInforme>
              <DatoInforme label="Lote">{d.opNumber}</DatoInforme>
              <DatoInforme label="Órdenes de beneficio">
                {d.obReferencias?.length ? d.obReferencias.map((n) => `OB${n}`).join(', ') : '—'}
              </DatoInforme>
              <DatoInforme label={d.guias && d.guias.length > 1 ? 'Guías' : 'Guía'} className="sm:col-span-2">
                {d.guias?.length ? d.guias.join(', ') : '—'}
              </DatoInforme>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Materia prima" valor={`${kg(an.mpKg)} kg`} sub={`${an.canales} canales`} />
              <Kpi label="Producido" valor={`${kg(an.producidoKg)} kg`} sub={`${an.unds} unds`} />
              <Kpi label="Rendimiento" valor={`${kg(an.rendimiento)} %`} destacado />
              <Kpi
                label="Diferencia"
                valor={`${kg(an.diferenciaKg)} kg`}
                sub="hueso, grasa y merma"
              />
              <Kpi label="Canastillas" valor={String(an.canastillas)} />
              <Kpi
                label="Prom. por canal"
                valor={`${kg(an.canales ? an.producidoKg / an.canales : 0)} kg`}
                sub={`${an.canales ? (an.unds / an.canales).toLocaleString('es-CO', { maximumFractionDigits: 1 }) : 0} unds`}
              />
            </div>

            {/* Control */}
            {d.control && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Control:</span>
                <Chip alerta={d.control.noImpresas > 0}>{d.control.noImpresas} etiquetas no impresas</Chip>
                <Chip alerta={d.control.sobrantes > 0}>{d.control.sobrantes} sobrantes</Chip>
                <Chip alerta={d.control.borradas > 0}>{d.control.borradas} etiquetas borradas</Chip>
                <Chip alerta={(d.control.reimpresiones ?? 0) > 0}>{d.control.reimpresiones ?? 0} reimpresiones</Chip>
                {d.control.estaciones.length > 0 && (
                  <Chip>Estaciones: {d.control.estaciones.join(', ')}</Chip>
                )}
              </div>
            )}

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th colSpan={5} className={cab}>
                    Orden de traslado de M.P a sala No. {d.odNumber}
                  </th>
                </tr>
                <tr>
                  <th className={cn(cab, 'w-20')}>No.</th>
                  <th className={cn(cab, 'w-32')}>Código</th>
                  <th className={cab}>Producto</th>
                  <th className={cn(cab, 'w-40')}>Piezas</th>
                  <th className={cn(cab, 'w-48')}>Cant.(kg)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.detalle.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={cn(cel, 'py-6 text-muted-foreground')}>
                      La orden de despacho aún no tiene canales pesadas en Canal Fría.
                    </td>
                  </tr>
                ) : (
                  d.detalle.map((r, i) => (
                    <tr key={r.codigo} className="even:bg-muted/30">
                      <td className={cel}>{String(i + 1).padStart(2, '0')}</td>
                      <td className={cel}>{r.codigo}</td>
                      <td className={cel}>{r.producto}</td>
                      <td className={cel}>{r.piezas}</td>
                      <td className={cn(cel, 'text-right')}>{kg(r.kg)}</td>
                    </tr>
                  ))
                )}
                <tr className="text-base font-bold">
                  <td colSpan={3} className={cn(cel, 'text-right uppercase')}>
                    Totales
                  </td>
                  <td className={cel}>{tot.piezas}</td>
                  <td className={cn(cel, 'text-right')}>{kg(tot.kg)}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th colSpan={10} className={cab}>
                    Orden de producción (pesaje y etiquetado) No. {d.opNumber}
                  </th>
                </tr>
                <tr>
                  <th className={cn(cab, 'w-12')}>No.</th>
                  <th className={cn(cab, 'w-20')}>Código</th>
                  <th className={cab}>Producto</th>
                  <th className={cab}>Tienda</th>
                  <th className={cn(cab, 'w-24')}>Canastillas</th>
                  <th className={cn(cab, 'w-16')}>Unds</th>
                  <th className={cn(cab, 'w-28')}>Cant.(kg)</th>
                  <th className={cn(cab, 'w-24')}>Kg/canal</th>
                  <th className={cn(cab, 'w-36')}>% part.</th>
                  <th className={cn(cab, 'w-20')}>RND(%)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.etiquetado.length === 0 ? (
                  <tr>
                    <td colSpan={10} className={cn(cel, 'py-6 text-muted-foreground')}>
                      Aún no hay productos etiquetados en Rotulado Desposte para esta orden.
                    </td>
                  </tr>
                ) : (
                  an.grupos.map((g) => (
                    <Fragment key={g.tipo}>
                      {an.grupos.length > 1 && (
                        <tr>
                          <td colSpan={10} className={cn(cel, 'bg-primary/5 text-left text-xs font-bold uppercase tracking-wide text-primary')}>
                            {g.tipo}
                          </td>
                        </tr>
                      )}
                      {g.filas.map((r, i) => {
                        const clave = `${r.codigo}-${r.tiendaCodigo}`;
                        const abierta = abiertas.has(clave);
                        const desplegable = r.detalle.length > 0;
                        return (
                          <Fragment key={clave}>
                            <tr
                              className={cn('even:bg-muted/30', desplegable && 'cursor-pointer hover:bg-muted/50')}
                              onClick={
                                desplegable
                                  ? () =>
                                      setAbiertas((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(clave)) next.delete(clave);
                                        else next.add(clave);
                                        return next;
                                      })
                                  : undefined
                              }
                            >
                              <td className={cel}>{String(i + 1).padStart(2, '0')}</td>
                              <td className={cel}>{r.codigo}</td>
                              <td className={cn(cel, 'text-left')}>{r.producto}</td>
                              <td className={cel}>
                                {r.tiendaCodigo} - {r.tienda}
                                {r.sobrantes > 0 && (
                                  <span className="ml-1.5 rounded-sm bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                                    {r.sobrantes} SOBRANTE{r.sobrantes > 1 ? 'S' : ''}
                                  </span>
                                )}
                              </td>
                              <td className={cn(cel, 'font-semibold')}>
                                <span className="inline-flex items-center justify-center gap-1">
                                  {desplegable &&
                                    (abierta ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />)}
                                  {r.canastillas}
                                </span>
                              </td>
                              <td className={cel}>{r.unds}</td>
                              <td className={cn(cel, 'text-right font-semibold')}>{kg(r.kg)}</td>
                              <td className={cn(cel, 'text-right')}>{kg(r.kgCanal)}</td>
                              <td className={cel}>
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.participacion)}%` }} />
                                  </div>
                                  <span className="w-12 text-right text-xs">{kg(r.participacion)}</span>
                                </div>
                              </td>
                              <td className={cel}>{kg(r.rendimiento)}</td>
                            </tr>
                            {abierta &&
                              r.detalle.map((c, j) => (
                                <tr key={`${clave}-${c.canastilla ?? 's'}-${c.piezaDesde}-${j}`} className="bg-muted/10 text-xs">
                                  <td className={cel} />
                                  <td className={cel}>{r.codigo}</td>
                                  <td className={cn(cel, 'text-left')}>
                                    <span className="text-muted-foreground">
                                      {c.canastilla != null ? `Canastilla N.º ${c.canastilla} · ` : ''}
                                      {c.unds > 1
                                        ? `Piezas #${formatPieza(c.piezaDesde)}–#${formatPieza(c.piezaHasta)}`
                                        : `Pieza #${formatPieza(c.piezaDesde)}`}
                                      {' · '}
                                      {c.empaque}
                                      {c.sobrantes > 0 && ` · ${c.sobrantes} SOBRANTE${c.sobrantes > 1 ? 'S' : ''}`}
                                    </span>
                                  </td>
                                  <td className={cel}>{r.tiendaCodigo} - {r.tienda}</td>
                                  <td className={cel}>{c.canastillas}</td>
                                  <td className={cel}>{c.unds}</td>
                                  <td className={cn(cel, 'text-right')}>{kg(c.kg)}</td>
                                  <td className={cel} />
                                  <td className={cel} />
                                  <td className={cel}>{kg(c.rendimiento)}</td>
                                </tr>
                              ))}
                          </Fragment>
                        );
                      })}
                      {an.grupos.length > 1 && (
                        <tr className="bg-muted/40 font-semibold">
                          <td colSpan={4} className={cn(cel, 'text-right text-xs uppercase')}>
                            Subtotal {g.tipo.toLowerCase()}
                          </td>
                          <td className={cel}>{g.canastillas}</td>
                          <td className={cel}>{g.unds}</td>
                          <td className={cn(cel, 'text-right')}>{kg(g.kg)}</td>
                          <td className={cn(cel, 'text-right')}>{kg(an.canales ? g.kg / an.canales : 0)}</td>
                          <td className={cel}>{kg(g.participacion)}</td>
                          <td className={cel}>{kg(g.rendimiento)}</td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
                <tr className="text-base font-bold">
                  <td colSpan={4} className={cn(cel, 'text-right uppercase')}>
                    Totales
                  </td>
                  <td className={cel}>{te.canastillas} canast.</td>
                  <td className={cel}>{te.unds}</td>
                  <td className={cn(cel, 'text-right')}>{kg(te.kg)}</td>
                  <td className={cn(cel, 'text-right')}>{kg(an.canales ? te.kg / an.canales : 0)}</td>
                  <td className={cel}>100,00</td>
                  <td className={cel}>{kg(te.rendimiento)}</td>
                </tr>
              </tbody>
            </table>

            {an.tiendas.length > 1 && (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th colSpan={4} className={cab}>Resumen por tienda</th>
                  </tr>
                  <tr>
                    <th className={cab}>Tienda</th>
                    <th className={cn(cab, 'w-28')}>Canastillas</th>
                    <th className={cn(cab, 'w-20')}>Unds</th>
                    <th className={cn(cab, 'w-32')}>Cant.(kg)</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {an.tiendas.map((t) => (
                    <tr key={t.tienda} className="even:bg-muted/30">
                      <td className={cn(cel, 'text-left')}>{t.tienda}</td>
                      <td className={cel}>{t.canastillas}</td>
                      <td className={cel}>{t.unds}</td>
                      <td className={cn(cel, 'text-right')}>{kg(t.kg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
      {preparando && (
        <PrepararOrdenDialog
          orden={{
            id: orden.id,
            opNumber: orden.opNumber,
            odNumber: orden.odNumber,
            clienteId: orden.clienteId,
            clienteNit: orden.clienteNit,
            clienteNombre: orden.cliente,
          }}
          onClose={() => setPreparando(false)}
        />
      )}
    </Dialog>
  );
}

function InformeCanalCaliente() {
  const [detalle, setDetalle] = useState<InformeCanalCalienteRow | null>(null);

  return (
    <>
      <ListadoOrdenes<InformeCanalCalienteRow> tipo="canal-caliente" titulo="Órdenes de canal caliente" archivo="ordenes-canal-caliente"
        descripcion="Consulta el pesaje de canales y el detalle por orden."
        estados={ESTADO_LABEL} campos={['orden', 'cliente', null, 'fecha', 'peso']}
        columnas={['OD No.', 'Cliente', 'Tipo', 'Fecha de proceso', 'Peso total']} abrir={setDetalle}
        celdas={(r) => [formatOB(r.reference), clienteConDestino(r), 'CANAL/CALIENTE', r.date,
          r.pesoTotalKg == null ? '—' : pesoInforme(r.pesoTotalKg)]} />
      {detalle && (
        <DetalleCanalCalienteDialog orden={detalle} onClose={() => setDetalle(null)} />
      )}
    </>
  );
}

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clienteConDestino = (o: { cliente: string; destino: string | null }) =>
  o.destino ? `${o.cliente} (${o.destino.toUpperCase()})` : o.cliente;

function DetalleCanalCalienteDialog({
  orden,
  onClose,
}: {
  orden: InformeCanalCalienteRow;
  onClose: () => void;
}) {
  const detalle = useDetalleCanalCaliente(orden.id);
  const { user } = useAuth();
  const [exportando, setExportando] = useState<'pdf' | 'excel' | 'cliente' | null>(null);
  const piezas = detalle.data?.piezas ?? [];
  const r = detalle.data ? resumenInterno(detalle.data) : null;
  const enc = detalle.data ? encabezadoInterno(detalle.data) : null;
  const celda = 'border-b border-border px-2.5 py-2';
  const k1 = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pc = (n: number | null) => (n == null ? '—' : `${k1(n)} %`);

  async function exportar(tipo: 'pdf' | 'excel' | 'cliente') {
    if (!detalle.data) return;
    setExportando(tipo);
    try {
      if (tipo === 'pdf') await descargarInternoPdf(detalle.data, user?.fullName ?? '');
      else if (tipo === 'excel') await descargarInternoExcel(detalle.data);
      else await descargarDespachoPdf(detalle.data, user?.fullName ?? '');
    } finally {
      setExportando(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Canal caliente · Orden de beneficio ${formatOB(orden.reference)}`}
      description={enc ? `${enc.sacrificio} · Reporte interno` : 'Reporte interno'}
      className="max-w-7xl"
      scrollInterno
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-sm text-muted-foreground">{enc?.lote ?? clienteConDestino(orden)}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9" onClick={() => exportar('excel')} disabled={!piezas.length || exportando !== null}>
              <FileSpreadsheet className="size-4 text-emerald-700" />
              {exportando === 'excel' ? 'Generando…' : 'Excel'}
            </Button>
            <Button variant="outline" className="h-9" onClick={() => exportar('pdf')} disabled={!piezas.length || exportando !== null}>
              <FileDown className="size-4 text-red-700" />
              {exportando === 'pdf' ? 'Generando…' : 'PDF'}
            </Button>
            <Button
              variant="ghost"
              className="h-9"
              onClick={() => exportar('cliente')}
              disabled={!piezas.length || exportando !== null}
              title="Formato de despacho de canales para el cliente"
            >
              <FileDown className="size-4" />
              {exportando === 'cliente' ? 'Generando…' : 'Formato cliente'}
            </Button>
          </div>
        </div>

        {r && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ['Animales', String(r.animales.length)],
              ['Medias', String(r.piezas)],
              ['Peso vivo', `${k1(r.vivo)} kg`],
              ['Canal caliente', `${k1(r.canal)} kg`],
              ['Rendimiento', pc(r.rendimiento)],
              ['Promedio canal', `${k1(r.promCanal)} kg`],
              ['Con alerta', String(r.conAlerta)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className={cn('text-lg font-semibold tabular-nums', l === 'Con alerta' && r.conAlerta > 0 && 'text-amber-700')}>{v}</p>
              </div>
            ))}
          </div>
        )}

        <div className="scrollbar-app max-h-[420px] overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold text-foreground/70">
              <tr>
                <th className={celda}>Tur.</th>
                <th className={celda}>Tipo</th>
                <th className={cn(celda, 'text-right')}>Vivo kg</th>
                <th className={celda}>Izq. (con cola)</th>
                <th className={cn(celda, 'text-right')}>kg</th>
                <th className={celda}>Der. (sin cola)</th>
                <th className={cn(celda, 'text-right')}>kg</th>
                <th className={cn(celda, 'text-right')}>Canal kg</th>
                <th className={cn(celda, 'text-right')}>Rend.</th>
                <th className={cn(celda, 'text-right')}>Dif. I-D</th>
                <th className={celda}>Cava</th>
                <th className={celda}>Hora / Op.</th>
              </tr>
            </thead>
            <tbody>
              {detalle.isLoading ? (
                <tr>
                  <td colSpan={12} className="py-6 text-center text-muted-foreground">Cargando…</td>
                </tr>
              ) : !r || r.animales.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-6 text-center text-muted-foreground">Esta orden no tiene canales pesadas.</td>
                </tr>
              ) : (
                r.animales.map((a) => (
                  <tr key={a.turno} className={cn('even:bg-muted/25 hover:bg-muted/50', a.alertas.length && 'bg-amber-50 even:bg-amber-50')} title={a.alertas.join(' · ') || undefined}>
                    <td className={cn(celda, 'font-semibold tabular-nums')}>{a.turno}</td>
                    <td className={cn(celda, 'text-xs')}>{a.tipo}</td>
                    <td className={cn(celda, 'text-right tabular-nums')}>{a.vivoKg != null ? k1(a.vivoKg) : '—'}</td>
                    <td className={cn(celda, 'font-mono text-xs')}>{a.izq?.barcode ?? '—'}</td>
                    <td className={cn(celda, 'text-right tabular-nums')}>{a.izq ? k1(a.izq.pesoKg) : '—'}</td>
                    <td className={cn(celda, 'font-mono text-xs')}>{a.der?.barcode ?? '—'}</td>
                    <td className={cn(celda, 'text-right tabular-nums')}>{a.der ? k1(a.der.pesoKg) : '—'}</td>
                    <td className={cn(celda, 'text-right font-semibold tabular-nums')}>{k1(a.canalKg)}</td>
                    <td className={cn(celda, 'text-right tabular-nums', a.alertas.some((x) => x.startsWith('Rendimiento')) && 'font-bold text-amber-800')}>
                      {a.alertas.length > 0 && '⚠ '}
                      {pc(a.rendimiento)}
                    </td>
                    <td className={cn(celda, 'text-right tabular-nums', a.alertas.includes('Medias desiguales') && 'font-bold text-amber-800')}>
                      {a.difKg != null ? k1(a.difKg) : '—'}
                    </td>
                    <td className={cn(celda, 'whitespace-nowrap text-xs')}>{a.cava}</td>
                    <td className={cn(celda, 'whitespace-nowrap text-xs text-muted-foreground')}>
                      {a.hora} · {a.operario}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {r && r.animales.length > 0 && (
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 font-semibold">Por tipo</p>
              {r.porTipo.map((t) => (
                <p key={t.tipo} className="flex justify-between tabular-nums">
                  <span>{t.tipo} · {t.n}</span>
                  <span className="font-medium">{pc(t.rendimiento)}</span>
                </p>
              ))}
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 font-semibold">Por cava</p>
              {r.porCava.map((c) => (
                <p key={c.cava} className="flex justify-between tabular-nums">
                  <span>{c.cava} · {c.medias} medias</span>
                  <span className="font-medium">{k1(c.kg)} kg</span>
                </p>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">
                Media con cola {k1(r.promIzq)} kg · sin cola {k1(r.promDer)} kg (promedio)
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 font-semibold">Extremos y alertas</p>
              {r.mejor && <p>Mejor: turno {r.mejor.turno} ({pc(r.mejor.rendimiento)})</p>}
              {r.peor && <p>Más bajo: turno {r.peor.turno} ({pc(r.peor.rendimiento)})</p>}
              <p className={cn('mt-1', r.conAlerta ? 'font-medium text-amber-800' : 'text-muted-foreground')}>
                {r.conAlerta
                  ? `⚠ ${r.conAlerta} animal(es) con alerta`
                  : 'Sin alertas'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Alerta si el rendimiento sale de {RANGO_RENDIMIENTO.min}–{RANGO_RENDIMIENTO.max} % o las medias difieren más de {DIF_MEDIAS_MAX_KG} kg.
              </p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ===================== Informe de sacrificio =====================

function InformeSacrificio() {
  const [detalle, setDetalle] = useState<InformeSacrificioRow | null>(null);

  return (
    <>
      <ListadoOrdenes<InformeSacrificioRow> tipo="sacrificio" titulo="Órdenes de sacrificio" archivo="ordenes-sacrificio"
        descripcion="Consulta las guías y los animales sacrificados por orden."
        estados={ESTADO_LABEL} campos={['orden', 'cliente', 'guia', 'animales', 'fecha']}
        columnas={['OS No.', 'Cliente', 'Guía', 'Animales', 'Fecha de sacrificio']} abrir={setDetalle}
        celdas={celdasOrdenBeneficio} />
      {detalle && <DetalleSacrificioDialog orden={detalle} onClose={() => setDetalle(null)} />}
    </>
  );
}

function DetalleSacrificioDialog({
  orden,
  onClose,
}: {
  orden: InformeSacrificioRow;
  onClose: () => void;
}) {
  const detalle = useDetalleSacrificio(orden.id);
  const { user } = useAuth();
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);
  const d = detalle.data;
  const filas = d ? filasSacrificio(d) : [];
  const cab = 'border border-border bg-muted px-2 py-2 text-xs font-semibold uppercase';
  const cel = 'border border-border px-2 py-1.5';

  async function exportar(tipo: 'pdf' | 'excel') {
    if (!d) return;
    setExportando(tipo);
    try {
      if (tipo === 'pdf') await descargarSacrificioPdf(d, user?.fullName ?? '');
      else await descargarSacrificioExcel(d, user?.fullName ?? '');
    } finally {
      setExportando(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reporte beneficio de animales orden/lote No. ${formatOB(orden.reference)}`}
      description={`${orden.cliente} · ${orden.date}${d?.finca ? ` · ${d.finca}` : ''}`}
      className="max-w-6xl"
      scrollInterno
    >
      <div className="space-y-4">
        <EncabezadoInforme />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="h-9"
            onClick={() => detalle.refetch()}
            disabled={detalle.isFetching}
            title="Actualizar"
          >
            <RefreshCw className={cn('size-4', detalle.isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('excel')}
            disabled={!filas.length || exportando !== null}
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="size-4 text-emerald-700" />
            {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('pdf')}
            disabled={!filas.length || exportando !== null}
            title="Exportar a PDF"
          >
            <FileDown className="size-4 text-red-700" />
            {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </Button>
        </div>

        {detalle.isLoading || !d ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <table className="w-full border-collapse text-center text-sm">
              <tbody>
                <tr>
                  <td className={cn(cab, 'text-center text-base')} colSpan={3}>
                    {tituloSacrificio(d)}
                  </td>
                </tr>
                <tr>
                  <th className={cn(cab, 'w-1/5 text-center')}>Fecha de proceso</th>
                  <th className={cn(cab, 'text-center')} colSpan={2}>
                    Cliente
                  </th>
                </tr>
                <tr>
                  <td className={cel}>{d.date}</td>
                  <td className={cel} colSpan={2}>
                    {clienteTexto(d)}
                  </td>
                </tr>
                <tr>
                  <th className={cn(cab, 'text-center')} colSpan={3}>
                    Guías de movilización de animales en pie
                  </th>
                </tr>
                <tr>
                  <th className={cn(cab, 'text-center')}>No.</th>
                  <th className={cn(cab, 'text-center')}>Proveedor</th>
                  <th className={cn(cab, 'text-center')}>Procedencia</th>
                </tr>
                {guiasEncabezado(d).map((g) => (
                  <tr key={g.guia}>
                    <td className={cn(cel, 'tabular-nums')}>{g.guia}</td>
                    <td className={cel}>{g.proveedor ?? '—'}</td>
                    <td className={cel}>{g.procedencia ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0">
                  <tr>
                    <th className={cn(cab, 'text-center')} rowSpan={2}>No.</th>
                    {GRUPOS_SACRIFICIO.slice(0, 3).map((g) => (
                      <th key={g.titulo} className={cn(cab, 'text-center')} colSpan={g.columnas.length}>
                        {g.titulo}
                      </th>
                    ))}
                    <th className={cn(cab, 'text-center')} rowSpan={2}>RND(%)</th>
                    <th className={cn(cab, 'text-center')} colSpan={GRUPOS_SACRIFICIO[3].columnas.length}>
                      {GRUPOS_SACRIFICIO[3].titulo}
                    </th>
                  </tr>
                  <tr>
                    {GRUPOS_SACRIFICIO.flatMap((g) => g.columnas).map((c) => (
                      <th key={c} className={cn(cab, 'text-center')}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-center tabular-nums">
                  {filas.map((f) => (
                    <tr key={f.turno} className="even:bg-muted/30">
                      <td className={cel}>{f.no}</td>
                      <td className={cel}>{f.guia}</td>
                      <td className={cel}>{f.ref}</td>
                      <td className={cel}>{f.tipo}</td>
                      <td className={cel}>{f.codigo}</td>
                      <td className={cn(cel, 'font-semibold')}>{f.turno}</td>
                      <td className={cn(cel, 'font-semibold')}>{f.gancho}</td>
                      <td className={cn(cel, 'text-right')}>{num(f.pep)}</td>
                      <td className={cn(cel, 'text-right font-semibold')}>{num(f.pec)}</td>
                      <td className={cn(cel, 'text-right')}>{num(f.pecf)}</td>
                      <td className={cn(cel, 'text-right')}>{num(f.piel)}</td>
                      <td className={cn(cel, 'text-right font-semibold')}>{num(f.rnd)}</td>
                      <td className={cel}>{f.observacion}</td>
                      <td className={cel}>{f.ubicacion}</td>
                      <td className={cel}>{f.destino}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(() => {
              const c = conteoAnimales(d);
              return (
                <table className="w-full border-collapse text-center text-sm">
                  <thead>
                    <tr>
                      <th className={cn(cab, 'text-center')} colSpan={8}>Animales</th>
                    </tr>
                    <tr>
                      <th className={cn(cab, 'text-center')} colSpan={2}>Sexo</th>
                      <th className={cn(cab, 'text-center')} colSpan={6}>Tipo</th>
                    </tr>
                    <tr>
                      {['Hembras', 'Machos', ...TIPOS_ANIMAL.map(([, t]) => t)].map((h) => (
                        <th key={h} className={cn(cab, 'text-center')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-base font-bold tabular-nums">
                      <td className={cel}>{c.hembras}</td>
                      <td className={cel}>{c.machos}</td>
                      {TIPOS_ANIMAL.map(([t]) => (
                        <td key={t} className={cel}>
                          {c.tipos[t]}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              );
            })()}

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(cab, 'text-center')} colSpan={7}>Totales</th>
                </tr>
                <tr>
                  {['Animales', 'PEP(kg)', 'PIEL(kg)', 'SEBO(kg)', 'PEC(kg)', 'PROM(kg)', 'RND(%)'].map((c) => (
                    <th key={c} className={cn(cab, 'text-center')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="text-center text-base font-bold tabular-nums">
                  <td className={cel}>{d.totales.animales}</td>
                  <td className={cel}>{num(d.totales.pepKg)}</td>
                  <td className={cel}>{num(d.totales.pielKg)}</td>
                  <td className={cel}>{num(d.totales.seboKg)}</td>
                  <td className={cel}>{num(d.totales.pecKg)}</td>
                  <td className={cel}>{num(d.totales.promedioKg)}</td>
                  <td className={cel}>{num(d.totales.rendimiento)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs font-semibold text-muted-foreground">{LEYENDA_SACRIFICIO}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ===================== Informe de proceso general =====================

function InformeProceso() {
  const [detalle, setDetalle] = useState<InformeProcesoRow | null>(null);

  return (
    <>
      <ListadoOrdenes<InformeProcesoRow> tipo="proceso-general" titulo="Órdenes de proceso general" archivo="ordenes-proceso-general"
        descripcion="Consulta la trazabilidad de la orden, desde el ingreso hasta los subproductos."
        estados={ESTADO_LABEL} campos={['orden', 'cliente', 'guia', 'animales', 'fecha']}
        columnas={['OS No.', 'Cliente', 'Guía', 'Sacrificados', 'Fecha']} abrir={setDetalle}
        celdas={celdasOrdenBeneficio} />
      {detalle && <DetalleProcesoDialog orden={detalle} onClose={() => setDetalle(null)} />}
    </>
  );
}

function celdasOrdenBeneficio(r: InformeSacrificioRow) {
  return [formatOB(r.reference), r.cliente, r.guias.join(', ') || '—', `${r.sacrificados} / ${r.animalCount}`, r.date];
}


function DetalleProcesoDialog({
  orden,
  onClose,
}: {
  orden: InformeProcesoRow;
  onClose: () => void;
}) {
  const detalle = useDetalleProceso(orden.id);
  const { user } = useAuth();
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);
  const d = detalle.data;
  const cab = 'border border-border bg-muted px-2 py-1.5 text-[11px] font-semibold uppercase';
  const cel = 'border border-border px-2 py-1';

  async function exportar(tipo: 'pdf' | 'excel') {
    if (!d) return;
    setExportando(tipo);
    try {
      if (tipo === 'pdf') await descargarProcesoPdf(d, user?.fullName ?? '');
      else await descargarProcesoExcel(d, user?.fullName ?? '');
    } finally {
      setExportando(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Informe de proceso general OS No.: ${formatOB(orden.reference)}`}
      description={`${orden.cliente} · ${orden.date} · Guía ${orden.guias.join(', ') || '—'}`}
      className="max-w-[min(96vw,1500px)]"
      scrollInterno
    >
      <div className="space-y-5">
        <EncabezadoInforme />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="h-9"
            onClick={() => detalle.refetch()}
            disabled={detalle.isFetching}
            title="Actualizar"
          >
            <RefreshCw className={cn('size-4', detalle.isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('excel')}
            disabled={!d || exportando !== null}
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="size-4 text-emerald-700" />
            {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => exportar('pdf')}
            disabled={!d || exportando !== null}
            title="Exportar a PDF"
          >
            <FileDown className="size-4 text-red-700" />
            {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </Button>
        </div>

        {detalle.isLoading || !d ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            {/* Totales */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {totalesResumen(d).map(([k, v]) => (
                <div key={k} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</div>
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>

            {/* Orden, guía y peso en pie */}
            <div className="grid gap-3 lg:grid-cols-3">
              {bloquesResumen(d).map((b) => (
                <table key={b.titulo} className="w-full self-start border-collapse text-sm">
                  <thead>
                    <tr>
                      <th colSpan={2} className={cn(cab, 'text-center')}>
                        {b.titulo}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.datos.map(([k, v]) => (
                      <tr key={k}>
                        <td className={cn(cel, 'w-44 bg-muted/40 font-medium')}>{k}</td>
                        <td className={cn(cel, 'tabular-nums')}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>

            {/* Personal */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {personal(d).map(([k]) => (
                    <th key={k} className={cn(cab, 'text-center')}>
                      Personal {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="text-center">
                  {personal(d).map(([k, v]) => (
                    <td key={k} className={cel}>
                      {v}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* Proceso por animal */}
            <div>
              <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide">Proceso por animal</h3>
              <div className="overflow-auto rounded-md border border-border">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0">
                    <tr>
                      {COLUMNAS_ANIMALES.map((c) => (
                        <th key={c.key} className={cn(cab, 'whitespace-nowrap text-center')}>
                          {c.titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {d.animales.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNAS_ANIMALES.length} className={cn(cel, 'py-6 text-center text-muted-foreground')}>
                          Aún no hay animales sacrificados en esta orden.
                        </td>
                      </tr>
                    ) : (
                      filasAnimales(d).map((f) => (
                        <tr key={f.turno} className="even:bg-muted/30">
                          {COLUMNAS_ANIMALES.map((c) => (
                            <td
                              key={c.key}
                              className={cn(
                                cel,
                                c.tipo ? 'text-right' : 'whitespace-nowrap',
                                c.key === 'observacion' && 'whitespace-normal',
                                c.resaltar && 'font-semibold',
                              )}
                            >
                              {textoCelda(f, c)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subproductos */}
            <div>
              <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide">Subproductos</h3>
              {d.subproductos.length === 0 ? (
                <p className="rounded-md border border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  No hay subproductos registrados en esta orden.
                </p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {COLUMNAS_SUBPRODUCTOS.map((c) => (
                        <th key={c} className={cn(cab, 'text-center')}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {filasSubproductos(d).map((s) => (
                      <tr key={s.codigo + s.producto} className="even:bg-muted/30">
                        <td className={cn(cel, 'text-center')}>{s.codigo}</td>
                        <td className={cel}>{s.producto}</td>
                        <td className={cn(cel, 'text-center')}>{s.unidad}</td>
                        <td className={cn(cel, 'text-center')}>{s.animales}</td>
                        <td className={cn(cel, 'text-center')}>{s.unidades ?? '—'}</td>
                        <td className={cn(cel, 'text-right')}>{numProceso(s.kg, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="text-xs font-semibold text-muted-foreground">{LEYENDA_PROCESO}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

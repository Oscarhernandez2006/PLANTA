import { Fragment, useState, type ComponentType, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Beef,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Factory,
  FlaskConical,
  Tags,
  Layers,
  LoaderCircle,
  Package,
  Scale,
  ThermometerSnowflake,
  ThermometerSun,
  Truck,
  Zap,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { CANAL_TIPO_LABEL } from '../canal-caliente/api';
import { formatOB } from '../registrar/orden-beneficio-api';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { formatOT } from '../registrar/orden-traslado-api';
import { formatOC } from '../registrar/orden-acondicionamiento-api';
import { fecha, kg } from './BodegasTab';
import { TrazabilidadEtiquetaDialog } from './TrazabilidadEtiquetaDialog';
import {
  useTrazabilidadCanal,
  type EstadoTrazabilidad,
  type ProductoResumen,
  type TrazabilidadCanal,
} from './api';

/** Estado de una orden interna (OD, OP, OT, OC): "facturado" en BD significa cerrada, no facturada. */
export const estadoOrden = (s: string) =>
  s === 'activo' ? 'ACTIVA' : s === 'facturado' ? 'CERRADA' : s === 'inactivo' ? 'ANULADA' : s.toUpperCase();

const PIEZA: Record<TrazabilidadCanal['pieza'], string> = {
  canal: 'CANAL',
  cizq: 'MEDIA CANAL IZQUIERDA',
  cder: 'MEDIA CANAL DERECHA',
};

const ESTADO: Record<EstadoTrazabilidad, { label: string; className: string }> = {
  disponible: { label: 'DISPONIBLE EN CAVA', className: 'bg-emerald-600 text-white' },
  en_proceso: { label: 'EN PROCESO (DESPOSTE)', className: 'bg-amber-400 text-amber-950' },
  procesada: { label: 'PROCESADA', className: 'bg-violet-600 text-white' },
  en_despacho: { label: 'EN DESPACHO', className: 'bg-sky-100 text-sky-900 ring-1 ring-sky-400' },
  despachada: { label: 'DESPACHADA', className: 'bg-sky-600 text-white' },
  sin_cava: { label: 'SIN UBICACIÓN', className: 'bg-muted text-muted-foreground' },
};

export const fechaHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const kgs = (n: number | null | undefined) => (n == null ? '—' : `${kg(n)} kg`);

function barcodeDe(t: TrazabilidadCanal) {
  return t.canalTipo
    ? codigoBarras({
        lote: t.ordenBeneficio.reference,
        turno: t.turno ?? t.sacrificio.sequence,
        canalTipo: t.canalTipo,
        pieza: t.pieza,
      })
    : '—';
}

/** Informe de trazabilidad de una canal: desde la guía hasta su despacho. */
export function TrazabilidadCanalDialog({
  piezaId,
  onClose,
}: {
  piezaId: string;
  onClose: () => void;
}) {
  const { data: t, isLoading, isError } = useTrazabilidadCanal(piezaId);
  const [etiquetaId, setEtiquetaId] = useState<string | null>(null);

  if (etiquetaId) return <TrazabilidadEtiquetaDialog id={etiquetaId} onClose={() => setEtiquetaId(null)} />;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Trazabilidad de la canal"
      description={t ? `${barcodeDe(t)} · ${t.ordenBeneficio.cliente}` : undefined}
      className="max-w-4xl"
      scrollInterno
    >
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : isError || !t ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No se pudo cargar la trazabilidad de esta canal.
        </p>
      ) : (
        <InformeCanal t={t} onEtiqueta={setEtiquetaId} />
      )}
    </Dialog>
  );
}

/** Pasos de la canal (camión → despacho a proceso) para insertarlos en la línea de tiempo de una etiqueta. */
export function PasosCanal({ piezaId }: { piezaId: string }) {
  const { data: t, isLoading, isError } = useTrazabilidadCanal(piezaId);
  if (isLoading)
    return (
      <li className="flex justify-center py-6 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </li>
    );
  if (isError || !t) return <li className="text-sm text-muted-foreground">No se pudo cargar la canal de origen.</li>;
  return <InformeCanal t={t} onEtiqueta={() => {}} hastaProceso />;
}

function InformeCanal({
  t,
  onEtiqueta,
  hastaProceso,
}: {
  t: TrazabilidadCanal;
  onEtiqueta: (id: string) => void;
  hastaProceso?: boolean;
}) {
  const [soloCanal, setSoloCanal] = useState(true);
  const estado = ESTADO[t.estado];
  const dc = t.despachoCanal;
  const od = t.despachoProceso;
  const pesoFinal = dc?.despachoKg ?? od?.despachoKg ?? null;
  const merma = pesoFinal != null ? t.canal.pesoKg - pesoFinal : null;
  const filtrar = soloCanal && !!od?.asignacionPorCanal;
  const transformaciones = (od?.transformaciones ?? []).filter((tr) => !filtrar || tr.deEstaCanal);
  const despachos = (od?.despachos ?? [])
    .map((d) => ({ ...d, items: d.items.filter((i) => !filtrar || i.deEstaCanal) }))
    .filter((d) => d.items.length > 0);
  const etiquetasVista = (od?.etiquetas ?? []).filter((x) => !filtrar || x.deEstaCanal);

  return (
    <Envoltura soloPasos={!!hastaProceso}>
      {!hastaProceso && (
      <div className="grid grid-cols-2 gap-3 rounded-md border-2 border-border p-4 sm:grid-cols-4">
        <Dato label="Barcode" valor={<span className="text-lg font-bold">{barcodeDe(t)}</span>} />
        <Dato label="Pieza" valor={PIEZA[t.pieza]} />
        <Dato label="Peso caliente" valor={kgs(t.canal.pesoKg)} />
        <Dato
          label="Estado actual"
          valor={
            <span className={cn('rounded-sm px-2 py-0.5 text-xs font-bold', estado.className)}>
              {estado.label}
              {dc && ` · ${formatDC(dc.dcNumber)}`}
              {!dc && od && ` · ${formatOD(od.odNumber)}`}
            </span>
          }
        />
        <Dato label="Orden de beneficio" valor={formatOB(t.ordenBeneficio.reference)} />
        <Dato label="Turno" valor={t.turno ?? '—'} />
        <Dato label="Ubicación" valor={t.cavaActual ?? (dc || od ? `Salió de ${dc?.cavaOrigen ?? od?.cavaOrigen}` : '—')} />
        <Dato
          label="Peso final"
          valor={pesoFinal != null ? `${kgs(pesoFinal)} (merma ${kg(merma!)} kg)` : '—'}
        />
      </div>
      )}

      <Linea soloPasos={!!hastaProceso}>
        <Paso
          icon={Truck}
          titulo="Recepción · Peso en camión"
          at={t.guia?.createdAt}
          operario={t.guia?.registradaPor}
          vacio={!t.guia && `Guía${t.guias.length > 1 ? 's' : ''} ${t.guias.join(', ') || '—'} (sin registro en Peso en Camión).`}
        >
          {t.guia && (
            <Grid>
              <Dato label="Guía" valor={t.guia.guia ?? '—'} />
              <Dato label="Referencia BC" valor={t.guia.bcReference} />
              <Dato label="Fecha" valor={fecha(t.guia.date)} />
              <Dato label="Lote / finca" valor={t.guia.referenciaLote ?? '—'} />
              <Dato label="Proveedor" valor={t.guia.proveedor ?? '—'} />
              <Dato label="Procedencia" valor={t.guia.procedencia ?? '—'} />
              <Dato label="Placa" valor={t.guia.placa ?? '—'} />
              <Dato label="Conductor" valor={t.guia.conductor ?? '—'} />
              <Dato label="Animales" valor={t.guia.cantidad ?? '—'} />
              <Dato label="Entrada / salida" valor={`${kgs(t.guia.entradaKg)} / ${kgs(t.guia.salidaKg)}`} />
              <Dato label="Neto" valor={kgs(t.guia.netoKg)} />
              <Dato label="Promedio por animal" valor={kgs(t.guia.promedioKg)} />
              {t.guia.observaciones && <Dato label="Observaciones" valor={t.guia.observaciones} ancho />}
            </Grid>
          )}
        </Paso>

        <Paso
          icon={Scale}
          titulo="Peso en pie"
          at={t.pie?.pesadoAt}
          operario={t.pie?.operario}
          vacio={!t.pie && 'No se encontró el registro de Peso en Pie de este animal.'}
        >
          {t.pie && (
            <>
              <Grid>
                <Dato label="Referencia BP" valor={t.pie.bpReference} />
                <Dato label="Animal en la guía" valor={`#${t.pie.reference}`} />
                <Dato label="Corral" valor={t.pie.corral ?? '—'} />
                <Dato label="Sexo / tipo" valor={t.pie.tipoAnimal ?? '—'} />
                <Dato label="Tipo de pesaje" valor={t.pie.tipoPesaje.toUpperCase()} />
                <Dato label="Peso inicial" valor={kgs(t.pie.pesoInicialKg)} />
                <Dato label="Peso final" valor={kgs(t.pie.pesoActualKg)} />
                {t.pie.observaciones && <Dato label="Observaciones" valor={t.pie.observaciones} ancho />}
              </Grid>
              {t.pie.repesajes.length > 0 && (
                <Tabla
                  columnas={['Repesaje', 'Anterior', 'Nuevo', 'Merma', 'Fecha', 'Operario']}
                  filas={t.pie.repesajes.map((r) => [
                    `Ronda ${r.ronda}`,
                    kgs(r.pesoAnteriorKg),
                    kgs(r.pesoNuevoKg),
                    kgs(r.mermaKg),
                    fechaHora(r.at),
                    r.operario ?? '—',
                  ])}
                />
              )}
            </>
          )}
        </Paso>

        <Paso
          icon={ClipboardList}
          titulo={`Orden de beneficio ${formatOB(t.ordenBeneficio.reference)}`}
          at={t.ordenBeneficio.createdAt}
          operario={t.ordenBeneficio.creadaPor}
        >
          <Grid>
            <Dato label="Fecha" valor={fecha(t.ordenBeneficio.date)} />
            <Dato label="Cliente" valor={t.ordenBeneficio.cliente} />
            <Dato label="Animales en la orden" valor={t.ordenBeneficio.animalCount} />
            <Dato label="Estado" valor={t.ordenBeneficio.status.toUpperCase()} />
            <Dato label="Subproductos para" valor={t.ordenBeneficio.subproductoDestino.toUpperCase()} />
            {t.ordenBeneficio.observaciones && (
              <Dato label="Observaciones" valor={t.ordenBeneficio.observaciones} ancho />
            )}
          </Grid>
        </Paso>

        <Paso icon={Zap} titulo="Sacrificio" at={t.sacrificio.at} operario={t.sacrificio.operario}>
          <Grid>
            <Dato label="Animal en la orden" valor={`A${String(t.sacrificio.sequence).padStart(2, '0')}`} />
            <Dato label="Turno" valor={t.turno ?? '—'} />
          </Grid>
        </Paso>

        <Paso
          icon={Layers}
          titulo="Pieles"
          at={t.piel?.at}
          operario={t.piel?.operario}
          vacio={!t.piel && 'No se registró el peso de la piel.'}
        >
          {t.piel && (
            <Grid>
              <Dato label="Peso de la piel" valor={kgs(t.piel.kg)} />
            </Grid>
          )}
        </Paso>

        <Paso icon={Beef} titulo="Canal caliente" at={t.canal.weighedAt} operario={t.canal.operario}>
          <Grid>
            <Dato label="Tipo de animal" valor={(t.canal.tipoAnimal ?? '—').toUpperCase()} />
            <Dato label="Tipo de canal" valor={t.canal.canalTipo ? CANAL_TIPO_LABEL[t.canal.canalTipo].toUpperCase() : '—'} />
            <Dato label="Con cola" valor={t.canal.conCola == null ? '—' : t.canal.conCola ? 'SÍ' : 'NO'} />
            <Dato label="Expendio" valor={t.canal.expendio ?? '—'} />
            <Dato label="Bodega" valor={t.canal.bodega ?? '—'} />
            <Dato label="Destino" valor={t.canal.destino?.trim() || '—'} />
            {t.canal.observaciones?.trim() && <Dato label="Observaciones" valor={t.canal.observaciones} ancho />}
          </Grid>
          <Tabla
            columnas={['Piezas del animal', 'Turno', 'Peso']}
            filas={t.canal.piezasAnimal.map((p) => [
              <span className={cn(p.actual && 'font-bold text-emerald-700')}>
                {PIEZA[p.pieza]}
                {p.actual && ' ← esta'}
              </span>,
              p.turno ?? '—',
              kgs(p.pesoKg),
            ])}
          />
        </Paso>

        <Paso
          icon={ArrowLeftRight}
          titulo="Movimientos de cava"
          vacio={!t.traslados.length && `Sin traslados registrados${t.cavaActual ? ` · ubicada en ${t.cavaActual}` : ''}.`}
        >
          {t.traslados.length > 0 && (
            <Tabla
              columnas={['Origen', 'Destino', 'Motivo', 'Fecha', 'Operario']}
              filas={t.traslados.map((m) => [
                m.cavaOrigen ?? '—',
                m.cavaDestino,
                m.motivo,
                fechaHora(m.at),
                m.operario ?? '—',
              ])}
            />
          )}
        </Paso>

        <Paso
          icon={Package}
          titulo="Subproductos del animal"
          vacio={!t.subproductos.length && 'No hay subproductos registrados para este animal.'}
        >
          {t.subproductos.length > 0 && (
            <Tabla
              columnas={['Producto', 'Cantidad', 'Cava', 'Fecha', 'Operario']}
              filas={t.subproductos.map((s) => [
                s.label.toUpperCase(),
                s.unidad === 'kg' ? kgs(s.pesoKg) : `${s.cantidad ?? 1} und`,
                s.cava ? (s.cava === '3' ? 'SUBPRODUCTO DESPACHO' : `SUBPRODUCTO ${s.cava}`) : '—',
                fechaHora(s.at),
                s.operario ?? '—',
              ])}
            />
          )}
        </Paso>

        {od && (
          <Paso
            icon={Factory}
            titulo={`Despacho a proceso ${formatOD(od.odNumber)}`}
            at={od.pistoleadaAt}
            operario={od.operario}
          >
            <Grid>
              <Dato label="Cliente" valor={od.cliente} />
              <Dato label="Fecha de proceso" valor={fecha(od.processDate)} />
              <Dato label="Salió de" valor={od.cavaOrigen} />
              <Dato label="Peso caliente" valor={kgs(od.pesoCalienteKg)} />
              <Dato label="Peso frío" valor={kgs(od.despachoKg)} />
              <Dato label="Estado" valor={od.cerradaAt ? `CERRADA ${fechaHora(od.cerradaAt)}` : 'ACTIVA'} />
            </Grid>
            {od.ordenesProduccion.length > 0 && (
              <Tabla
                columnas={['Orden de producción', 'Fecha de proceso', 'Estado', 'Etiquetas rotuladas']}
                filas={od.ordenesProduccion.map((op) => [
                  formatOP(op.opNumber),
                  fecha(op.processDate),
                  estadoOrden(op.status),
                  op.etiquetas,
                ])}
              />
            )}
          </Paso>
        )}

        {!hastaProceso && od && od.ordenesProduccion.length > 0 && (
          <Paso
            icon={Tags}
            titulo={`Desposte · productos obtenidos en ${od.ordenesProduccion.map((o) => formatOP(o.opNumber)).join(', ')}`}
            vacio={!od.etiquetas.length && 'La orden de producción todavía no tiene etiquetas rotuladas.'}
          >
            <ProductosObtenidos
              od={od}
              filtrar={filtrar}
              soloCanal={soloCanal}
              onSoloCanal={setSoloCanal}
              onEtiqueta={onEtiqueta}
            />
          </Paso>
        )}

        {!hastaProceso && transformaciones.map((tr) => (
          <Paso
            key={tr.ocNumber}
            icon={FlaskConical}
            titulo={`Transformación · acondicionamiento ${formatOC(tr.ocNumber)} ← ${formatOT(tr.otNumber)}`}
          >
            <Transformacion tr={tr} filtrar={filtrar} onEtiqueta={onEtiqueta} />
          </Paso>
        ))}

        {!hastaProceso && despachos.map((d) => (
          <Paso
            key={d.dcNumber}
            icon={Truck}
            titulo={`Productos despachados · ${formatDC(d.dcNumber)}`}
            at={d.cerradaAt}
          >
            <Grid>
              <Dato label="Cliente" valor={d.cliente} />
              <Dato label="Fecha de despacho" valor={fecha(d.processDate)} />
              <Dato label="Estado" valor={d.cerrada ? 'CERRADA · SALIÓ DE PLANTA' : 'ACTIVA · EN ALISTAMIENTO'} />
              <Dato
                label={filtrar ? 'De esta canal' : 'De este lote'}
                valor={`${d.items.reduce((s, i) => s + i.unds, 0)} und · ${kgs(d.items.reduce((s, i) => s + i.netoKg, 0))}`}
              />
            </Grid>
            <Tabla
              columnas={['Código de barras', 'Producto', 'Origen', 'Unds', 'Neto despacho', 'Pistoleado', 'Operario']}
              filas={d.items.map((i) => [
                <b>{i.codigo}</b>,
                `${i.productoCodigo} - ${i.productoNombre}`,
                i.origen === 'acondicionamiento' ? 'ACONDICIONADO' : 'DESPOSTE',
                i.unds,
                kgs(i.netoKg),
                fechaHora(i.at),
                i.operario,
              ])}
            />
          </Paso>
        ))}

        {dc && (
          <Paso
            icon={dc.tipo === 'caliente' ? ThermometerSun : ThermometerSnowflake}
            titulo={`Despacho ${dc.tipo === 'caliente' ? 'caliente' : 'frío'} ${formatDC(dc.dcNumber)} · canal completa`}
            at={dc.pistoleadaAt}
            operario={dc.operario}
          >
            <p className="text-xs text-muted-foreground">
              La canal no entró a proceso: salió de planta como canal en esta orden de despacho.
            </p>
            <Grid>
              <Dato label="Cliente" valor={dc.cliente} />
              <Dato label="NIT" valor={dc.clienteNit ?? '—'} />
              <Dato label="Fecha de registro" valor={fecha(dc.registrationDate)} />
              <Dato label="Fecha de despacho" valor={fecha(dc.processDate)} />
              <Dato label="Orden creada por" valor={`${dc.creadaPor ?? '—'} · ${fechaHora(dc.creadaAt)}`} />
              <Dato label="Salió de" valor={dc.cavaOrigen} />
              <Dato label="Estado" valor={dc.cerradaAt ? `CERRADA ${fechaHora(dc.cerradaAt)}` : 'ACTIVA'} />
              <Dato label="Tipo" valor={dc.tipo === 'caliente' ? 'DESPACHO EN CALIENTE' : 'DESPACHO EN FRÍO'} />
              <Dato label="Peso caliente" valor={kgs(dc.pesoCalienteKg)} />
              <Dato label="Peso de despacho" valor={kgs(dc.despachoKg)} />
              <Dato
                label="Merma"
                valor={dc.despachoKg != null ? kgs(dc.pesoCalienteKg - dc.despachoKg) : '—'}
              />
              <Dato
                label="Total de la orden"
                valor={`${dc.canalesOrden} canal(es) · ${kgs(dc.kgDespachoOrden || dc.kgCalienteOrden)}`}
              />
            </Grid>
          </Paso>
        )}

        {!hastaProceso && (
        <Paso
          icon={CircleCheck}
          titulo={estado.label}
          at={dc?.cerradaAt ?? od?.cerradaAt ?? null}
          final
        >
          <p className="text-sm text-muted-foreground">
            {t.estado === 'despachada' && `La orden ${formatDC(dc!.dcNumber)} se cerró y la canal salió de planta.`}
            {t.estado === 'en_despacho' &&
              `Está en la orden ${formatDC(dc!.dcNumber)}; sigue en planta hasta que se cierre la orden.`}
            {t.estado === 'en_proceso' && `Entró a desposte con la orden ${formatOD(od!.odNumber)}.`}
            {t.estado === 'procesada' &&
              `Se despostó con la orden ${formatOD(od!.odNumber)} (ya cerrada)${
                etiquetasVista.length
                  ? `: ${filtrar ? 'esta canal' : 'el lote'} se convirtió en ${etiquetasVista.length} producto(s) rotulado(s) · ${kg(etiquetasVista.reduce((s, x) => s + x.netoKg, 0))} kg.`
                  : '.'
              }${
                transformaciones.length ? ` ${transformaciones.length} transformación(es) en acondicionamiento.` : ''
              }${
                despachos.length
                  ? ` Productos despachados en ${despachos.map((d) => formatDC(d.dcNumber)).join(', ')}.`
                  : ''
              }`}
            {t.estado === 'disponible' && `Disponible en ${t.cavaActual}.`}
            {t.estado === 'sin_cava' && 'La canal no está ubicada en ninguna cava ni orden.'}
          </p>
        </Paso>
        )}
      </Linea>
    </Envoltura>
  );
}

function Envoltura({ soloPasos, children }: { soloPasos: boolean; children: ReactNode }) {
  return soloPasos ? <>{children}</> : <div className="space-y-5">{children}</div>;
}

function Linea({ soloPasos, children }: { soloPasos: boolean; children: ReactNode }) {
  return soloPasos ? <>{children}</> : <ol className="relative space-y-4 border-l-2 border-border pl-6">{children}</ol>;
}

export function Paso({
  icon: Icon,
  titulo,
  at,
  operario,
  vacio,
  final,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  titulo: string;
  at?: string | null;
  operario?: string | null;
  vacio?: string | false;
  final?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[2.35rem] top-0 flex size-8 items-center justify-center rounded-full border-2 bg-card',
          final ? 'border-emerald-600 text-emerald-700' : 'border-border text-foreground',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-base font-semibold uppercase">{titulo}</h3>
        {(at || operario) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {at && fechaHora(at)}
            {at && operario && ' · '}
            {operario}
          </p>
        )}
      </div>
      <div className="mt-2 space-y-2">
        {vacio ? <p className="text-sm text-muted-foreground">{vacio}</p> : children}
      </div>
    </li>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">{children}</div>;
}

export function Dato({ label, valor, ancho }: { label: string; valor: ReactNode; ancho?: boolean }) {
  return (
    <div className={cn('min-w-0', ancho && 'col-span-2 sm:col-span-4')}>
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium uppercase tabular-nums">{valor}</p>
    </div>
  );
}

type OdProceso = NonNullable<TrazabilidadCanal['despachoProceso']>;

function Transformacion({
  tr,
  filtrar,
  onEtiqueta,
}: {
  tr: OdProceso['transformaciones'][number];
  filtrar: boolean;
  onEtiqueta: (id: string) => void;
}) {
  const [verEtiquetas, setVerEtiquetas] = useState(false);
  const entradas = filtrar ? tr.entradasCanal : tr.entradas;
  const entraKg = entradas.reduce((s, p) => s + p.kg, 0);
  const totalEntraKg = tr.entradas.reduce((s, p) => s + p.kg, 0) + tr.otrasEntradasKg;
  const otrosKg = totalEntraKg - entraKg;
  const saleKg = tr.productos.reduce((s, p) => s + p.kg, 0);
  const dif = totalEntraKg > 0 && saleKg > 0 ? ((saleKg - totalEntraKg) / totalEntraKg) * 100 : null;
  return (
    <>
      <Grid>
        <Dato label="Proceso" valor={tr.proceso.toUpperCase()} />
        <Dato label="Traslado" valor={`${formatOT(tr.otNumber)} · ${fecha(tr.otProcessDate)}`} />
        <Dato label="Fecha de proceso" valor={fecha(tr.processDate)} />
        <Dato label="Estado" valor={tr.cerrada ? 'CERRADA' : 'ACTIVA'} />
      </Grid>
      <div className="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-amber-700">
            Antes · {filtrar ? 'de esta canal entró' : 'entró'} a proceso ({kgs(entraKg)})
          </p>
          <TablaProductos productos={entradas} />
          {otrosKg > 0.005 && (
            <p className="text-xs text-muted-foreground">
              El traslado también llevó {kgs(otrosKg)} de otras {filtrar ? 'canales u órdenes' : 'órdenes'}; lo que
              resultó es del conjunto ({kgs(totalEntraKg)}).
            </p>
          )}
        </div>
        <ArrowRight className="mx-auto mt-8 hidden size-6 text-muted-foreground lg:block" />
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-violet-700">
            Después · se convirtió en ({kgs(saleKg)}
            {dif != null && ` · ${dif >= 0 ? '+' : ''}${dif.toFixed(1).replace('.', ',')} %`})
          </p>
          {tr.productos.length ? (
            <TablaProductos productos={tr.productos} />
          ) : (
            <p className="text-sm text-muted-foreground">Sin productos rotulados todavía.</p>
          )}
        </div>
      </div>
      {tr.etiquetas.length > 0 && (
        <div>
          <button
            onClick={() => setVerEtiquetas((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold uppercase text-emerald-700 hover:underline"
          >
            {verEtiquetas ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Etiquetas resultantes ({tr.etiquetas.length})
          </button>
          {verEtiquetas && (
            <div className="mt-1 max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full whitespace-nowrap text-xs tabular-nums">
                <tbody className="divide-y divide-border">
                  {tr.etiquetas.map((x) => (
                    <tr
                      key={x.id}
                      onClick={() => onEtiqueta(x.id)}
                      title="Ver trazabilidad de la etiqueta"
                      className="cursor-pointer hover:bg-emerald-50 [&>td]:px-2 [&>td]:py-1"
                    >
                      <td className="font-semibold text-emerald-700">{x.codigo}</td>
                      <td className="uppercase">
                        {x.productoCodigo} - {x.productoNombre} · #{x.pieza}
                      </td>
                      <td className="font-semibold">
                        {x.dcNumber ? `${x.dcCerrada ? 'DESPACHADA' : 'EN DESPACHO'} ${formatDC(x.dcNumber)}` : 'DISPONIBLE'}
                      </td>
                      <td className="text-right">{kg(x.netoKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function TablaProductos({ productos }: { productos: ProductoResumen[] }) {
  const piezas = productos.reduce((s, p) => s + p.piezas, 0);
  const total = productos.reduce((s, p) => s + p.kg, 0);
  return (
    <Tabla
      columnas={['Código', 'Producto', 'Piezas', 'Kilos']}
      filas={[
        ...productos.map((p) => [p.codigo, p.nombre, p.piezas, kgs(p.kg)]),
        [<b>Total</b>, '', <b>{piezas}</b>, <b>{kgs(total)}</b>],
      ]}
    />
  );
}

function ProductosObtenidos({
  od,
  filtrar,
  soloCanal,
  onSoloCanal,
  onEtiqueta,
}: {
  od: OdProceso;
  filtrar: boolean;
  soloCanal: boolean;
  onSoloCanal: (v: boolean) => void;
  onEtiqueta: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const etiquetas = filtrar ? od.etiquetas.filter((x) => x.deEstaCanal) : od.etiquetas;
  const productos = filtrar ? od.productosCanal : od.productos;
  const totalKg = etiquetas.reduce((s, x) => s + x.netoKg, 0);
  const loteKg = od.etiquetas.reduce((s, x) => s + x.netoKg, 0);
  const rend = od.kgFrioOrden > 0 ? (loteKg / od.kgFrioOrden) * 100 : null;
  return (
    <>
      {od.asignacionPorCanal && (
        <div className="flex w-fit overflow-hidden rounded-md border border-border text-xs font-semibold uppercase">
          {[
            { v: true, label: 'Solo esta canal' },
            { v: false, label: 'Todo el lote' },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => onSoloCanal(o.v)}
              className={cn(
                'px-3 py-1.5',
                soloCanal === o.v ? 'bg-emerald-600 text-white' : 'bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {filtrar ? (
          <>
            De esta canal salieron <b>{etiquetas.length} producto(s) · {kg(totalKg)} kg</b>. Se asignan según el
            orden de desposte (el mismo del despacho a proceso) y las piezas por canal de cada producto.
          </>
        ) : (
          <>
            La canal se desposta junto con las demás de la orden ({od.canalesOrden} canal(es) ·{' '}
            {kg(od.kgFrioOrden)} kg frío). De ese lote salieron {od.etiquetas.length} producto(s) · {kg(loteKg)} kg
            {rend != null && ` (rendimiento ${rend.toFixed(1).replace('.', ',')} %)`}.
          </>
        )}{' '}
        Despliega un producto y haz clic en una etiqueta para ver su hoja de vida.
      </p>
      <div className="max-h-96 overflow-auto rounded-md border border-border">
        <table className="w-full whitespace-nowrap text-sm tabular-nums">
          <thead className="sticky top-0 bg-muted text-left">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:text-muted-foreground">
              <th />
              <th>Código</th>
              <th>Producto</th>
              <th className="text-right">Piezas</th>
              <th className="text-right">Kilos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {productos.map((p) => {
              const exp = abierto === p.codigo;
              return (
                <Fragment key={p.codigo}>
                  <tr
                    onClick={() => setAbierto(exp ? null : p.codigo)}
                    className="cursor-pointer hover:bg-muted/50 [&>td]:px-2 [&>td]:py-1"
                  >
                    <td className="w-6 text-muted-foreground">
                      {exp ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </td>
                    <td className="font-semibold">{p.codigo}</td>
                    <td className="uppercase">{p.nombre}</td>
                    <td className="text-right">{p.piezas}</td>
                    <td className="text-right font-semibold text-emerald-700">{kg(p.kg)}</td>
                  </tr>
                  {exp &&
                    etiquetas
                      .filter((x) => x.productoCodigo === p.codigo)
                      .map((x) => (
                        <tr
                          key={x.id}
                          onClick={() => onEtiqueta(x.id)}
                          title="Ver trazabilidad de la etiqueta"
                          className="cursor-pointer bg-muted/20 text-xs hover:bg-emerald-50 [&>td]:px-2 [&>td]:py-1"
                        >
                          <td />
                          <td className="font-semibold text-emerald-700">{x.codigo ?? '—'}</td>
                          <td className="uppercase">
                            #{x.pieza} · {formatOP(x.opNumber)} · {x.tienda} ·{' '}
                            <span className="font-semibold">
                              {x.dcNumber
                                ? `${x.dcCerrada ? 'DESPACHADA' : 'EN DESPACHO'} ${formatDC(x.dcNumber)}`
                                : x.otNumber
                                  ? `EN PROCESO ${formatOT(x.otNumber)}`
                                  : 'DISPONIBLE'}
                            </span>
                          </td>
                          <td />
                          <td className="text-right">{kg(x.netoKg)}</td>
                        </tr>
                      ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/50 font-semibold">
            <tr className="[&>td]:px-2 [&>td]:py-1.5">
              <td colSpan={3}>Total</td>
              <td className="text-right">{etiquetas.length}</td>
              <td className="text-right">{kg(totalKg)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export function Tabla({ columnas, filas }: { columnas: string[]; filas: ReactNode[][] }) {
  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full whitespace-nowrap text-sm tabular-nums">
        <thead className="bg-muted text-left">
          <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:text-muted-foreground">
            {columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((f, i) => (
            <tr key={i} className="[&>td]:px-2 [&>td]:py-1">
              {f.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

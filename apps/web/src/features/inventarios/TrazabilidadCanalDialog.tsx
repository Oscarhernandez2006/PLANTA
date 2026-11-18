import { Fragment, useState, type ReactNode } from 'react';
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
import { codigoBarras, type PresintoTicketData } from '../canal-caliente/canal-presinto-print';
import { imprimirPresintoDirecto } from '../canal-caliente/canal-presinto-zpl';
import { CANAL_ANIMAL_TIPO_LABEL, CANAL_TIPO_LABEL, type CanalAnimalTipo } from '../canal-caliente/api';
import { PresintoPreview } from '../canal-caliente/PresintoPreview';
import { formatOB } from '../registrar/orden-beneficio-api';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { formatOT } from '../registrar/orden-traslado-api';
import { formatOC } from '../registrar/orden-acondicionamiento-api';
import { fecha, kg } from './BodegasTab';
import { TrazabilidadEtiquetaDialog } from './TrazabilidadEtiquetaDialog';
import { descargarTrazabilidadPdf, type SeccionPdf } from './trazabilidad-pdf';
import {
  Acciones,
  Dato,
  Etapas,
  Grid,
  Linea,
  Paso,
  Resumen,
  Tabla,
  estadoOrden,
  fechaHora,
  kgs,
  type Etapa,
} from './trazabilidad-ui';
import {
  useTrazabilidadCanal,
  type EstadoTrazabilidad,
  type ProductoResumen,
  type TrazabilidadCanal,
} from './api';

export { Dato, Grid, Paso, Tabla, estadoOrden, fechaHora, kgs } from './trazabilidad-ui';

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

/** Media canal: la izquierda siempre va con cola y la derecha sin cola (igual que el presinto). */
function conColaDe(t: TrazabilidadCanal) {
  if (t.canal.conCola != null) return t.canal.conCola ? 'SÍ' : 'NO';
  if (t.canal.canalTipo === 'canal_completa') return '—';
  return t.pieza === 'cizq' ? 'SÍ' : t.pieza === 'cder' ? 'NO' : '—';
}

/** Datos del presinto de una pieza del animal, iguales a los que se imprimieron. */
function datosPresinto(
  t: TrazabilidadCanal,
  p: { pieza: TrazabilidadCanal['pieza']; pesoKg: number; turno: number | null },
): PresintoTicketData {
  const turno = p.turno ?? t.turno ?? t.sacrificio.sequence;
  return {
    fechaSacrificio: fecha(t.ordenBeneficio.date),
    lote: t.ordenBeneficio.reference,
    guia: t.guias.join(', ') || '—',
    expendio: t.canal.expendio ?? '',
    cliente: t.ordenBeneficio.cliente,
    tipoAnimal: t.canal.tipoAnimal
      ? (CANAL_ANIMAL_TIPO_LABEL[t.canal.tipoAnimal as CanalAnimalTipo] ?? t.canal.tipoAnimal.toUpperCase())
      : '—',
    ref: turno,
    turno,
    pesoKg: p.pesoKg,
    canalTipo: t.canal.canalTipo!,
    conCola: t.canal.conCola,
    pieza: p.pieza,
  };
}

/** Informe de trazabilidad de una canal: desde la guía hasta su despacho. */
export function TrazabilidadCanalDialog({
  piezaId,
  onClose,
  volver,
}: {
  piezaId: string;
  onClose: () => void;
  volver?: { label: string; onClick: () => void };
}) {
  const { data: t, isLoading, isError } = useTrazabilidadCanal(piezaId);
  const [etiquetaId, setEtiquetaId] = useState<string | null>(null);

  if (etiquetaId)
    return (
      <TrazabilidadEtiquetaDialog
        id={etiquetaId}
        onClose={onClose}
        volver={{ label: 'Volver a la canal', onClick: () => setEtiquetaId(null) }}
      />
    );

  const actual = t?.canal.piezasAnimal.find((p) => p.actual);

  return (
    <Dialog
      open
      onClose={onClose}
      volver={volver}
      title="Trazabilidad de la canal"
      description={t ? `${barcodeDe(t)} · ${t.ordenBeneficio.cliente}` : undefined}
      className="mt-0 max-h-[calc(100vh-3rem)] max-w-[min(94vw,88rem)]"
      scrollInterno
      subencabezado={t && <Etapas etapas={etapasCanal(t)} />}
      acciones={
        t && (
          <Acciones
            codigo={barcodeDe(t)}
            onReimprimir={
              t.canal.canalTipo
                ? async () => {
                    const r = await imprimirPresintoDirecto(
                      datosPresinto(t, { pieza: t.pieza, pesoKg: actual?.pesoKg ?? t.canal.pesoKg, turno: t.turno }),
                    );
                    return r.ok ? null : (r.error ?? 'No se pudo imprimir el presinto.');
                  }
                : undefined
            }
            onPdf={() => pdfCanal(t)}
          />
        )
      }
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

function etapasCanal(t: TrazabilidadCanal): Etapa[] {
  const od = t.despachoProceso;
  const dc = t.despachoCanal;
  return [
    { id: 'tc-guia', label: 'Guía', hecho: !!t.guia, tono: 'origen' },
    { id: 'tc-pie', label: 'Peso en pie', hecho: !!t.pie, tono: 'origen' },
    { id: 'tc-ob', label: 'Beneficio', hecho: true, tono: 'proceso' },
    { id: 'tc-canal', label: 'Canal caliente', hecho: true, tono: 'proceso' },
    { id: 'tc-cava', label: 'Cava', hecho: !!t.cavaActual || t.traslados.length > 0 || !!od || !!dc, tono: 'proceso' },
    ...(dc
      ? [{ id: 'tc-dc', label: `Despacho ${dc.tipo === 'caliente' ? 'caliente' : 'frío'}`, hecho: true, tono: 'salida' as const }]
      : [
          { id: 'tc-od', label: 'Desposte', hecho: !!od, tono: 'proceso' as const },
          { id: 'tc-despachos', label: 'Despacho', hecho: !!od?.despachos.length, tono: 'salida' as const },
        ]),
    { id: 'tc-final', label: 'Estado', hecho: true, tono: 'salida' },
  ];
}

/** Pasos de la canal (camión → despacho a proceso) para insertarlos en la línea de tiempo de una etiqueta. */
export function PasosCanal({ piezaId, canalCaliente }: { piezaId: string; canalCaliente?: ReactNode }) {
  const { data: t, isLoading, isError } = useTrazabilidadCanal(piezaId);
  if (isLoading)
    return (
      <li className="flex justify-center py-6 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </li>
    );
  if (isError || !t) return <li className="text-sm text-muted-foreground">No se pudo cargar la canal de origen.</li>;
  return <InformeCanal t={t} onEtiqueta={() => {}} hastaProceso canalCaliente={canalCaliente} />;
}

function InformeCanal({
  t,
  onEtiqueta,
  hastaProceso,
  canalCaliente,
}: {
  t: TrazabilidadCanal;
  onEtiqueta: (id: string) => void;
  hastaProceso?: boolean;
  /** Reemplaza el paso de canal caliente (la etiqueta muestra ahí el lote completo). */
  canalCaliente?: ReactNode;
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
  // Dentro de la trazabilidad de una etiqueta los ids se prefijan para no chocar con los suyos.
  const id = (s: string) => (hastaProceso ? `ec-${s}` : `tc-${s}`);
  const actual = t.canal.piezasAnimal.find((p) => p.actual);

  const pasos = (
    <>
      <Paso
        id={id('guia')}
        tono="origen"
        icon={Truck}
        titulo="Recepción · Peso en camión"
        at={t.guia?.createdAt}
        operario={t.guia?.registradaPor}
        vacio={!t.guia && `Guía${t.guias.length > 1 ? 's' : ''} ${t.guias.join(', ') || '—'} (sin registro en Peso en Camión).`}
      >
        {t.guia && (
          <Grid>
            <Dato resaltar label="Guía" valor={t.guia.guia ?? '—'} />
            <Dato resaltar label="Referencia BC" valor={t.guia.bcReference} />
            <Dato resaltar label="Fecha" valor={fecha(t.guia.date)} />
            <Dato resaltar label="Lote / finca" valor={t.guia.referenciaLote ?? '—'} />
            <Dato label="Proveedor" valor={t.guia.proveedor ?? '—'} />
            <Dato label="Procedencia" valor={t.guia.procedencia ?? '—'} />
            <Dato resaltar label="Placa" valor={t.guia.placa ?? '—'} />
            <Dato label="Conductor" valor={t.guia.conductor ?? '—'} />
            <Dato resaltar label="Animales" valor={t.guia.cantidad ?? '—'} />
            <Dato resaltar label="Entrada / salida" valor={`${kgs(t.guia.entradaKg)} / ${kgs(t.guia.salidaKg)}`} />
            <Dato resaltar label="Neto" valor={kgs(t.guia.netoKg)} />
            <Dato resaltar label="Promedio por animal" valor={kgs(t.guia.promedioKg)} />
            {t.guia.observaciones && <Dato label="Observaciones" valor={t.guia.observaciones} ancho />}
          </Grid>
        )}
      </Paso>

      <Paso
        id={id('pie')}
        tono="origen"
        icon={Scale}
        titulo="Peso en pie"
        at={t.pie?.pesadoAt}
        operario={t.pie?.operario}
        vacio={!t.pie && 'No se encontró el registro de Peso en Pie de este animal.'}
      >
        {t.pie && (
          <>
            <Grid>
              <Dato resaltar label="Referencia BP" valor={t.pie.bpReference} />
              <Dato resaltar label="Animal en la guía" valor={`#${t.pie.reference}`} />
              <Dato resaltar label="Corral" valor={t.pie.corral ?? '—'} />
              <Dato resaltar label="Sexo / tipo" valor={t.pie.tipoAnimal ?? '—'} />
              <Dato resaltar label="Tipo de pesaje" valor={t.pie.tipoPesaje.toUpperCase()} />
              <Dato resaltar label="Peso inicial" valor={kgs(t.pie.pesoInicialKg)} />
              <Dato resaltar label="Peso final" valor={kgs(t.pie.pesoActualKg)} />
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
        id={id('ob')}
        tono="proceso"
        icon={ClipboardList}
        titulo={`Orden de beneficio ${formatOB(t.ordenBeneficio.reference)}`}
        at={t.ordenBeneficio.createdAt}
        operario={t.ordenBeneficio.creadaPor}
      >
        <Grid>
          <Dato resaltar label="Fecha" valor={fecha(t.ordenBeneficio.date)} />
          <Dato resaltar label="Cliente" valor={t.ordenBeneficio.cliente} />
          <Dato resaltar label="Animales en la orden" valor={t.ordenBeneficio.animalCount} />
          <Dato resaltar label="Estado" valor={t.ordenBeneficio.status.toUpperCase()} />
          <Dato label="Subproductos para" valor={t.ordenBeneficio.subproductoDestino.toUpperCase()} />
          {t.ordenBeneficio.observaciones && <Dato label="Observaciones" valor={t.ordenBeneficio.observaciones} ancho />}
        </Grid>
      </Paso>

      <Paso id={id('sacrificio')} tono="proceso" icon={Zap} titulo="Sacrificio" at={t.sacrificio.at} operario={t.sacrificio.operario}>
        <Grid>
          <Dato resaltar label="Animal en la orden" valor={`A${String(t.sacrificio.sequence).padStart(2, '0')}`} />
          <Dato resaltar label="Turno" valor={t.turno ?? '—'} />
        </Grid>
      </Paso>

      <Paso
        id={id('piel')}
        tono="proceso"
        icon={Layers}
        titulo="Pieles"
        at={t.piel?.at}
        operario={t.piel?.operario}
        vacio={!t.piel && 'No se registró el peso de la piel.'}
      >
        {t.piel && (
          <Grid>
            <Dato resaltar label="Peso de la piel" valor={kgs(t.piel.kg)} />
          </Grid>
        )}
      </Paso>

      {canalCaliente ?? (
      <Paso id={id('canal')} tono="proceso" icon={Beef} titulo="Canal caliente" at={t.canal.weighedAt} operario={t.canal.operario}>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <Dato resaltar label="Tipo de animal" valor={(t.canal.tipoAnimal ?? '—').toUpperCase()} />
              <Dato resaltar label="Tipo de canal" valor={t.canal.canalTipo ? CANAL_TIPO_LABEL[t.canal.canalTipo].toUpperCase() : '—'} />
              <Dato label="Con cola" valor={conColaDe(t)} />
              <Dato resaltar label="Expendio" valor={t.canal.expendio?.trim() || '—'} />
              <Dato resaltar label="Bodega" valor={t.canal.bodega?.trim() || '—'} />
              <Dato resaltar label="Destino" valor={t.canal.destino?.trim() || '—'} />
            </div>
            {t.canal.observaciones?.trim() && <Dato label="Observaciones" valor={t.canal.observaciones} ancho />}
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
          </div>
          {t.canal.canalTipo && (
            <figure className="space-y-6 pt-10">
              {t.canal.piezasAnimal.map((p) => (
                // El presinto mide ~26 cm: se muestra a escala para que quepa al lado de los datos.
                <div key={p.id} style={{ zoom: 0.55 }}>
                  <PresintoPreview
                    className={cn(p.actual && t.canal.piezasAnimal.length > 1 && 'ring-4 ring-emerald-500')}
                    datos={datosPresinto(t, p)}
                  />
                </div>
              ))}
            </figure>
          )}
        </div>
      </Paso>
      )}

      <Paso
        id={id('cava')}
        tono="proceso"
        icon={ArrowLeftRight}
        titulo="Movimientos de cava"
        vacio={!t.traslados.length && `Sin traslados registrados${t.cavaActual ? ` · ubicada en ${t.cavaActual}` : ''}.`}
      >
        {t.traslados.length > 0 && (
          <Tabla
            columnas={['Origen', 'Destino', 'Motivo', 'Fecha', 'Operario']}
            filas={t.traslados.map((m) => [m.cavaOrigen ?? '—', m.cavaDestino, m.motivo, fechaHora(m.at), m.operario ?? '—'])}
          />
        )}
      </Paso>

      <Paso
        id={id('subproductos')}
        tono="proceso"
        icon={Package}
        titulo="Subproductos del animal"
        vacio="Módulo en construcción · próximamente."
      />

      {od && (
        <Paso id={id('od')} tono="proceso" icon={Factory} titulo={`Despacho a proceso ${formatOD(od.odNumber)}`} at={od.pistoleadaAt} operario={od.operario}>
          <Grid>
            <Dato resaltar label="Cliente" valor={od.cliente} />
            <Dato resaltar label="Fecha de proceso" valor={fecha(od.processDate)} />
            <Dato resaltar label="Salió de" valor={od.cavaOrigen} />
            <Dato resaltar label="Peso caliente" valor={kgs(od.pesoCalienteKg)} />
            <Dato resaltar label="Peso frío" valor={kgs(od.despachoKg)} />
            <Dato resaltar label="Estado" valor={od.cerradaAt ? `CERRADA ${fechaHora(od.cerradaAt)}` : 'ACTIVA'} />
          </Grid>
          {od.ordenesProduccion.length > 0 && (
            <Tabla
              columnas={['Orden de producción', 'Fecha de proceso', 'Estado', 'Etiquetas rotuladas']}
              filas={od.ordenesProduccion.map((op) => [formatOP(op.opNumber), fecha(op.processDate), estadoOrden(op.status), op.etiquetas])}
            />
          )}
        </Paso>
      )}
    </>
  );

  if (hastaProceso) return pasos;

  return (
    <div className="space-y-5">
      <Resumen
        estado={{
          ...estado,
          detalle: dc ? `Orden ${formatDC(dc.dcNumber)}` : od ? `Orden ${formatOD(od.odNumber)}` : t.cavaActual ? `En ${t.cavaActual}` : undefined,
        }}
        kpis={[
          { label: 'Peso caliente', valor: kgs(t.canal.pesoKg) },
          {
            label: dc ? 'Peso de despacho' : 'Peso frío',
            valor: kgs(pesoFinal),
            detalle: pesoFinal == null ? 'Se pesa en Canal Fría al montarla en una orden' : undefined,
          },
          {
            label: 'Merma',
            valor: merma != null ? kgs(merma) : '—',
            detalle:
              merma != null && t.canal.pesoKg > 0
                ? `${((merma / t.canal.pesoKg) * 100).toFixed(2).replace('.', ',')} %`
                : 'Se calcula cuando tenga peso frío',
            alerta: merma != null && t.canal.pesoKg > 0 && merma / t.canal.pesoKg > 0.03,
          },
        ]}
        datos={[
          ['Barcode', <span className="text-base font-bold">{barcodeDe(t)}</span>],
          ['Pieza', PIEZA[t.pieza]],
          ['Orden de beneficio', `${formatOB(t.ordenBeneficio.reference)} · ${fecha(t.ordenBeneficio.date)}`],
          ['Turno', t.turno ?? '—'],
          ['Cliente', t.ordenBeneficio.cliente],
          ['Tipo de animal', (t.canal.tipoAnimal ?? '—').toUpperCase()],
          ['Guía', t.guias.join(', ') || '—'],
          ['Ubicación', t.cavaActual ?? (dc || od ? `Salió de ${dc?.cavaOrigen ?? od?.cavaOrigen}` : '—')],
        ]}
        vista={
          t.canal.canalTipo && (
            <div className="-mt-20">
              <div style={{ zoom: 0.5 }}>
                <PresintoPreview datos={datosPresinto(t, { pieza: t.pieza, pesoKg: actual?.pesoKg ?? t.canal.pesoKg, turno: t.turno })} />
              </div>
            </div>
          )
        }
      />

      <Linea>
        {pasos}

        {od && od.ordenesProduccion.length > 0 && (
          <Paso
            id={id('desposte')}
            tono="proceso"
            icon={Tags}
            titulo={`Desposte · productos obtenidos en ${od.ordenesProduccion.map((o) => formatOP(o.opNumber)).join(', ')}`}
            vacio={!od.etiquetas.length && 'La orden de producción todavía no tiene etiquetas rotuladas.'}
          >
            <ProductosObtenidos od={od} filtrar={filtrar} soloCanal={soloCanal} onSoloCanal={setSoloCanal} onEtiqueta={onEtiqueta} />
          </Paso>
        )}

        {transformaciones.map((tr) => (
          <Paso
            key={tr.ocNumber}
            tono="proceso"
            icon={FlaskConical}
            titulo={`Transformación · acondicionamiento ${formatOC(tr.ocNumber)} ← ${formatOT(tr.otNumber)}`}
          >
            <Transformacion tr={tr} filtrar={filtrar} onEtiqueta={onEtiqueta} />
          </Paso>
        ))}

        {despachos.map((d, i) => (
          <Paso
            key={d.dcNumber}
            id={i === 0 ? id('despachos') : undefined}
            tono="salida"
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
                valor={`${d.items.reduce((s, x) => s + x.unds, 0)} und · ${kgs(d.items.reduce((s, x) => s + x.netoKg, 0))}`}
              />
            </Grid>
            <Tabla
              columnas={['Código de barras', 'Producto', 'Origen', 'Unds', 'Neto despacho', 'Pistoleado', 'Operario']}
              filas={d.items.map((x) => [
                <b>{x.codigo}</b>,
                `${x.productoCodigo} - ${x.productoNombre}`,
                x.origen === 'acondicionamiento' ? 'ACONDICIONADO' : 'DESPOSTE',
                x.unds,
                kgs(x.netoKg),
                fechaHora(x.at),
                x.operario,
              ])}
            />
          </Paso>
        ))}

        {dc && (
          <Paso
            id={id('dc')}
            tono="salida"
            icon={dc.tipo === 'caliente' ? ThermometerSun : ThermometerSnowflake}
            titulo={`Despacho ${dc.tipo === 'caliente' ? 'caliente' : 'frío'} ${formatDC(dc.dcNumber)} · canal completa`}
            at={dc.pistoleadaAt}
            operario={dc.operario}
          >
            <p className="text-xs text-muted-foreground">La canal no entró a proceso: salió de planta como canal en esta orden de despacho.</p>
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
              <Dato label="Merma" valor={dc.despachoKg != null ? kgs(dc.pesoCalienteKg - dc.despachoKg) : '—'} />
              <Dato label="Total de la orden" valor={`${dc.canalesOrden} canal(es) · ${kgs(dc.kgDespachoOrden || dc.kgCalienteOrden)}`} />
            </Grid>
          </Paso>
        )}

        <Paso id={id('final')} icon={CircleCheck} titulo={estado.label} at={dc?.cerradaAt ?? od?.cerradaAt ?? null} final>
          <p className="text-sm text-muted-foreground">{textoFinal(t, filtrar, etiquetasVista, transformaciones.length, despachos)}</p>
        </Paso>
      </Linea>
    </div>
  );
}

function textoFinal(
  t: TrazabilidadCanal,
  filtrar: boolean,
  etiquetasVista: OdProceso['etiquetas'],
  transformaciones: number,
  despachos: { dcNumber: number }[],
) {
  const dc = t.despachoCanal;
  const od = t.despachoProceso;
  switch (t.estado) {
    case 'despachada':
      return `La orden ${formatDC(dc!.dcNumber)} se cerró y la canal salió de planta.`;
    case 'en_despacho':
      return `Está en la orden ${formatDC(dc!.dcNumber)}; sigue en planta hasta que se cierre la orden.`;
    case 'en_proceso':
      return `Entró a desposte con la orden ${formatOD(od!.odNumber)}.`;
    case 'procesada':
      return `Se despostó con la orden ${formatOD(od!.odNumber)} (ya cerrada)${
        etiquetasVista.length
          ? `: ${filtrar ? 'esta canal' : 'el lote'} se convirtió en ${etiquetasVista.length} producto(s) rotulado(s) · ${kg(etiquetasVista.reduce((s, x) => s + x.netoKg, 0))} kg.`
          : '.'
      }${transformaciones ? ` ${transformaciones} transformación(es) en acondicionamiento.` : ''}${
        despachos.length ? ` Productos despachados en ${despachos.map((d) => formatDC(d.dcNumber)).join(', ')}.` : ''
      }`;
    case 'disponible':
      return `Disponible en ${t.cavaActual}.`;
    default:
      return 'La canal no está ubicada en ninguna cava ni orden.';
  }
}

/** Informe en PDF de la hoja de vida de la canal. */
async function pdfCanal(t: TrazabilidadCanal) {
  const od = t.despachoProceso;
  const dc = t.despachoCanal;
  const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));
  const secciones: SeccionPdf[] = [];
  secciones.push(
    t.guia
      ? {
          titulo: 'Recepción · Peso en camión',
          meta: `${fechaHora(t.guia.createdAt)} · ${s(t.guia.registradaPor)}`,
          datos: [
            ['Guía', s(t.guia.guia)],
            ['Referencia BC', s(t.guia.bcReference)],
            ['Fecha', fecha(t.guia.date)],
            ['Lote / finca', s(t.guia.referenciaLote)],
            ['Proveedor', s(t.guia.proveedor)],
            ['Procedencia', s(t.guia.procedencia)],
            ['Placa', s(t.guia.placa)],
            ['Conductor', s(t.guia.conductor)],
            ['Animales', s(t.guia.cantidad)],
            ['Neto', kgs(t.guia.netoKg)],
          ],
        }
      : { titulo: 'Recepción · Peso en camión', nota: `Guía ${t.guias.join(', ') || '—'} (sin registro en Peso en Camión).` },
  );
  if (t.pie)
    secciones.push({
      titulo: 'Peso en pie',
      meta: `${fechaHora(t.pie.pesadoAt)} · ${s(t.pie.operario)}`,
      datos: [
        ['Referencia BP', s(t.pie.bpReference)],
        ['Animal en la guía', `#${t.pie.reference}`],
        ['Corral', s(t.pie.corral)],
        ['Sexo / tipo', s(t.pie.tipoAnimal)],
        ['Peso inicial', kgs(t.pie.pesoInicialKg)],
        ['Peso final', kgs(t.pie.pesoActualKg)],
      ],
      tabla: t.pie.repesajes.length
        ? {
            columnas: ['Repesaje', 'Anterior', 'Nuevo', 'Merma', 'Fecha', 'Operario'],
            filas: t.pie.repesajes.map((r) => [`Ronda ${r.ronda}`, kgs(r.pesoAnteriorKg), kgs(r.pesoNuevoKg), kgs(r.mermaKg), fechaHora(r.at), s(r.operario)]),
          }
        : undefined,
    });
  secciones.push({
    titulo: `Orden de beneficio ${formatOB(t.ordenBeneficio.reference)} · sacrificio`,
    meta: `${fechaHora(t.sacrificio.at)} · ${s(t.sacrificio.operario)}`,
    datos: [
      ['Fecha', fecha(t.ordenBeneficio.date)],
      ['Cliente', t.ordenBeneficio.cliente],
      ['Animal en la orden', `A${String(t.sacrificio.sequence).padStart(2, '0')}`],
      ['Turno', s(t.turno)],
      ['Piel', t.piel ? kgs(t.piel.kg) : '—'],
      ['Subproductos para', t.ordenBeneficio.subproductoDestino.toUpperCase()],
    ],
  });
  secciones.push({
    titulo: 'Canal caliente',
    meta: `${fechaHora(t.canal.weighedAt)} · ${s(t.canal.operario)}`,
    datos: [
      ['Tipo de animal', s(t.canal.tipoAnimal).toUpperCase()],
      ['Tipo de canal', t.canal.canalTipo ? CANAL_TIPO_LABEL[t.canal.canalTipo].toUpperCase() : '—'],
      ['Expendio', s(t.canal.expendio)],
      ['Bodega', s(t.canal.bodega)],
      ['Destino', s(t.canal.destino)],
      ['Ubicación actual', s(t.cavaActual)],
    ],
    tabla: {
      columnas: ['Pieza', 'Turno', 'Peso'],
      filas: t.canal.piezasAnimal.map((p) => [`${PIEZA[p.pieza]}${p.actual ? ' (esta)' : ''}`, s(p.turno), kgs(p.pesoKg)]),
    },
  });
  if (t.traslados.length)
    secciones.push({
      titulo: 'Movimientos de cava',
      tabla: {
        columnas: ['Origen', 'Destino', 'Motivo', 'Fecha', 'Operario'],
        filas: t.traslados.map((m) => [s(m.cavaOrigen), m.cavaDestino, m.motivo, fechaHora(m.at), s(m.operario)]),
      },
    });
  secciones.push({ titulo: 'Subproductos del animal', nota: 'Módulo en construcción · próximamente.' });
  if (od) {
    secciones.push({
      titulo: `Despacho a proceso ${formatOD(od.odNumber)}`,
      meta: `${fechaHora(od.pistoleadaAt)} · ${s(od.operario)}`,
      datos: [
        ['Cliente', od.cliente],
        ['Fecha de proceso', fecha(od.processDate)],
        ['Peso caliente', kgs(od.pesoCalienteKg)],
        ['Peso frío', kgs(od.despachoKg)],
        ['Estado', od.cerradaAt ? `CERRADA ${fechaHora(od.cerradaAt)}` : 'ACTIVA'],
        ['Órdenes de producción', od.ordenesProduccion.map((o) => formatOP(o.opNumber)).join(', ') || '—'],
      ],
    });
    const productos = od.asignacionPorCanal ? od.productosCanal : od.productos;
    if (productos.length)
      secciones.push({
        titulo: od.asignacionPorCanal ? 'Productos obtenidos de esta canal' : 'Productos obtenidos del lote',
        tabla: { columnas: ['Código', 'Producto', 'Piezas', 'Kilos'], filas: productos.map((p) => [p.codigo, p.nombre, p.piezas, kgs(p.kg)]) },
      });
    for (const d of od.despachos)
      secciones.push({
        titulo: `Productos despachados ${formatDC(d.dcNumber)}`,
        meta: d.cerrada ? `Cerrada ${fechaHora(d.cerradaAt)}` : 'Activa',
        tabla: {
          columnas: ['Código', 'Producto', 'Unds', 'Neto'],
          filas: d.items.filter((x) => !od.asignacionPorCanal || x.deEstaCanal).map((x) => [x.codigo, `${x.productoCodigo} ${x.productoNombre}`, x.unds, kgs(x.netoKg)]),
        },
      });
  }
  if (dc)
    secciones.push({
      titulo: `Despacho ${dc.tipo === 'caliente' ? 'caliente' : 'frío'} ${formatDC(dc.dcNumber)}`,
      meta: `${fechaHora(dc.pistoleadaAt)} · ${s(dc.operario)}`,
      datos: [
        ['Cliente', dc.cliente],
        ['NIT', s(dc.clienteNit)],
        ['Fecha de despacho', fecha(dc.processDate)],
        ['Salió de', dc.cavaOrigen],
        ['Peso caliente', kgs(dc.pesoCalienteKg)],
        ['Peso de despacho', kgs(dc.despachoKg)],
        ['Estado', dc.cerradaAt ? `CERRADA ${fechaHora(dc.cerradaAt)}` : 'ACTIVA'],
      ],
    });
  const pesoFinal = dc?.despachoKg ?? od?.despachoKg ?? null;
  await descargarTrazabilidadPdf({
    titulo: 'Trazabilidad de la canal',
    codigo: barcodeDe(t),
    subtitulo: t.ordenBeneficio.cliente,
    estado: ESTADO[t.estado].label,
    resumen: [
      ['Pieza', PIEZA[t.pieza]],
      ['Orden de beneficio', `${formatOB(t.ordenBeneficio.reference)} · ${fecha(t.ordenBeneficio.date)}`],
      ['Peso caliente', kgs(t.canal.pesoKg)],
      ['Peso frío / despacho', kgs(pesoFinal)],
      ['Merma', pesoFinal != null ? kgs(t.canal.pesoKg - pesoFinal) : '—'],
      ['Guía', t.guias.join(', ') || '—'],
    ],
    secciones,
  });
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
        <div className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-xs font-semibold">
          {[
            { v: true, label: 'Solo esta canal' },
            { v: false, label: 'Todo el lote' },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => onSoloCanal(o.v)}
              className={cn(
                'h-7 rounded-md px-3',
                soloCanal === o.v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
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
                  <tr onClick={() => setAbierto(exp ? null : p.codigo)} className="cursor-pointer hover:bg-muted/50 [&>td]:px-2 [&>td]:py-1">
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

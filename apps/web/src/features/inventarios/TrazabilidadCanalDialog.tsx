import type { ComponentType, ReactNode } from 'react';
import {
  ArrowLeftRight,
  Beef,
  CircleCheck,
  ClipboardList,
  Factory,
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
import { fecha, kg } from './BodegasTab';
import { useTrazabilidadCanal, type EstadoTrazabilidad, type TrazabilidadCanal } from './api';

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

const fechaHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const kgs = (n: number | null | undefined) => (n == null ? '—' : `${kg(n)} kg`);

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
        <Informe t={t} />
      )}
    </Dialog>
  );
}

function Informe({ t }: { t: TrazabilidadCanal }) {
  const estado = ESTADO[t.estado];
  const dc = t.despachoCanal;
  const od = t.despachoProceso;
  const pesoFinal = dc?.despachoKg ?? od?.despachoKg ?? null;
  const merma = pesoFinal != null ? t.canal.pesoKg - pesoFinal : null;

  return (
    <div className="space-y-5">
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

      <ol className="relative space-y-4 border-l-2 border-border pl-6">
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
                  op.status.toUpperCase(),
                  op.etiquetas,
                ])}
              />
            )}
          </Paso>
        )}

        {dc && (
          <Paso
            icon={dc.tipo === 'caliente' ? ThermometerSun : ThermometerSnowflake}
            titulo={`Despacho ${dc.tipo === 'caliente' ? 'caliente' : 'frío'} ${formatDC(dc.dcNumber)}`}
            at={dc.pistoleadaAt}
            operario={dc.operario}
          >
            <Grid>
              <Dato label="Cliente" valor={dc.cliente} />
              <Dato label="Fecha de proceso" valor={fecha(dc.processDate)} />
              <Dato label="Salió de" valor={dc.cavaOrigen} />
              <Dato label="Peso caliente" valor={kgs(dc.pesoCalienteKg)} />
              <Dato label="Peso de despacho" valor={kgs(dc.despachoKg)} />
              <Dato
                label="Merma"
                valor={dc.despachoKg != null ? kgs(dc.pesoCalienteKg - dc.despachoKg) : '—'}
              />
            </Grid>
          </Paso>
        )}

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
            {t.estado === 'procesada' && `La orden ${formatOD(od!.odNumber)} ya se cerró.`}
            {t.estado === 'disponible' && `Disponible en ${t.cavaActual}.`}
            {t.estado === 'sin_cava' && 'La canal no está ubicada en ninguna cava ni orden.'}
          </p>
        </Paso>
      </ol>
    </div>
  );
}

function Paso({
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

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">{children}</div>;
}

function Dato({ label, valor, ancho }: { label: string; valor: ReactNode; ancho?: boolean }) {
  return (
    <div className={cn('min-w-0', ancho && 'col-span-2 sm:col-span-4')}>
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium uppercase tabular-nums">{valor}</p>
    </div>
  );
}

function Tabla({ columnas, filas }: { columnas: string[]; filas: ReactNode[][] }) {
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

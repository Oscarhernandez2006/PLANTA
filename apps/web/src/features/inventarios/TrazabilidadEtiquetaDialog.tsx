import { useState } from 'react';
import {
  Beef,
  ChevronRight,
  CircleCheck,
  Factory,
  FlaskConical,
  LoaderCircle,
  PackageOpen,
  Tag,
  Truck,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { formatOB } from '../registrar/orden-beneficio-api';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatOT } from '../registrar/orden-traslado-api';
import { formatOC } from '../registrar/orden-acondicionamiento-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { fecha, kg } from './BodegasTab';
import {
  Dato,
  Grid,
  Paso,
  PasosCanal,
  Tabla,
  TrazabilidadCanalDialog,
  estadoOrden,
  fechaHora,
  kgs,
} from './TrazabilidadCanalDialog';
import { useTrazabilidadEtiqueta, type TrazabilidadEtiqueta } from './api';

type Canal = TrazabilidadEtiqueta['ordenesProduccion'][number]['canales'][number];

const PIEZA: Record<Canal['pieza'], string> = { canal: 'CANAL', cizq: 'CIZQ', cder: 'CDER' };

const barcodeCanal = (c: Canal) =>
  c.canalTipo
    ? codigoBarras({ lote: c.reference, turno: c.turno ?? c.sequence, canalTipo: c.canalTipo, pieza: c.pieza })
    : '—';

/** Hoja de vida de una etiqueta hacia atrás, hasta las canales; cada canal abre su propia trazabilidad. */
export function TrazabilidadEtiquetaDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: t, isLoading, isError } = useTrazabilidadEtiqueta(id);
  const [canalId, setCanalId] = useState<string | null>(null);

  if (canalId) return <TrazabilidadCanalDialog piezaId={canalId} onClose={() => setCanalId(null)} />;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Trazabilidad de la etiqueta"
      description={t ? `${t.etiqueta.codigo ?? '—'} · ${t.etiqueta.productoCodigo} ${t.etiqueta.productoNombre}` : undefined}
      className="max-w-5xl"
      scrollInterno
    >
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : isError || !t ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No se pudo cargar la trazabilidad de esta etiqueta.
        </p>
      ) : (
        <Informe t={t} onCanal={setCanalId} />
      )}
    </Dialog>
  );
}

function estadoDe(t: TrazabilidadEtiqueta) {
  if (t.etiqueta.anulada) return { label: 'ANULADA', className: 'bg-red-600 text-white' };
  if (t.despacho?.cerrada)
    return { label: `DESPACHADA · ${formatDC(t.despacho.dcNumber)}`, className: 'bg-sky-600 text-white' };
  if (t.despacho)
    return {
      label: `EN DESPACHO · ${formatDC(t.despacho.dcNumber)}`,
      className: 'bg-sky-100 text-sky-900 ring-1 ring-sky-400',
    };
  if (t.traslado?.transformadoOc)
    return { label: `TRANSFORMADA · ${formatOC(t.traslado.transformadoOc)}`, className: 'bg-violet-600 text-white' };
  if (t.traslado)
    return { label: `EN PROCESO · ${formatOT(t.traslado.otNumber)}`, className: 'bg-amber-400 text-amber-950' };
  return { label: 'DISPONIBLE', className: 'bg-emerald-600 text-white' };
}

function Informe({ t, onCanal }: { t: TrazabilidadEtiqueta; onCanal: (piezaId: string) => void }) {
  const e = t.etiqueta;
  const estado = estadoDe(t);
  const ac = t.acondicionamiento;
  const totalCanales = t.ordenesProduccion.reduce((s, op) => s + op.canales.length, 0);
  const todas = t.ordenesProduccion.flatMap((op) => op.canales);
  const vistos = new Set<string>();
  const origenes = t.origenes.flatMap((o) => {
    if (vistos.has(o.eventoId)) return [];
    vistos.add(o.eventoId);
    const c = todas.find((x) => x.piezaId === o.piezaId);
    return c ? [{ o, c }] : [];
  });
  const unica = origenes.length === 1 && !t.origenesSinCanal ? origenes[0] : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 rounded-md border-2 border-border p-4 sm:grid-cols-4">
        <Dato label="Código de barras" valor={<span className="text-lg font-bold">{e.codigo ?? '—'}</span>} />
        <Dato label="Producto" valor={`${e.productoCodigo} - ${e.productoNombre}`} />
        <Dato label="Peso neto" valor={kgs(e.netoKg)} />
        <Dato
          label="Estado actual"
          valor={<span className={cn('rounded-sm px-2 py-0.5 text-xs font-bold', estado.className)}>{estado.label}</span>}
        />
        <Dato
          label="Lote"
          valor={ac ? `${formatOC(ac.ocNumber)} ← ${formatOT(ac.otNumber)}` : t.ordenesProduccion.map((o) => formatOP(o.opNumber)).join(', ')}
        />
        <Dato label="Tienda" valor={e.tienda} />
        <Dato
          label="Canal de origen"
          valor={
            unica ? (
              <span className="font-bold text-emerald-700">{barcodeCanal(unica.c)}</span>
            ) : origenes.length ? (
              `${origenes.length} canales`
            ) : (
              `${totalCanales} canal(es) del lote`
            )
          }
        />
        <Dato label="Vence" valor={fecha(e.fechaVencimiento)} />
        {unica && (
          <>
            <Dato label="Orden de beneficio" valor={`${formatOB(unica.c.reference)} · ${fecha(unica.c.obDate)}`} />
            <Dato label="Proveedor" valor={unica.c.proveedor ?? '—'} />
            <Dato
              label="Canal caliente / frío"
              valor={`${kgs(unica.c.pesoCalienteKg)} / ${kgs(unica.c.pesoFrioKg)}`}
            />
            <Dato
              label="Orden de desposte"
              valor={`Canal ${unica.o.posicion} de ${unica.o.totalCanales}${
                t.tipo === 'desposte' ? ` · pieza ${unica.o.piezaEnCanal} de ${unica.o.piezasPorCanal}` : ''
              }`}
            />
          </>
        )}
      </div>

      <ol className="relative space-y-4 border-l-2 border-border pl-6">
        {unica && <PasosCanal piezaId={unica.c.piezaId} />}
        {!unica && origenes.length > 0 && (
          <Paso icon={Beef} titulo={`Canales de origen (${origenes.length})`}>
            <p className="text-xs text-muted-foreground">
              Este producto se acondicionó a partir de cortes de estas canales. Haz clic en una para ver su
              hoja de vida completa.
            </p>
            <Canales canales={origenes.map((x) => x.c)} onCanal={onCanal} />
          </Paso>
        )}
        {!origenes.length &&
          t.ordenesProduccion.map((op) => (
            <Paso key={op.opNumber} icon={Beef} titulo={`Canales despostadas · ${formatOD(op.odNumber)}`}>
              <p className="text-xs text-muted-foreground">
                No se pudo determinar la canal exacta: el producto no tiene configuradas las piezas por canal
                (Piezas Desposte del cliente). Se muestran todas las canales del lote.
              </p>
              <Canales canales={op.canales} onCanal={onCanal} />
            </Paso>
          ))}

        {t.ordenesProduccion.map((op) => (
          <Paso
            key={`op-${op.opNumber}`}
            icon={Factory}
            titulo={`Orden de producción ${formatOP(op.opNumber)}`}
            operario={op.creadaPor}
          >
            <Grid>
              <Dato label="Fecha de proceso" valor={fecha(op.processDate)} />
              <Dato label="Orden de despacho" valor={`${formatOD(op.odNumber)} · ${fecha(op.odProcessDate)}`} />
              <Dato label="Estado" valor={estadoOrden(op.status)} />
              <Dato label="Canales" valor={op.canales.length} />
            </Grid>
          </Paso>
        ))}

        {ac && (
          <>
            <Paso icon={Truck} titulo={`Traslado a proceso ${formatOT(ac.otNumber)}`}>
              <Grid>
                <Dato label="Fecha" valor={fecha(ac.otProcessDate)} />
                <Dato label="Productos trasladados" valor={ac.entradas.length} />
                <Dato label="Kilos" valor={kgs(ac.entradas.reduce((s, i) => s + i.netoKg, 0))} />
              </Grid>
              <Tabla
                columnas={['Código', 'Producto', 'Unds', 'Neto', 'Lote']}
                filas={ac.entradas.map((i) => [
                  i.codigo,
                  `${i.productoCodigo} - ${i.productoNombre}`,
                  i.unds,
                  kgs(i.netoKg),
                  i.opNumber ? formatOP(i.opNumber) : '—',
                ])}
              />
            </Paso>
            <Paso
              icon={FlaskConical}
              titulo={`Acondicionamiento ${formatOC(ac.ocNumber)}`}
              operario={ac.creadaPor}
            >
              <Grid>
                <Dato label="Proceso" valor={ac.proceso.toUpperCase()} />
                <Dato label="Fecha de proceso" valor={fecha(ac.processDate)} />
                <Dato label="Estado" valor={estadoOrden(ac.status)} />
              </Grid>
            </Paso>
          </>
        )}

        <Paso icon={Tag} titulo="Rotulado" at={e.createdAt} operario={e.operario}>
          <Grid>
            <Dato label="Pieza" valor={`#${e.pieza}`} />
            <Dato label="Bruto / tara" valor={`${kgs(e.brutoKg)} / ${kgs(e.taraKg)}`} />
            <Dato label="Neto" valor={kgs(e.netoKg)} />
            <Dato label="Estación" valor={e.estacion ?? '—'} />
            <Dato label="Empaque" valor={e.empaque} />
            <Dato label="Conservación" valor={`${e.conservacion} · ${e.temperatura}`} />
            <Dato label="Fecha sacrificio" valor={fecha(e.fechaSacrificio)} />
            <Dato label="Fecha empaque" valor={fecha(e.fechaEmpaque)} />
            {e.canastilla && (
              <Dato
                label="Canastilla"
                valor={`N.º ${e.canastilla.numero}${e.canastilla.codigo ? ` · ${e.canastilla.codigo}` : ''}`}
              />
            )}
            {e.ref && <Dato label="Referencia" valor={e.ref} />}
            {e.sobrante && <Dato label="Observación" valor="SOBRANTE" />}
          </Grid>
        </Paso>

        {t.traslado && (
          <Paso
            icon={PackageOpen}
            titulo={`Trasladada a proceso ${formatOT(t.traslado.otNumber)}`}
            at={t.traslado.at}
            operario={t.traslado.operario}
          >
            <Grid>
              <Dato label="Peso al trasladar" valor={kgs(t.traslado.netoKg)} />
              <Dato
                label="Transformada en"
                valor={t.traslado.transformadoOc ? formatOC(t.traslado.transformadoOc) : 'PENDIENTE'}
              />
            </Grid>
          </Paso>
        )}

        {t.despacho && (
          <Paso
            icon={Truck}
            titulo={`Despacho ${formatDC(t.despacho.dcNumber)}`}
            at={t.despacho.at}
            operario={t.despacho.operario}
          >
            <Grid>
              <Dato label="Peso de despacho" valor={kgs(t.despacho.netoKg)} />
              <Dato label="Diferencia" valor={kgs(e.netoKg - t.despacho.netoKg)} />
              <Dato label="Orden" valor={t.despacho.cerrada ? 'CERRADA' : 'ACTIVA'} />
            </Grid>
          </Paso>
        )}

        <Paso icon={CircleCheck} titulo={estado.label} final>
          <p className="text-sm text-muted-foreground">Etiquetada el {fechaHora(e.createdAt)}.</p>
        </Paso>
      </ol>
    </div>
  );
}

function Canales({ canales, onCanal }: { canales: Canal[]; onCanal: (piezaId: string) => void }) {
  const caliente = canales.reduce((s, c) => s + c.pesoCalienteKg, 0);
  const frio = canales.reduce((s, c) => s + (c.pesoFrioKg ?? 0), 0);
  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full whitespace-nowrap text-sm tabular-nums">
        <thead className="bg-muted text-left">
          <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:text-muted-foreground">
            <th>Barcode</th>
            <th>Orden beneficio</th>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Pieza</th>
            <th>Proveedor</th>
            <th className="text-right">Caliente</th>
            <th className="text-right">Frío</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {canales.map((c) => (
            <tr
              key={c.piezaId}
              onClick={() => onCanal(c.piezaId)}
              title="Ver trazabilidad de la canal"
              className="cursor-pointer hover:bg-muted/50 [&>td]:px-2 [&>td]:py-1"
            >
              <td className="font-semibold text-emerald-700">{barcodeCanal(c)}</td>
              <td>{formatOB(c.reference)}</td>
              <td>{fecha(c.obDate)}</td>
              <td className="text-xs uppercase">{c.canalAnimalTipo ?? '—'}</td>
              <td className="text-xs font-semibold text-red-600">{PIEZA[c.pieza]}</td>
              <td className="max-w-56 truncate uppercase" title={c.procedencia ?? undefined}>
                {c.proveedor ?? '—'}
              </td>
              <td className="text-right">{kg(c.pesoCalienteKg)}</td>
              <td className="text-right">{c.pesoFrioKg == null ? '—' : kg(c.pesoFrioKg)}</td>
              <td className="text-muted-foreground">
                <ChevronRight className="size-4" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/50 font-semibold">
          <tr className="[&>td]:px-2 [&>td]:py-1.5">
            <td colSpan={6}>{canales.length} canal(es)</td>
            <td className="text-right">{kg(caliente)}</td>
            <td className="text-right">{kg(frio)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

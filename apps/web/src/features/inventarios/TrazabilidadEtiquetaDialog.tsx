import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Beef,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Factory,
  FlaskConical,
  PackageOpen,
  LoaderCircle,
  Tag,
  Truck,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { printRaw } from '@/lib/device';
import { codigoBarras, type PresintoTicketData } from '../canal-caliente/canal-presinto-print';
import { CANAL_ANIMAL_TIPO_LABEL, CANAL_TIPO_LABEL, type CanalAnimalTipo } from '../canal-caliente/api';
import { PresintoPreview } from '../canal-caliente/PresintoPreview';
import { formatOB } from '../registrar/orden-beneficio-api';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP, registrarReimpresion } from '../registrar/orden-produccion-api';
import { formatOT } from '../registrar/orden-traslado-api';
import { formatOC } from '../registrar/orden-acondicionamiento-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { useDevice } from '../device/device-context';
import { EtiquetaDespostePreview } from '../rotulado/EtiquetaDespostePreview';
import {
  formatPieza,
  generarEtiquetaDesposteZpl,
  obtenerLogoEtiquetaZpl,
  type EtiquetaDesposteDatos,
} from '../rotulado/etiqueta-desposte-zpl';
import { SIN_IMPRESORA, useImpresoraEtiquetas } from '../rotulado/ui';
import { fecha, kg } from './BodegasTab';
import { PasosCanal, TrazabilidadCanalDialog } from './TrazabilidadCanalDialog';
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
import { useTrazabilidadCanal, useTrazabilidadEtiqueta, type TrazabilidadCanal, type TrazabilidadEtiqueta } from './api';

type Canal = TrazabilidadEtiqueta['ordenesProduccion'][number]['canales'][number];

const PIEZA: Record<Canal['pieza'], string> = { canal: 'CANAL', cizq: 'CIZQ', cder: 'CDER' };

const barcodeCanal = (c: Canal) =>
  c.canalTipo
    ? codigoBarras({ lote: c.reference, turno: c.turno ?? c.sequence, canalTipo: c.canalTipo, pieza: c.pieza })
    : '—';

/** Los mismos datos con que se imprimió, para que la vista y la reimpresión sean idénticas. */
function datosEtiqueta(t: TrazabilidadEtiqueta): EtiquetaDesposteDatos {
  const e = t.etiqueta;
  const ac = t.acondicionamiento;
  return {
    // El API envía la tienda como "código - nombre"; la etiqueta lleva solo el código.
    tienda: e.tienda.split(' - ')[0],
    lote: ac ? formatOC(ac.ocNumber) : formatOP(t.ordenesProduccion[0]?.opNumber ?? 0),
    productoCodigo: e.productoCodigo,
    productoNombre: e.productoNombre,
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
  };
}

/** Días hasta el vencimiento (negativo = vencido). */
function diasVence(iso: string | null) {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoy.getTime()) / 86_400_000);
}

/** Hoja de vida de una etiqueta hacia atrás, hasta las canales; cada canal abre su propia trazabilidad. */
export function TrazabilidadEtiquetaDialog({
  id,
  onClose,
  volver,
}: {
  id: string;
  onClose: () => void;
  volver?: { label: string; onClick: () => void };
}) {
  const { data: t, isLoading: cargandoEtiqueta, isError } = useTrazabilidadEtiqueta(id);
  // El primer animal del lote se precarga para mostrar el informe completo de una vez.
  const primerAnimal = useTrazabilidadCanal(t ? (animalesDe(loteDe(t))[0]?.piezaId ?? null) : null);
  const isLoading = cargandoEtiqueta || primerAnimal.isLoading;
  const [canalId, setCanalId] = useState<string | null>(null);
  const impresora = useImpresoraEtiquetas();
  const equipo = useDevice();

  if (canalId)
    return (
      <TrazabilidadCanalDialog
        piezaId={canalId}
        onClose={onClose}
        volver={{ label: 'Volver a la etiqueta', onClick: () => setCanalId(null) }}
      />
    );

  async function reimprimir(): Promise<string | null> {
    if (!t) return null;
    if (!impresora) return SIN_IMPRESORA;
    try {
      const logo = await obtenerLogoEtiquetaZpl();
      const r = await printRaw(impresora, generarEtiquetaDesposteZpl(datosEtiqueta(t), logo));
      if (!r.ok) return r.error || 'No se pudo imprimir la etiqueta.';
      if (t.etiqueta.codigo && t.tipo === 'desposte') registrarReimpresion(t.etiqueta.codigo, equipo.hostname);
      return null;
    } catch {
      return 'No se pudo enviar la etiqueta a la impresora.';
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      volver={volver}
      title="Trazabilidad de la etiqueta"
      description={t ? `${t.etiqueta.codigo ?? '—'} · ${t.etiqueta.productoCodigo} ${t.etiqueta.productoNombre}` : undefined}
      className="mt-0 max-h-[calc(100vh-3rem)] max-w-[min(94vw,88rem)]"
      scrollInterno
      subencabezado={t && !isLoading && <Etapas etapas={etapasEtiqueta(t, primerAnimal.data)} />}
      acciones={t && !isLoading && <Acciones codigo={t.etiqueta.codigo} onReimprimir={t.etiqueta.anulada ? undefined : reimprimir} onPdf={() => pdfEtiqueta(t)} />}
    >
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : isError || !t ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No se pudo cargar la trazabilidad de esta etiqueta.</p>
      ) : (
        <Informe t={t} onCanal={setCanalId} />
      )}
    </Dialog>
  );
}

function estadoDe(t: TrazabilidadEtiqueta) {
  if (t.etiqueta.anulada) return { label: 'ANULADA', className: 'bg-red-600 text-white' };
  if (t.despacho?.cerrada) return { label: `DESPACHADA · ${formatDC(t.despacho.dcNumber)}`, className: 'bg-sky-600 text-white' };
  if (t.despacho)
    return { label: `EN DESPACHO · ${formatDC(t.despacho.dcNumber)}`, className: 'bg-sky-100 text-sky-900 ring-1 ring-sky-400' };
  if (t.traslado?.transformadoOc)
    return { label: `TRANSFORMADA · ${formatOC(t.traslado.transformadoOc)}`, className: 'bg-violet-600 text-white' };
  if (t.traslado) return { label: `EN PROCESO · ${formatOT(t.traslado.otNumber)}`, className: 'bg-amber-400 text-amber-950' };
  return { label: 'DISPONIBLE', className: 'bg-emerald-600 text-white' };
}

/** Canales de origen sin repetir animal; `unica` cuando el producto sale de una sola canal. */
function origenesDe(t: TrazabilidadEtiqueta) {
  const todas = t.ordenesProduccion.flatMap((op) => op.canales);
  const vistos = new Set<string>();
  const origenes = t.origenes.flatMap((o) => {
    if (vistos.has(o.eventoId)) return [];
    vistos.add(o.eventoId);
    const c = todas.find((x) => x.piezaId === o.piezaId);
    return c ? [{ o, c }] : [];
  });
  const unica = origenes.length === 1 && !t.origenesSinCanal ? origenes[0] : null;
  return { origenes, unica, totalCanales: todas.length };
}

function etapasEtiqueta(t: TrazabilidadEtiqueta, c: TrazabilidadCanal | undefined): Etapa[] {
  return [
    ...(c
      ? ([
          { id: 'ec-guia', label: 'Peso en camión', hecho: !!c.guia, tono: 'origen' },
          { id: 'ec-pie', label: 'Peso en pie', hecho: !!c.pie, tono: 'origen' },
          { id: 'ec-ob', label: 'Beneficio', hecho: true, tono: 'proceso' },
        ] as Etapa[])
      : []),
    { id: 'te-canales', label: 'Canal', hecho: true, tono: 'origen' },
    ...(c ? [{ id: 'ec-od', label: 'Despacho a proceso', hecho: !!c.despachoProceso, tono: 'proceso' as const }] : []),
    { id: 'te-op', label: 'Producción', hecho: t.ordenesProduccion.length > 0, tono: 'proceso' },
    ...(t.acondicionamiento ? [{ id: 'te-ac', label: 'Acondicionamiento', hecho: true, tono: 'proceso' as const }] : []),
    { id: 'te-rotulado', label: 'Rotulado', hecho: true, tono: 'proceso' },
    { id: 'te-traslado', label: 'Traslado', hecho: !!t.traslado, tono: 'proceso' },
    { id: 'te-despacho', label: 'Despacho', hecho: !!t.despacho, tono: 'salida' },
    { id: 'te-final', label: 'Estado', hecho: true, tono: 'salida' },
  ];
}

function Informe({ t, onCanal }: { t: TrazabilidadEtiqueta; onCanal: (piezaId: string) => void }) {
  const e = t.etiqueta;
  const estado = estadoDe(t);
  const ac = t.acondicionamiento;
  const { unica } = origenesDe(t);
  const lote = loteDe(t);
  const animalesLote = useMemo(() => animalesDe(lote), [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(0);
  const animales = animalesLote.length;
  const dias = diasVence(e.fechaVencimiento);

  return (
    <div className="space-y-5">
      <Resumen
        estado={estado}
        kpis={[
          { label: 'Peso neto', valor: kgs(e.netoKg), detalle: `Bruto ${kgs(e.brutoKg)} · tara ${kgs(e.taraKg)}` },
          {
            label: 'Vencimiento',
            valor: fecha(e.fechaVencimiento),
            detalle: dias == null ? undefined : dias < 0 ? `Vencida hace ${-dias} día(s)` : dias === 0 ? 'Vence hoy' : `Faltan ${dias} día(s)`,
            alerta: dias != null && dias <= 3,
          },
          {
            label: 'Lote de canales',
            valor: `${animales} animal(es)`,
            detalle: `${lote.length} pieza(s) · ${[...new Set(t.ordenesProduccion.map((o) => formatOD(o.odNumber)))].join(', ')}`,
          },
        ]}
        datos={[
          ['Código de barras', <span className="text-base font-bold">{e.codigo ?? '—'}</span>, 'resaltar'],
          ['Producto', `${e.productoCodigo} - ${e.productoNombre}`],
          [
            'Lote',
            ac ? `${formatOC(ac.ocNumber)} ← ${formatOT(ac.otNumber)}` : t.ordenesProduccion.map((o) => formatOP(o.opNumber)).join(', '),
            'resaltar',
          ],
          ['Tienda', e.tienda, 'resaltar'],
          ['Conservación', `${e.conservacion} · ${e.temperatura}`],
          ['Empaque', e.empaque],
          ...(unica
            ? ([
                ['Proveedor', unica.c.proveedor ?? '—'],
                [
                  'Orden de desposte',
                  `Canal ${unica.o.posicion} de ${unica.o.totalCanales}${t.tipo === 'desposte' ? ` · pieza ${unica.o.piezaEnCanal} de ${unica.o.piezasPorCanal}` : ''}`,
                ],
              ] as [string, string][])
            : []),
        ]}
        vista={<EtiquetaDespostePreview className="w-52 drop-shadow-md" datos={datosEtiqueta(t)} />}
      />

      <Linea>
        {(() => {
          const pasoLote = (
            <Paso
              id="te-canales"
              tono="origen"
              icon={Beef}
              titulo={`Canal caliente · lote de canales (${animales} animales)`}
              vacio={!lote.length && 'La orden de producción no tiene canales registradas.'}
            >
              {lote.length > 0 && (
                <LoteCanales canales={lote} animales={animalesLote} i={sel} onI={setSel} onCanal={onCanal} />
              )}
            </Paso>
          );
          // Camión, pie, beneficio, cava y despacho a proceso son los del animal elegido en el lote.
          return animalesLote.length ? (
            <PasosCanal piezaId={animalesLote[Math.min(sel, animalesLote.length - 1)].piezaId} canalCaliente={pasoLote} />
          ) : (
            pasoLote
          );
        })()}

        {t.ordenesProduccion.map((op, i) => (
          <Paso
            key={`op-${op.opNumber}`}
            id={i === 0 ? 'te-op' : undefined}
            tono="proceso"
            icon={Factory}
            titulo={`Orden de producción ${formatOP(op.opNumber)}`}
            operario={op.creadaPor}
          >
            <Grid>
              <Dato resaltar label="Fecha de proceso" valor={fecha(op.processDate)} />
              <Dato resaltar label="Orden de despacho" valor={`${formatOD(op.odNumber)} · ${fecha(op.odProcessDate)}`} />
              <Dato resaltar label="Estado" valor={estadoOrden(op.status)} />
              <Dato resaltar label="Canales" valor={op.canales.length} />
            </Grid>
          </Paso>
        ))}

        {ac && (
          <>
            <Paso tono="proceso" icon={Truck} titulo={`Traslado a proceso ${formatOT(ac.otNumber)}`}>
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
            <Paso id="te-ac" tono="proceso" icon={FlaskConical} titulo={`Acondicionamiento ${formatOC(ac.ocNumber)}`} operario={ac.creadaPor}>
              <Grid>
                <Dato label="Proceso" valor={ac.proceso.toUpperCase()} />
                <Dato label="Fecha de proceso" valor={fecha(ac.processDate)} />
                <Dato label="Estado" valor={estadoOrden(ac.status)} />
              </Grid>
            </Paso>
          </>
        )}

        <Paso id="te-rotulado" tono="proceso" icon={Tag} titulo="Rotulado" at={e.createdAt} operario={e.operario}>
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Dato label="Pieza" valor={`#${formatPieza(e.pieza)}`} />
              <Dato label="Bruto / tara" valor={`${kgs(e.brutoKg)} / ${kgs(e.taraKg)}`} />
              <Dato label="Neto" valor={kgs(e.netoKg)} />
              <Dato label="Estación" valor={e.estacion ?? '—'} />
              <Dato label="Empaque" valor={e.empaque} />
              <Dato label="Conservación" valor={`${e.conservacion} · ${e.temperatura}`} />
              <Dato label="Fecha sacrificio" valor={fecha(e.fechaSacrificio)} />
              <Dato label="Fecha empaque" valor={fecha(e.fechaEmpaque)} />
              {e.canastilla && (
                <Dato label="Canastilla" valor={`N.º ${e.canastilla.numero}${e.canastilla.codigo ? ` · ${e.canastilla.codigo}` : ''}`} />
              )}
              {e.ref && <Dato label="Referencia" valor={e.ref} />}
              {e.sobrante && <Dato label="Observación" valor="SOBRANTE" />}
            </div>
            <figure className="mx-auto w-64 shrink-0">
              <EtiquetaDespostePreview className="w-full drop-shadow-md" datos={datosEtiqueta(t)} />
              <figcaption className="mt-1 text-center text-[11px] text-muted-foreground">Así se imprimió la etiqueta</figcaption>
            </figure>
          </div>
        </Paso>

        <Paso
          id="te-traslado"
          tono="proceso"
          icon={PackageOpen}
          titulo={t.traslado ? `Trasladada a proceso ${formatOT(t.traslado.otNumber)}` : 'Traslado a proceso'}
          at={t.traslado?.at}
          operario={t.traslado?.operario}
          vacio={!t.traslado && 'No se ha trasladado a otro proceso.'}
        >
          {t.traslado && (
            <Grid>
              <Dato label="Peso al trasladar" valor={kgs(t.traslado.netoKg)} />
              <Dato label="Transformada en" valor={t.traslado.transformadoOc ? formatOC(t.traslado.transformadoOc) : 'PENDIENTE'} />
            </Grid>
          )}
        </Paso>

        <Paso
          id="te-despacho"
          tono="salida"
          icon={Truck}
          titulo={t.despacho ? `Despacho ${formatDC(t.despacho.dcNumber)}` : 'Despacho'}
          at={t.despacho?.at}
          operario={t.despacho?.operario}
          vacio={!t.despacho && 'Aún no ha salido en ninguna orden de despacho.'}
        >
          {t.despacho && (
            <Grid>
              <Dato label="Peso de despacho" valor={kgs(t.despacho.netoKg)} />
              <Dato label="Diferencia" valor={kgs(e.netoKg - t.despacho.netoKg)} />
              <Dato label="Orden" valor={t.despacho.cerrada ? 'CERRADA' : 'ACTIVA'} />
            </Grid>
          )}
        </Paso>

        <Paso id="te-final" icon={CircleCheck} titulo={estado.label} final>
          <p className="text-sm text-muted-foreground">Etiquetada el {fechaHora(e.createdAt)}.</p>
        </Paso>
      </Linea>
    </div>
  );
}

async function pdfEtiqueta(t: TrazabilidadEtiqueta) {
  const e = t.etiqueta;
  const ac = t.acondicionamiento;
  const { origenes, unica } = origenesDe(t);
  const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));
  const secciones: SeccionPdf[] = [];
  const canales = origenes.length ? origenes.map((x) => x.c) : t.ordenesProduccion.flatMap((op) => op.canales);
  secciones.push({
    titulo: unica ? 'Canal de origen' : `Canales de origen (${canales.length})`,
    nota: !origenes.length ? 'No se pudo determinar la canal exacta: se listan todas las canales del lote.' : undefined,
    tabla: {
      columnas: ['Barcode', 'Orden beneficio', 'Fecha', 'Tipo', 'Pieza', 'Proveedor', 'Caliente', 'Frío'],
      filas: canales.map((c) => [
        barcodeCanal(c),
        formatOB(c.reference),
        fecha(c.obDate),
        s(c.canalAnimalTipo).toUpperCase(),
        PIEZA[c.pieza],
        s(c.proveedor),
        kgs(c.pesoCalienteKg),
        kgs(c.pesoFrioKg),
      ]),
    },
  });
  for (const op of t.ordenesProduccion)
    secciones.push({
      titulo: `Orden de producción ${formatOP(op.opNumber)}`,
      meta: s(op.creadaPor),
      datos: [
        ['Fecha de proceso', fecha(op.processDate)],
        ['Orden de despacho', `${formatOD(op.odNumber)} · ${fecha(op.odProcessDate)}`],
        ['Estado', estadoOrden(op.status)],
        ['Canales', String(op.canales.length)],
      ],
    });
  if (ac)
    secciones.push({
      titulo: `Acondicionamiento ${formatOC(ac.ocNumber)} ← ${formatOT(ac.otNumber)}`,
      meta: s(ac.creadaPor),
      datos: [
        ['Proceso', ac.proceso.toUpperCase()],
        ['Fecha de proceso', fecha(ac.processDate)],
        ['Estado', estadoOrden(ac.status)],
        ['Traslado', `${formatOT(ac.otNumber)} · ${fecha(ac.otProcessDate)}`],
      ],
      tabla: {
        columnas: ['Código', 'Producto', 'Unds', 'Neto', 'Lote'],
        filas: ac.entradas.map((i) => [i.codigo, `${i.productoCodigo} - ${i.productoNombre}`, i.unds, kgs(i.netoKg), i.opNumber ? formatOP(i.opNumber) : '—']),
      },
    });
  secciones.push({
    titulo: 'Rotulado',
    meta: `${fechaHora(e.createdAt)} · ${e.operario}`,
    datos: [
      ['Pieza', `#${formatPieza(e.pieza)}`],
      ['Estación', s(e.estacion)],
      ['Bruto / tara', `${kgs(e.brutoKg)} / ${kgs(e.taraKg)}`],
      ['Neto', kgs(e.netoKg)],
      ['Empaque', e.empaque],
      ['Conservación', `${e.conservacion} · ${e.temperatura}`],
      ['Fecha sacrificio', fecha(e.fechaSacrificio)],
      ['Fecha empaque', fecha(e.fechaEmpaque)],
      ['Vence', fecha(e.fechaVencimiento)],
      ['Canastilla', e.canastilla ? `N.º ${e.canastilla.numero}` : '—'],
    ],
  });
  if (t.traslado)
    secciones.push({
      titulo: `Trasladada a proceso ${formatOT(t.traslado.otNumber)}`,
      meta: `${fechaHora(t.traslado.at)} · ${t.traslado.operario}`,
      datos: [
        ['Peso al trasladar', kgs(t.traslado.netoKg)],
        ['Transformada en', t.traslado.transformadoOc ? formatOC(t.traslado.transformadoOc) : 'PENDIENTE'],
      ],
    });
  if (t.despacho)
    secciones.push({
      titulo: `Despacho ${formatDC(t.despacho.dcNumber)}`,
      meta: `${fechaHora(t.despacho.at)} · ${t.despacho.operario}`,
      datos: [
        ['Peso de despacho', kgs(t.despacho.netoKg)],
        ['Diferencia', kgs(e.netoKg - t.despacho.netoKg)],
        ['Orden', t.despacho.cerrada ? 'CERRADA' : 'ACTIVA'],
      ],
    });
  await descargarTrazabilidadPdf({
    titulo: 'Trazabilidad de la etiqueta',
    codigo: e.codigo ?? e.id.slice(0, 8),
    subtitulo: `${e.productoCodigo} ${e.productoNombre}`,
    estado: estadoDe(t).label,
    resumen: [
      ['Producto', `${e.productoCodigo} - ${e.productoNombre}`],
      ['Peso neto', kgs(e.netoKg)],
      ['Lote', ac ? `${formatOC(ac.ocNumber)} ← ${formatOT(ac.otNumber)}` : t.ordenesProduccion.map((o) => formatOP(o.opNumber)).join(', ')],
      ['Tienda', e.tienda],
      ['Vence', fecha(e.fechaVencimiento)],
      ['Canal de origen', unica ? barcodeCanal(unica.c) : `${canales.length} canal(es)`],
    ],
    secciones,
  });
}

/** Todas las canales del lote (órdenes de despacho a proceso de la etiqueta), sin repetir pieza. */
function loteDe(t: TrazabilidadEtiqueta): Canal[] {
  const vistas = new Set<string>();
  return t.ordenesProduccion.flatMap((op) =>
    op.canales.filter((c) => (vistas.has(c.piezaId) ? false : (vistas.add(c.piezaId), true))),
  );
}

function datosPresinto(c: Canal, p: Canal['piezasAnimal'][number]): PresintoTicketData {
  const turno = p.turno ?? c.sequence;
  return {
    fechaSacrificio: fecha(c.obDate),
    lote: c.reference,
    guia: c.guias.join(', ') || '—',
    expendio: c.expendio ?? '',
    cliente: c.cliente,
    tipoAnimal: c.canalAnimalTipo
      ? (CANAL_ANIMAL_TIPO_LABEL[c.canalAnimalTipo as CanalAnimalTipo] ?? c.canalAnimalTipo.toUpperCase())
      : '—',
    ref: turno,
    turno,
    pesoKg: p.pesoKg,
    canalTipo: c.canalTipo!,
    conCola: c.conCola,
    pieza: p.pieza,
  };
}

/** Un registro por animal (la primera pieza del lote de cada uno), en el orden del lote. */
function animalesDe(lote: Canal[]): Canal[] {
  const porEvento = new Map<string, Canal>();
  for (const c of lote) if (!porEvento.has(c.eventoId)) porEvento.set(c.eventoId, c);
  return [...porEvento.values()];
}

/** Tabla del lote y, debajo, los presintos de un animal a la vez (flechas para recorrer el lote). */
function LoteCanales({
  canales,
  animales,
  i: indice,
  onI,
  onCanal,
}: {
  canales: Canal[];
  animales: Canal[];
  i: number;
  onI: (i: number) => void;
  onCanal: (piezaId: string) => void;
}) {
  const i = Math.min(indice, animales.length - 1);
  const a = animales[i];
  const ir = (d: number) => onI((i + d + animales.length) % animales.length);
  const setI = onI;
  const btn =
    'flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-primary/10 active:bg-primary/15 disabled:opacity-40';

  return (
    <div className="space-y-4">
      <Canales canales={canales} actual={a.eventoId} onElegir={(eventoId) => setI(animales.findIndex((x) => x.eventoId === eventoId))} onCanal={onCanal} />
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="mb-3 text-center leading-tight">
          <p className="text-sm font-bold text-primary">
            Animal {i + 1} de {animales.length}
          </p>
          <p className="text-xs text-muted-foreground">
            Turno {a.piezasAnimal[0]?.turno ?? a.turno ?? a.sequence}
            {a.canalTipo ? ` · ${CANAL_TIPO_LABEL[a.canalTipo]}` : ''}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button type="button" className={btn} onClick={() => ir(-1)} disabled={animales.length < 2} aria-label="Animal anterior">
            <ChevronLeft className="size-5" />
          </button>
          {a.canalTipo ? (
            <div className="flex min-w-0 flex-wrap justify-center gap-4">
              {a.piezasAnimal.map((p) => (
                // El presinto mide ~26 cm: se muestra a escala para que quepan los dos lado a lado.
                <div key={p.id} style={{ zoom: 0.46 }}>
                  <PresintoPreview datos={datosPresinto(a, p)} />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">Esta canal no tiene presinto.</p>
          )}
          <button type="button" className={btn} onClick={() => ir(1)} disabled={animales.length < 2} aria-label="Animal siguiente">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Canales({
  canales,
  actual,
  onElegir,
  onCanal,
}: {
  canales: Canal[];
  actual: string;
  onElegir: (eventoId: string) => void;
  onCanal: (piezaId: string) => void;
}) {
  const caliente = canales.reduce((s, c) => s + c.pesoCalienteKg, 0);
  const frio = canales.reduce((s, c) => s + (c.pesoFrioKg ?? 0), 0);
  const caja = useRef<HTMLDivElement>(null);

  // Solo se desplaza la tabla (scrollIntoView movería también el modal).
  useEffect(() => {
    const c = caja.current;
    const fila = c?.querySelector<HTMLElement>('[data-actual="true"]');
    if (!c || !fila) return;
    const margen = 36;
    const arriba = fila.offsetTop - margen;
    const abajo = fila.offsetTop + fila.offsetHeight + margen - c.clientHeight;
    if (c.scrollTop > arriba) c.scrollTop = arriba;
    else if (c.scrollTop < abajo) c.scrollTop = abajo;
  }, [actual]);

  return (
    <div ref={caja} className="relative max-h-[18rem] overflow-auto rounded-md border border-border">
      <table className="w-full whitespace-nowrap text-sm tabular-nums">
        <thead className="sticky top-0 z-10 bg-muted text-left">
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
          {canales.map((c) => {
            const esActual = c.eventoId === actual;
            return (
              <tr
                key={c.piezaId}
                data-actual={esActual}
                onClick={() => onElegir(c.eventoId)}
                title="Ver los presintos de este animal"
                className={cn(
                  'cursor-pointer [&>td]:px-2 [&>td]:py-1',
                  esActual ? 'bg-primary/10 font-semibold shadow-[inset_4px_0_0_var(--color-primary)]' : 'hover:bg-muted/50',
                )}
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
                <td>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onCanal(c.piezaId);
                    }}
                    title="Ver trazabilidad de la canal"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-muted font-semibold">
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

import { Beef, CircleCheck, ClipboardList, LoaderCircle, Printer, Scale, Tag, Truck, Warehouse } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { printRaw } from '@/lib/device';
import { registrarReimpresionRecibo } from '../canal-recibo/api';
import { generarRotuloReciboZpl } from '../canal-recibo/rotulo-recibo-zpl';
import { registrarReimpresionPosta } from '../recibo-posta/api';
import { generarRotuloPostaZpl } from '../recibo-posta/rotulo-posta-zpl';
import { useDevice } from '../device/device-context';
import { SIN_IMPRESORA, useImpresoraEtiquetas } from '../rotulado/ui';
import { fecha } from './BodegasTab';
import { descargarTrazabilidadPdf } from './trazabilidad-pdf';
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
  useTrazabilidadReciboCanal,
  useTrazabilidadReciboPosta,
  type TrazabilidadReciboCanal,
  type TrazabilidadReciboPosta,
} from './api';

type Traza = TrazabilidadReciboCanal | TrazabilidadReciboPosta;

const pieza = (prefijo: 'RC' | 'RP', orden: number, codigo: number) =>
  `${prefijo}${orden}-${String(codigo).padStart(2, '0')}`;

const SALIDA: Record<NonNullable<Traza['salida']>['tipo'], string> = {
  proceso: 'Despacho a proceso (Canal Fría)',
  caliente: 'Despacho en caliente',
  frio: 'Despacho en frío',
  posta: 'Despacho posta',
};

/** Días que faltan para el vencimiento (negativo = vencido). */
function diasVence(iso: string | null) {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoy.getTime()) / 86_400_000);
}

function estadoDe(t: Traza, disponible: string) {
  if (t.salida?.cerrada) return { label: `SALIÓ · ${t.salida.orden}`, className: 'bg-sky-600 text-white' };
  if (t.salida) return { label: `EN ORDEN · ${t.salida.orden}`, className: 'bg-amber-400 text-amber-950' };
  if (t.enInventario) return { label: disponible, className: 'bg-emerald-600 text-white' };
  return { label: 'RECIBO ABIERTO · AÚN NO ENTRA AL INVENTARIO', className: 'bg-muted text-muted-foreground ring-1 ring-border' };
}

/**
 * Trazabilidad de lo recibido de terceros. Reemplaza los pasos de guía / peso en pie / beneficio
 * por la información del recibo (Recibo de Canales o Recibo en Posta).
 */
export function TrazabilidadReciboDialog({
  tipo,
  id,
  onClose,
}: {
  tipo: 'canal' | 'posta';
  id: string;
  onClose: () => void;
}) {
  const canal = useTrazabilidadReciboCanal(tipo === 'canal' ? id : null);
  const posta = useTrazabilidadReciboPosta(tipo === 'posta' ? id : null);
  const q = tipo === 'canal' ? canal : posta;
  const t = q.data;
  const impresora = useImpresoraEtiquetas();
  const equipo = useDevice();
  const codigo = t ? pieza(tipo === 'canal' ? 'RC' : 'RP', t.orden.receiptNumber, t.item.codigo) : null;

  async function reimprimir(): Promise<string | null> {
    if (!t) return null;
    if (!impresora) return SIN_IMPRESORA;
    const fechaItem = new Date(t.item.createdAt);
    try {
      const zpl =
        tipo === 'canal'
          ? (() => {
              const i = (t as TrazabilidadReciboCanal).item;
              return generarRotuloReciboZpl({
                receiptNumber: t.orden.receiptNumber,
                codigo: i.codigo,
                cliente: t.orden.cliente.concepto,
                nit: t.orden.cliente.nit ?? '',
                guia: i.guia ?? '',
                lote: i.lote ?? '',
                identificacion: i.identificacion ?? '',
                cava: Number(i.cava.replace(/\D/g, '')) || 0,
                pesoKg: i.pesoKg,
                fecha: fechaItem.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
              });
            })()
          : (() => {
              const i = (t as TrazabilidadReciboPosta).item;
              return generarRotuloPostaZpl({
                receiptNumber: t.orden.receiptNumber,
                codigo: i.codigo,
                cliente: t.orden.cliente.concepto,
                productoCodigo: i.producto.codigo,
                producto: i.producto.nombre,
                netoKg: i.netoKg,
                piezas: i.piezas,
                lote: i.lote ?? '',
                conservacion: i.conservacion === 'congelado' ? 'congelado' : 'refrigerado',
                recibo: fechaItem.toLocaleDateString('es-CO'),
                sacrificio: i.fechaSacrificio ? fecha(i.fechaSacrificio) : undefined,
                vencimiento: i.fechaVencimiento ? fecha(i.fechaVencimiento) : undefined,
              });
            })();
      const r = await printRaw(impresora, zpl);
      if (!r.ok) return r.error || 'No se pudo imprimir el rótulo.';
      if (tipo === 'canal') registrarReimpresionRecibo(t.item.id, equipo.hostname);
      else registrarReimpresionPosta(t.item.id, equipo.hostname);
      return null;
    } catch {
      return 'No se pudo enviar el rótulo a la impresora.';
    }
  }

  const etapas: Etapa[] = t
    ? [
        { id: 'tr-recibo', label: 'Recibo', hecho: true, tono: 'origen' },
        { id: 'tr-ingreso', label: tipo === 'canal' ? 'Ingreso' : 'Pesaje', hecho: true, tono: 'origen' },
        { id: 'tr-inventario', label: 'Inventario', hecho: !!t.bodega, tono: 'proceso' },
        { id: 'tr-salida', label: 'Salida', hecho: !!t.salida, tono: 'salida' },
      ]
    : [];

  return (
    <Dialog
      open
      onClose={onClose}
      title={tipo === 'canal' ? 'Trazabilidad de la canal recibida' : 'Trazabilidad del producto recibido en posta'}
      description={
        t
          ? tipo === 'canal'
            ? `${codigo} · ${t.orden.cliente.concepto}`
            : `${codigo} · ${(t as TrazabilidadReciboPosta).item.producto.nombre}`
          : undefined
      }
      className="max-w-5xl"
      scrollInterno
      subencabezado={t && <Etapas etapas={etapas} />}
      acciones={t && <Acciones codigo={codigo} onReimprimir={reimprimir} onPdf={(m) => pdfRecibo(m, tipo, t)} />}
    >
      {q.isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : q.isError || !t ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No se pudo cargar la trazabilidad.</p>
      ) : tipo === 'canal' ? (
        <InformeCanalRecibida t={t as TrazabilidadReciboCanal} />
      ) : (
        <InformePosta t={t as TrazabilidadReciboPosta} />
      )}
    </Dialog>
  );
}

function PasoOrden({ t, prefijo, titulo }: { t: Traza; prefijo: 'RC' | 'RP'; titulo: string }) {
  const o = t.orden;
  return (
    <Paso id="tr-recibo" tono="origen" icon={ClipboardList} titulo={`${titulo} · ${prefijo}${o.receiptNumber}`} at={o.createdAt} operario={o.creadaPor}>
      <Grid>
        <Dato label="Cliente" valor={o.cliente.concepto} />
        <Dato label="NIT" valor={o.cliente.nit ?? '—'} />
        <Dato label="Bodega" valor={t.bodega?.nombre ?? 'Se asigna al cerrar'} />
        <Dato label="Estado de la orden" valor={estadoOrden(o.status)} />
        <Dato label="Fecha de registro" valor={fecha(o.registrationDate)} />
        <Dato label="Fecha de proceso" valor={fecha(o.processDate)} />
        <Dato label="Cerrada" valor={o.cerradaAt ? fechaHora(o.cerradaAt) : '—'} />
        <Dato label="Cerrada por (supervisor)" valor={o.cerradaPor ?? '—'} />
      </Grid>
    </Paso>
  );
}

function PasosComunes({ t, ubicacion }: { t: Traza; ubicacion: string }) {
  const s = t.salida;
  return (
    <>
      <Paso
        tono="proceso"
        icon={Printer}
        titulo={`Reimpresiones del rótulo${t.reimpresiones.length ? ` (${t.reimpresiones.length})` : ''}`}
        vacio={!t.reimpresiones.length && 'El rótulo no se ha reimpreso.'}
      >
        <Tabla
          columnas={['Fecha y hora', 'Usuario', 'Estación']}
          filas={t.reimpresiones.map((r) => [fechaHora(r.at), r.usuario ?? '—', r.estacion ?? '—'])}
        />
      </Paso>
      <Paso
        id="tr-inventario"
        tono="proceso"
        icon={Warehouse}
        titulo="Entrada al inventario"
        at={t.orden.cerradaAt}
        operario={t.orden.cerradaPor}
        vacio={!t.bodega && 'Aún no entra al inventario: entra a la bodega del cliente cuando un supervisor cierra la orden de recibo.'}
      >
        <Grid>
          <Dato label="Ubicación" valor={ubicacion} />
          <Dato label="Bodega" valor={t.bodega?.nombre ?? '—'} />
          <Dato label="Cliente de la bodega" valor={t.bodega?.cliente ?? '—'} />
          <Dato label="En inventario" valor={t.enInventario ? 'SÍ' : 'NO'} />
        </Grid>
      </Paso>
      <Paso
        id="tr-salida"
        tono="salida"
        icon={Truck}
        titulo={s ? `${SALIDA[s.tipo]} · ${s.orden}` : 'Salida'}
        at={s?.at}
        operario={s?.por}
        vacio={!s && 'Aún no ha salido en ninguna orden de despacho.'}
      >
        {s && (
          <Grid>
            <Dato label="Orden" valor={s.orden} />
            <Dato label="Estado" valor={s.cerrada ? 'CERRADA · SALIÓ DEL INVENTARIO' : 'ACTIVA · SIGUE EN PLANTA'} />
            <Dato label="Peso de despacho" valor={kgs(s.despachoKg)} />
            <Dato label="Cerrada" valor={s.cerradaAt ? fechaHora(s.cerradaAt) : '—'} />
          </Grid>
        )}
      </Paso>
      <Paso icon={CircleCheck} titulo={s?.cerrada ? 'Fuera de planta' : t.enInventario ? 'En inventario' : 'Recibo abierto'} final>
        <p className="text-sm text-muted-foreground">
          {s?.cerrada
            ? `Salió de planta con la orden ${s.orden}.`
            : s
              ? `Asignada a la orden ${s.orden}; sigue en planta hasta que se cierre.`
              : t.enInventario
                ? `Disponible en ${ubicacion}.`
                : 'Pendiente de cerrar la orden de recibo.'}
        </p>
      </Paso>
    </>
  );
}

function InformeCanalRecibida({ t }: { t: TrazabilidadReciboCanal }) {
  const i = t.item;
  return (
    <div className="space-y-5">
      <Resumen
        estado={{ ...estadoDe(t, `DISPONIBLE · ${i.cava}`), detalle: 'Canal recibida de tercero' }}
        kpis={[
          { label: 'Peso recibido', valor: kgs(i.pesoKg) },
          { label: 'Peso de despacho', valor: kgs(t.salida?.despachoKg ?? null), detalle: t.salida ? t.salida.orden : 'Sin salida' },
          {
            label: 'Merma',
            valor: t.salida?.despachoKg != null ? kgs(i.pesoKg - t.salida.despachoKg) : '—',
          },
        ]}
        datos={[
          ['Pieza', <span className="text-base font-bold">{pieza('RC', t.orden.receiptNumber, i.codigo)}</span>],
          ['Cliente', t.orden.cliente.concepto],
          ['Guía', i.guia ?? '—'],
          ['Lote', i.lote ?? '—'],
          ['Identificación', i.identificacion ?? '—'],
          ['Cava', i.cava],
          ['Bodega', t.bodega?.nombre ?? '—'],
          ['Recibida', fechaHora(i.createdAt)],
        ]}
      />
      <Linea>
        <PasoOrden t={t} prefijo="RC" titulo="Recibo de canales" />
        <Paso id="tr-ingreso" tono="origen" icon={Beef} titulo="Ingreso de la canal" at={i.createdAt} operario={i.registradoPor}>
          <Grid>
            <Dato label="Pieza" valor={pieza('RC', t.orden.receiptNumber, i.codigo)} />
            <Dato label="Peso" valor={kgs(i.pesoKg)} />
            <Dato label="Guía" valor={i.guia ?? '—'} />
            <Dato label="Lote" valor={i.lote ?? '—'} />
            <Dato label="Identificación" valor={i.identificacion ?? '—'} />
            <Dato label="Cava asignada" valor={i.cava} />
          </Grid>
        </Paso>
        <PasosComunes t={t} ubicacion={i.cava} />
      </Linea>
    </div>
  );
}

function InformePosta({ t }: { t: TrazabilidadReciboPosta }) {
  const i = t.item;
  const dias = diasVence(i.fechaVencimiento);
  const congelado = i.conservacion === 'congelado';
  return (
    <div className="space-y-5">
      <Resumen
        estado={{ ...estadoDe(t, 'DISPONIBLE'), detalle: 'Producto recibido de tercero' }}
        kpis={[
          { label: 'Peso neto', valor: kgs(i.netoKg), detalle: `Bruto ${kgs(i.brutoKg)} · tara ${kgs(i.taraKg)}` },
          {
            label: 'Vencimiento',
            valor: fecha(i.fechaVencimiento),
            detalle: dias == null ? undefined : dias < 0 ? `Vencido hace ${-dias} día(s)` : dias === 0 ? 'Vence hoy' : `Faltan ${dias} día(s)`,
            alerta: dias != null && dias <= 3,
          },
          { label: 'Piezas · empaques', valor: `${i.piezas} · ${i.empaques}` },
        ]}
        datos={[
          ['Registro', <span className="text-base font-bold">{pieza('RP', t.orden.receiptNumber, i.codigo)}</span>],
          ['Producto', `${i.producto.codigo} · ${i.producto.nombre}`],
          ['Cliente', t.orden.cliente.concepto],
          ['Lote', i.lote ?? '—'],
          ['Conservación', congelado ? 'CONGELADO -18 °C A -25 °C' : i.conservacion ? 'REFRIGERADO 0 °C A 4 °C' : '—'],
          ['Sacrificio', fecha(i.fechaSacrificio)],
          ['Bodega', t.bodega?.nombre ?? '—'],
          ['Recibido', fechaHora(i.createdAt)],
        ]}
      />
      <Linea>
        <PasoOrden t={t} prefijo="RP" titulo="Recibo en posta" />
        <Paso id="tr-ingreso" tono="origen" icon={Scale} titulo="Pesaje" at={i.createdAt} operario={i.registradoPor}>
          <Grid>
            <Dato label="Producto" valor={`${i.producto.codigo} · ${i.producto.nombre}`} />
            <Dato label="Categoría" valor={i.producto.categoria ?? '—'} />
            <Dato label="Piezas" valor={i.piezas} />
            <Dato label="Empaques" valor={i.empaques} />
            <Dato label="Bruto" valor={kgs(i.brutoKg)} />
            <Dato label="Tara" valor={kgs(i.taraKg)} />
            <Dato label="Neto" valor={<b>{kgs(i.netoKg)}</b>} />
          </Grid>
        </Paso>
        <Paso tono="origen" icon={Tag} titulo="Rótulo">
          <Grid>
            <Dato label="Lote" valor={i.lote ?? '—'} />
            <Dato label="Conservación" valor={i.conservacion ?? '—'} />
            <Dato label="Sacrificio" valor={fecha(i.fechaSacrificio)} />
            <Dato label="Vencimiento" valor={fecha(i.fechaVencimiento)} />
          </Grid>
        </Paso>
        <PasosComunes t={t} ubicacion={t.bodega ? `Bodega ${t.bodega.nombre}` : 'Recibo en posta'} />
      </Linea>
    </div>
  );
}

async function pdfRecibo(modal: HTMLElement, tipo: 'canal' | 'posta', t: Traza) {
  const o = t.orden;
  await descargarTrazabilidadPdf(modal, {
    titulo: tipo === 'canal' ? 'Trazabilidad de canal recibida' : 'Trazabilidad de producto recibido en posta',
    codigo: pieza(tipo === 'canal' ? 'RC' : 'RP', o.receiptNumber, t.item.codigo),
    subtitulo: o.cliente.concepto,
    estado: estadoDe(t, 'DISPONIBLE').label,
  });
}

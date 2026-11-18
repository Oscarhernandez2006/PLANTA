import { Beef, ClipboardList, LoaderCircle, MapPin, Package, Printer, Scale, Tag, Warehouse } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fecha } from './BodegasTab';
import { Dato, Grid, Paso, Tabla, estadoOrden, fechaHora, kgs } from './TrazabilidadCanalDialog';
import {
  useTrazabilidadReciboCanal,
  useTrazabilidadReciboPosta,
  type TrazabilidadReciboCanal,
  type TrazabilidadReciboPosta,
} from './api';

const pieza = (prefijo: 'RC' | 'RP', orden: number, codigo: number) =>
  `${prefijo}${orden}-${String(codigo).padStart(2, '0')}`;

/** Días que faltan para el vencimiento (negativo = vencido). */
function diasVence(iso: string | null) {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoy.getTime()) / 86_400_000);
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

  const descripcion = !t
    ? undefined
    : tipo === 'canal'
      ? `${pieza('RC', t.orden.receiptNumber, t.item.codigo)} · ${t.orden.cliente.name}`
      : `${pieza('RP', t.orden.receiptNumber, t.item.codigo)} · ${(t as TrazabilidadReciboPosta).item.producto.nombre}`;

  return (
    <Dialog
      open
      onClose={onClose}
      title={tipo === 'canal' ? 'Trazabilidad de la canal recibida' : 'Trazabilidad del producto recibido en posta'}
      description={descripcion}
      className="max-w-4xl"
      scrollInterno
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

function Estado({ enInventario, texto }: { enInventario: boolean; texto: string }) {
  return (
    <span
      className={cn(
        'rounded-sm px-2 py-0.5 text-xs font-bold',
        enInventario ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground',
      )}
    >
      {enInventario ? texto : 'FUERA DE INVENTARIO'}
    </span>
  );
}

function PasoOrden({ t, prefijo, titulo }: { t: TrazabilidadReciboCanal | TrazabilidadReciboPosta; prefijo: 'RC' | 'RP'; titulo: string }) {
  const o = t.orden;
  return (
    <Paso icon={ClipboardList} titulo={`${titulo} · ${prefijo}${o.receiptNumber}`} at={o.createdAt} operario={o.creadaPor}>
      <Grid>
        <Dato label="Cliente" valor={o.cliente.name} />
        <Dato label="NIT" valor={o.cliente.nit} />
        <Dato label="Sede" valor={o.cliente.sede} />
        <Dato label="Estado de la orden" valor={estadoOrden(o.status)} />
        <Dato label="Fecha de registro" valor={fecha(o.registrationDate)} />
        <Dato label="Fecha de proceso" valor={fecha(o.processDate)} />
        <Dato label="Cerrada" valor={o.cerradaAt ? fechaHora(o.cerradaAt) : '—'} />
        <Dato label="Cerrada por (supervisor)" valor={o.cerradaPor ?? '—'} />
      </Grid>
    </Paso>
  );
}

function PasoReimpresiones({ t }: { t: TrazabilidadReciboCanal | TrazabilidadReciboPosta }) {
  return (
    <Paso
      icon={Printer}
      titulo={`Reimpresiones del rótulo (${t.reimpresiones.length})`}
      vacio={!t.reimpresiones.length && 'El rótulo no se ha reimpreso.'}
    >
      <Tabla
        columnas={['Fecha y hora', 'Usuario', 'Estación']}
        filas={t.reimpresiones.map((r) => [fechaHora(r.at), r.usuario ?? '—', r.estacion ?? '—'])}
      />
    </Paso>
  );
}

function PasoUbicacion({ t, ubicacion }: { t: TrazabilidadReciboCanal | TrazabilidadReciboPosta; ubicacion: string }) {
  return (
    <Paso icon={Warehouse} titulo="Ubicación en inventario" final={t.enInventario}>
      <Grid>
        <Dato label="Ubicación" valor={ubicacion} />
        <Dato label="Bodega" valor={t.bodega ? t.bodega.nombre : 'Sin bodega asociada'} />
        <Dato label="Cliente de la bodega" valor={t.bodega?.cliente ?? '—'} />
        <Dato label="Estado" valor={<Estado enInventario={t.enInventario} texto="EN INVENTARIO" />} />
      </Grid>
      {!t.bodega && (
        <p className="text-xs text-muted-foreground">
          El NIT del cliente del recibo no coincide con ningún cliente del maestro: se ve en el tablero y en la cava, pero
          no dentro de una bodega.
        </p>
      )}
    </Paso>
  );
}

function InformeCanalRecibida({ t }: { t: TrazabilidadReciboCanal }) {
  const i = t.item;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 rounded-md border-2 border-border p-4 sm:grid-cols-4">
        <Dato label="Pieza" valor={<span className="text-lg font-bold">{pieza('RC', t.orden.receiptNumber, i.codigo)}</span>} />
        <Dato label="Origen" valor="RECIBO DE CANALES (TERCERO)" />
        <Dato label="Peso recibido" valor={kgs(i.pesoKg)} />
        <Dato label="Estado actual" valor={<Estado enInventario={t.enInventario} texto={`DISPONIBLE · ${i.cava}`} />} />
        <Dato label="Guía" valor={i.guia ?? '—'} />
        <Dato label="Lote" valor={i.lote ?? '—'} />
        <Dato label="Identificación" valor={i.identificacion ?? '—'} />
        <Dato label="Cava" valor={i.cava} />
      </div>

      <ol className="relative space-y-4 border-l-2 border-border pl-6">
        <PasoOrden t={t} prefijo="RC" titulo="Recibo de canales" />
        <Paso icon={Beef} titulo="Ingreso de la canal" at={i.createdAt} operario={i.registradoPor}>
          <Grid>
            <Dato label="Pieza" valor={pieza('RC', t.orden.receiptNumber, i.codigo)} />
            <Dato label="Peso" valor={kgs(i.pesoKg)} />
            <Dato label="Guía" valor={i.guia ?? '—'} />
            <Dato label="Lote" valor={i.lote ?? '—'} />
            <Dato label="Identificación" valor={i.identificacion ?? '—'} />
            <Dato label="Cava asignada" valor={i.cava} />
          </Grid>
        </Paso>
        <PasoReimpresiones t={t} />
        <PasoUbicacion t={t} ubicacion={i.cava} />
      </ol>
    </div>
  );
}

function InformePosta({ t }: { t: TrazabilidadReciboPosta }) {
  const i = t.item;
  const dias = diasVence(i.fechaVencimiento);
  const congelado = i.conservacion === 'congelado';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 rounded-md border-2 border-border p-4 sm:grid-cols-4">
        <Dato label="Registro" valor={<span className="text-lg font-bold">{pieza('RP', t.orden.receiptNumber, i.codigo)}</span>} />
        <Dato label="Producto" valor={`${i.producto.codigo} · ${i.producto.nombre}`} />
        <Dato label="Peso neto" valor={kgs(i.netoKg)} />
        <Dato label="Estado actual" valor={<Estado enInventario={t.enInventario} texto="DISPONIBLE" />} />
        <Dato label="Lote" valor={i.lote ?? '—'} />
        <Dato label="Conservación" valor={congelado ? 'CONGELADO -18 °C A -25 °C' : i.conservacion ? 'REFRIGERADO 0 °C A 4 °C' : '—'} />
        <Dato label="Sacrificio" valor={fecha(i.fechaSacrificio)} />
        <Dato
          label="Vencimiento"
          valor={
            i.fechaVencimiento ? (
              <span className={cn(dias != null && dias < 0 && 'font-bold text-red-600', dias != null && dias >= 0 && dias <= 3 && 'font-bold text-amber-700')}>
                {fecha(i.fechaVencimiento)}
                {dias != null && ` (${dias < 0 ? `vencido hace ${-dias} d` : dias === 0 ? 'vence hoy' : `faltan ${dias} d`})`}
              </span>
            ) : (
              '—'
            )
          }
        />
      </div>

      <ol className="relative space-y-4 border-l-2 border-border pl-6">
        <PasoOrden t={t} prefijo="RP" titulo="Recibo en posta" />
        <Paso icon={Scale} titulo="Pesaje" at={i.createdAt} operario={i.registradoPor}>
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
        <Paso icon={Tag} titulo="Rótulo">
          <Grid>
            <Dato label="Lote" valor={i.lote ?? '—'} />
            <Dato label="Conservación" valor={i.conservacion ?? '—'} />
            <Dato label="Sacrificio" valor={fecha(i.fechaSacrificio)} />
            <Dato label="Vencimiento" valor={fecha(i.fechaVencimiento)} />
          </Grid>
        </Paso>
        <PasoReimpresiones t={t} />
        <PasoUbicacion t={t} ubicacion={t.bodega ? `Bodega ${t.bodega.nombre}` : 'Recibo en posta'} />
      </ol>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Package className="size-3.5" /> Producto de tercero: no tiene canal ni guía de origen en esta planta.
        <MapPin className="ml-2 size-3.5" /> Cliente {t.orden.cliente.name} ({t.orden.cliente.sede}).
      </p>
    </div>
  );
}

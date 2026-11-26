import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';

const PRODUCTO_PIEZA: Record<string, string> = {
  canal: 'CANAL BOVINO',
  cizq: 'MEDIA CANAL BOVINO IZQ.',
  cder: 'MEDIA CANAL BOVINO DER.',
};

/** Código del presinto de la canal (mismo formato que `barcodeDe` en dispatch-order.service). */
function barcodeCanal(p: {
  pieza: string;
  turno: number | null;
  evento: { sequence: number; canalTipo: string | null; ordenBeneficio: { reference: string | number } };
}) {
  const digito = p.evento.canalTipo === 'canal_completa' ? 1 : p.pieza === 'cizq' ? 2 : 3;
  const lado = p.pieza === 'cizq' ? 'I' : p.pieza === 'cder' ? 'D' : '';
  return `${p.evento.ordenBeneficio.reference}-${p.turno ?? p.evento.sequence}${digito}${lado}`;
}

const fechaISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

const guiaSelect = {
  numero: true,
  fecha: true,
  tipoVehiculo: true,
  placa: true,
  conductor: true,
  cedula: true,
  observacion: true,
} as const;

/** DC3-GM1 (remisión única) o DC3-GM1-T01 (remisión de la tienda N.º 1 de la orden). */
export function codigoRemision(dcNumber: number, guia: number | null, tienda: number | null) {
  return [`DC${dcNumber}`, guia != null ? `GM${guia}` : null, tienda != null ? `T${String(tienda).padStart(2, '0')}` : null]
    .filter(Boolean)
    .join('-');
}

export const nombreTienda = (t: { tiendaCodigo: string | null; tiendaNombre: string | null }) =>
  [t.tiendaCodigo, t.tiendaNombre].filter(Boolean).join(' - ') || null;

type Linea = { producto: string; lote: string; unds: number; kg: number; fechaSacrificio: string | null };
/** Línea sin consolidar: un código de barras pistoleado en el despacho. */
type LineaCodigo = Linea & { codigo: string; tipoCodigo: 'CANAL' | 'PIEZA' | 'CANASTILLA' };

/**
 * Datos de la guía de transporte (remisión) de una orden de despacho de canales cerrada:
 * planta, destino (punto de envío o el cliente), productos por lote y vehículo.
 */
@Injectable()
export class RemisionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Remisiones de la orden. Despacho posta al cliente con tiendas: una por pre-orden (tienda),
   * cada una en la guía de su camión. Si no, una sola remisión para toda la orden.
   */
  async remisiones(ctx: AuthContext, id: string) {
    const dc = await this.prisma.canalDispatchOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        dcNumber: true,
        guiaTransporte: { select: { numero: true, placa: true, conductor: true } },
        puntoEnvio: { select: { razonSocial: true } },
        cliente: { select: { concepto: true } },
      },
    });
    if (!dc) throw new NotFoundException('Orden de despacho de canales no encontrada.');
    const tiendas = await this.prisma.picking.findMany({
      where: { canalDispatchOrderId: dc.id, guiaTransporteId: { not: null } },
      orderBy: [{ remisionNumero: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        ocNumero: true,
        tiendaCodigo: true,
        tiendaNombre: true,
        remisionNumero: true,
        guiaTransporte: { select: { numero: true, placa: true, conductor: true } },
        despachoItems: { select: { netoKg: true } },
      },
    });
    if (!tiendas.length) {
      return [
        {
          pickingId: null,
          codigo: codigoRemision(dc.dcNumber, dc.guiaTransporte?.numero ?? null, null),
          destino: dc.puntoEnvio?.razonSocial ?? dc.cliente.concepto,
          tienda: null,
          ocNumero: null,
          guia: dc.guiaTransporte,
          empaques: null,
          kg: null,
        },
      ];
    }
    return tiendas.map((t) => ({
      pickingId: t.id,
      codigo: codigoRemision(dc.dcNumber, t.guiaTransporte?.numero ?? null, t.remisionNumero),
      destino: nombreTienda(t) ?? dc.cliente.concepto,
      tienda: t.tiendaCodigo || t.tiendaNombre ? { codigo: t.tiendaCodigo, nombre: t.tiendaNombre } : null,
      ocNumero: t.ocNumero,
      guia: t.guiaTransporte,
      empaques: t.despachoItems.length,
      kg: Math.round(t.despachoItems.reduce((s, i) => s + Number(i.netoKg), 0) * 100) / 100,
    }));
  }

  /** Datos del PDF de la remisión; `pickingId` elige la remisión de una tienda. */
  async remision(ctx: AuthContext, id: string, pickingId?: string) {
    const dc = await this.prisma.canalDispatchOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        dcNumber: true,
        tipo: true,
        status: true,
        processDate: true,
        cerradaAt: true,
        updatedAt: true,
        clienteId: true,
        plant: { select: { legalName: true, invimaRegistry: true } },
        cliente: { select: { concepto: true, nit: true, direccion: true, telefono: true, celular: true, ciudad: true } },
        puntoEnvio: {
          select: { razonSocial: true, nit: true, telefono: true, direccion: true, municipio: true, departamento: true },
        },
        guiaTransporte: { select: guiaSelect },
        createdBy: { select: { fullName: true } },
      },
    });
    if (!dc) throw new NotFoundException('Orden de despacho de canales no encontrada.');

    const porTienda = await this.prisma.picking.count({
      where: { canalDispatchOrderId: dc.id, guiaTransporteId: { not: null } },
    });
    if (porTienda && !pickingId) {
      throw new BadRequestException('La orden tiene una remisión por tienda: elige cuál.');
    }
    const tienda = pickingId
      ? await this.prisma.picking.findFirst({
          where: { id: pickingId, canalDispatchOrderId: dc.id, guiaTransporteId: { not: null } },
          select: {
            id: true,
            ocNumero: true,
            tiendaCodigo: true,
            tiendaNombre: true,
            remisionNumero: true,
            guiaTransporte: { select: guiaSelect },
          },
        })
      : null;
    if (pickingId && !tienda) throw new NotFoundException('Remisión no encontrada en esta orden.');
    const datosTienda = tienda?.tiendaCodigo
      ? await this.prisma.clienteTienda.findFirst({
          where: { clienteId: dc.clienteId, codigo: tienda.tiendaCodigo },
          select: { direccion: true, ciudad: true },
        })
      : null;

    const lineas = dc.tipo === 'posta' ? await this.lineasPosta(dc.id, tienda?.id) : await this.lineasCanales(dc.id);
    const grupos = new Map<string, Linea>();
    for (const { codigo: _codigo, tipoCodigo: _tipo, ...l } of lineas) {
      const k = `${l.producto}|${l.lote}`;
      const g = grupos.get(k);
      if (g) {
        g.unds += l.unds;
        g.kg += l.kg;
        if (l.fechaSacrificio && (!g.fechaSacrificio || l.fechaSacrificio < g.fechaSacrificio)) {
          g.fechaSacrificio = l.fechaSacrificio;
        }
      } else grupos.set(k, { ...l });
    }
    const items = [...grupos.values()]
      .sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote, undefined, { numeric: true }))
      .map((g) => ({ ...g, kg: Math.round(g.kg * 100) / 100 }));
    const fechasSacrificio = [...new Set(items.map((i) => i.fechaSacrificio).filter((f): f is string => !!f))].sort();

    const c = dc.cliente;
    const p = dc.puntoEnvio;
    const g = tienda ? tienda.guiaTransporte : dc.guiaTransporte;
    return {
      id: dc.id,
      pickingId: tienda?.id ?? null,
      codigo: codigoRemision(dc.dcNumber, g?.numero ?? null, tienda?.remisionNumero ?? null),
      dcNumber: dc.dcNumber,
      tipo: dc.tipo,
      status: dc.status,
      processDate: fechaISO(dc.processDate),
      cerradaAt: (dc.cerradaAt ?? dc.updatedAt).toISOString(),
      planta: { razonSocial: dc.plant.legalName, invima: dc.plant.invimaRegistry },
      cliente: { razonSocial: c.concepto, nit: c.nit },
      destino: p
        ? {
            puntoEnvio: true,
            razonSocial: p.razonSocial,
            nit: p.nit,
            telefono: p.telefono,
            direccion: p.direccion,
            municipio: p.municipio,
            departamento: p.departamento,
            tienda: null,
          }
        : {
            puntoEnvio: false,
            razonSocial: c.concepto,
            nit: c.nit,
            telefono: c.telefono ?? c.celular,
            direccion: datosTienda?.direccion || c.direccion,
            municipio: datosTienda?.ciudad || c.ciudad,
            departamento: null,
            tienda:
              tienda && (tienda.tiendaCodigo || tienda.tiendaNombre || tienda.ocNumero)
                ? { codigo: tienda.tiendaCodigo, nombre: tienda.tiendaNombre, ocNumero: tienda.ocNumero }
                : null,
          },
      guia: g ? { ...g, fecha: fechaISO(g.fecha) } : null,
      despachador: dc.createdBy.fullName,
      fechasSacrificio,
      items,
      // Vista interna: un renglón por código de barras pistoleado (sin consolidar).
      detalle: lineas
        .map((l) => ({ ...l, kg: Math.round(l.kg * 100) / 100 }))
        .sort(
          (a, b) =>
            a.producto.localeCompare(b.producto) ||
            a.lote.localeCompare(b.lote, undefined, { numeric: true }) ||
            a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
        ),
    };
  }

  /** Despacho caliente/frío: canales propias (lote = OB) y canales recibidas (lote = RC). */
  private async lineasCanales(dcId: string): Promise<LineaCodigo[]> {
    const [propias, recibidas] = await Promise.all([
      this.prisma.canalDispatchOrderItem.findMany({
        where: { canalDispatchOrderId: dcId },
        select: {
          pesoCalienteKg: true,
          despachoKg: true,
          canalPieza: {
            select: {
              pieza: true,
              turno: true,
              evento: {
                select: { sequence: true, canalTipo: true, ordenBeneficio: { select: { reference: true, date: true } } },
              },
            },
          },
        },
      }),
      this.prisma.canalReceiptItem.findMany({
        where: { canalDispatchOrderId: dcId },
        select: {
          codigo: true,
          pesoKg: true,
          despachoKg: true,
          lote: true,
          receiptOrder: { select: { receiptNumber: true, processDate: true } },
        },
      }),
    ]);
    return [
      ...propias.map((i) => ({
        codigo: barcodeCanal(i.canalPieza),
        tipoCodigo: 'CANAL' as const,
        producto: PRODUCTO_PIEZA[i.canalPieza.pieza] ?? 'CANAL BOVINO',
        lote: `OB${i.canalPieza.evento.ordenBeneficio.reference}`,
        unds: 1,
        kg: Number(i.despachoKg ?? i.pesoCalienteKg),
        fechaSacrificio: fechaISO(i.canalPieza.evento.ordenBeneficio.date),
      })),
      ...recibidas.map((i) => ({
        codigo: String(i.codigo),
        tipoCodigo: 'CANAL' as const,
        producto: 'CANAL BOVINO',
        lote: i.lote?.trim() || `RC${i.receiptOrder.receiptNumber}`,
        unds: 1,
        kg: Number(i.despachoKg ?? i.pesoKg),
        fechaSacrificio: fechaISO(i.receiptOrder.processDate),
      })),
    ];
  }

  /** Despacho posta: productos rotulados (lote = OP / OC / lote del recibo en posta). */
  private async lineasPosta(dcId: string, pickingId?: string): Promise<LineaCodigo[]> {
    const items = await this.prisma.dispatchProductItem.findMany({
      where: { canalDispatchOrderId: dcId, ...(pickingId ? { pickingId } : {}) },
      orderBy: { createdAt: 'asc' },
      select: {
        codigo: true,
        canastillaId: true,
        unds: true,
        netoKg: true,
        product: { select: { nombre: true } },
        etiqueta: { select: { fechaSacrificio: true, productionOrder: { select: { opNumber: true } } } },
        canastilla: {
          select: {
            productionOrder: { select: { opNumber: true } },
            etiquetas: { select: { fechaSacrificio: true }, orderBy: { fechaSacrificio: 'asc' }, take: 1 },
          },
        },
        acondEtiqueta: { select: { fechaSacrificio: true, conditioningOrder: { select: { ocNumber: true } } } },
        postaItem: { select: { lote: true, fechaSacrificio: true, receiptOrder: { select: { receiptNumber: true } } } },
      },
    });
    return items.map((i) => {
      const op = i.etiqueta?.productionOrder.opNumber ?? i.canastilla?.productionOrder.opNumber;
      const lote = op
        ? `OP${op}`
        : i.acondEtiqueta
          ? `OC${i.acondEtiqueta.conditioningOrder.ocNumber}`
          : i.postaItem
            ? i.postaItem.lote?.trim() || `RP${i.postaItem.receiptOrder.receiptNumber}`
            : '—';
      return {
        codigo: i.codigo,
        tipoCodigo: i.canastillaId ? ('CANASTILLA' as const) : ('PIEZA' as const),
        producto: i.product.nombre.toUpperCase(),
        lote,
        unds: i.unds,
        kg: Number(i.netoKg),
        fechaSacrificio: fechaISO(
          i.etiqueta?.fechaSacrificio ??
            i.canastilla?.etiquetas[0]?.fechaSacrificio ??
            i.acondEtiqueta?.fechaSacrificio ??
            i.postaItem?.fechaSacrificio,
        ),
      };
    });
  }
}

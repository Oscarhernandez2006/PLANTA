import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';
import { SUBPRODUCTO_ITEM_BY_TIPO } from '../subproductos/subproducto-items';

@Injectable()
export class InventariosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Piezas de canal (CIZQ/CDER/completa) actualmente ubicadas en una cava de Canal Caliente. */
  async cava(ctx: AuthContext, cava: string, dateStr?: string) {
    const date = dateStr ? plantDateOnly(dateStr) : undefined;
    const piezas = await this.prisma.canalPieza.findMany({
      where: {
        cava,
        evento: {
          ordenBeneficio: {
            plantId: ctx.plantId,
            deletedAt: null,
            ...(date && { date }),
          },
        },
      },
      orderBy: [{ weighedAt: 'desc' }],
      include: {
        evento: {
          include: {
            ordenBeneficio: {
              select: { reference: true, cliente: true, date: true },
            },
          },
        },
      },
      take: 300,
    });
    return piezas.map((p) => ({
      piezaId: p.id,
      eventoId: p.eventoId,
      reference: p.evento.ordenBeneficio.reference,
      cliente: p.evento.ordenBeneficio.cliente,
      date: p.evento.ordenBeneficio.date.toISOString().slice(0, 10),
      canalAnimalTipo: p.evento.canalAnimalTipo,
      pieza: p.pieza,
      bodega: p.bodega,
      destino: p.destino,
      observaciones: p.observaciones,
      pesoKg: Number(p.pesoKg),
    }));
  }

  /** Subproductos (vísceras) actualmente ubicados en una cava de subproducto. */
  async cavaSubproducto(ctx: AuthContext, cava: string, dateStr?: string) {
    const date = dateStr ? plantDateOnly(dateStr) : undefined;
    const items = await this.prisma.subproductoItem.findMany({
      where: {
        cava,
        evento: {
          ordenBeneficio: {
            plantId: ctx.plantId,
            deletedAt: null,
            ...(date && { date }),
          },
        },
      },
      orderBy: [{ registradoAt: 'desc' }],
      include: {
        evento: {
          select: {
            ordenBeneficio: {
              select: { reference: true, cliente: true, date: true },
            },
          },
        },
      },
      take: 300,
    });
    return items.map((i) => {
      const def = SUBPRODUCTO_ITEM_BY_TIPO.get(i.tipo);
      return {
        itemId: i.id,
        tipo: i.tipo,
        codigo: def?.codigo ?? '',
        label: def?.label ?? i.tipo,
        unidad: def?.unidad ?? 'unidad',
        categoria: def?.categoria ?? 'retoma',
        cantidad: def?.unidad === 'unidad' ? (def?.multiplicador ?? 1) : null,
        pesoKg: i.pesoKg ? Number(i.pesoKg) : null,
        reference: i.evento.ordenBeneficio.reference,
        cliente: i.evento.ordenBeneficio.cliente,
        date: i.evento.ordenBeneficio.date.toISOString().slice(0, 10),
        registradoAt: i.registradoAt?.toISOString() ?? null,
      };
    });
  }
}

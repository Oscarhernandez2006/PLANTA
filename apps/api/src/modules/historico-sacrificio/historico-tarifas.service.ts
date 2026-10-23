import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { SaveTarifaSacrificioDto, SaveTarifaSubproductoDto } from './dto/save-tarifa.dto';
import { nombreTarifa } from './historico-beneficio.sync';

/**
 * Hoja TARIFAS del Histórico Sacrificio. Cambiar una tarifa no toca las filas
 * ya guardadas: aplica a las que se registren o se editen después (y a las
 * órdenes que se terminen en Canal Caliente desde ese momento).
 */
@Injectable()
export class HistoricoTarifasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Evita dos tarifas para el mismo cliente escrito distinto ("X" y "X SAS"). */
  private async assertNoRepetido(
    tabla: 'historicoTarifa' | 'historicoTarifaSubproducto',
    ctx: AuthContext,
    cliente: string,
    excludeId?: string,
  ) {
    const nombre = nombreTarifa(cliente);
    const rows: { id: string; cliente: string }[] =
      tabla === 'historicoTarifa'
        ? await this.prisma.historicoTarifa.findMany({ where: { plantId: ctx.plantId }, select: { id: true, cliente: true } })
        : await this.prisma.historicoTarifaSubproducto.findMany({ where: { plantId: ctx.plantId }, select: { id: true, cliente: true } });
    const repetido = rows.find((r) => r.id !== excludeId && nombreTarifa(r.cliente) === nombre);
    if (repetido) {
      throw new BadRequestException(`Ya existe una tarifa para "${repetido.cliente}".`);
    }
  }

  // ------------------------- Tarifa de sacrificio -------------------------

  async crearSacrificio(ctx: AuthContext, dto: SaveTarifaSacrificioDto) {
    const cliente = dto.cliente.trim();
    await this.assertNoRepetido('historicoTarifa', ctx, cliente);
    const r = await this.prisma.historicoTarifa.create({
      data: { plantId: ctx.plantId, cliente, valorBase: dto.valorBase },
    });
    return { id: r.id, cliente: r.cliente, valorBase: Number(r.valorBase) };
  }

  async actualizarSacrificio(ctx: AuthContext, id: string, dto: SaveTarifaSacrificioDto) {
    const existe = await this.prisma.historicoTarifa.findFirst({ where: { id, plantId: ctx.plantId } });
    if (!existe) throw new NotFoundException('Tarifa no encontrada.');
    const cliente = dto.cliente.trim();
    await this.assertNoRepetido('historicoTarifa', ctx, cliente, id);
    const r = await this.prisma.historicoTarifa.update({
      where: { id },
      data: { cliente, valorBase: dto.valorBase },
    });
    return { id: r.id, cliente: r.cliente, valorBase: Number(r.valorBase) };
  }

  async borrarSacrificio(ctx: AuthContext, id: string) {
    const existe = await this.prisma.historicoTarifa.findFirst({ where: { id, plantId: ctx.plantId } });
    if (!existe) throw new NotFoundException('Tarifa no encontrada.');
    await this.prisma.historicoTarifa.delete({ where: { id } });
    return { id };
  }

  // ------------------------- Tarifa de subproductos -------------------------

  private subproducto(dto: SaveTarifaSubproductoDto) {
    return {
      cliente: dto.cliente.trim(),
      cabezas: dto.cabezas ?? 0,
      despojos: dto.despojos ?? 0,
      libros: dto.libros ?? 0,
      pieles: dto.pieles ?? 0,
      sebo: dto.sebo ?? 0,
      viscerasRojas: dto.viscerasRojas ?? 0,
    };
  }

  async crearSubproducto(ctx: AuthContext, dto: SaveTarifaSubproductoDto) {
    await this.assertNoRepetido('historicoTarifaSubproducto', ctx, dto.cliente);
    const r = await this.prisma.historicoTarifaSubproducto.create({
      data: { plantId: ctx.plantId, ...this.subproducto(dto) },
    });
    return { id: r.id };
  }

  async actualizarSubproducto(ctx: AuthContext, id: string, dto: SaveTarifaSubproductoDto) {
    const existe = await this.prisma.historicoTarifaSubproducto.findFirst({ where: { id, plantId: ctx.plantId } });
    if (!existe) throw new NotFoundException('Tarifa no encontrada.');
    await this.assertNoRepetido('historicoTarifaSubproducto', ctx, dto.cliente, id);
    await this.prisma.historicoTarifaSubproducto.update({ where: { id }, data: this.subproducto(dto) });
    return { id };
  }

  async borrarSubproducto(ctx: AuthContext, id: string) {
    const existe = await this.prisma.historicoTarifaSubproducto.findFirst({ where: { id, plantId: ctx.plantId } });
    if (!existe) throw new NotFoundException('Tarifa no encontrada.');
    await this.prisma.historicoTarifaSubproducto.delete({ where: { id } });
    return { id };
  }
}

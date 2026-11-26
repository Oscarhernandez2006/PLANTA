import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { DespachoPostaService } from '../canal-dispatch-order/despacho-posta.service';
import { TransferOrderService } from '../transfer-order/transfer-order.service';
import {
  DIFERENCIA_ARRUME,
  TOLERANCIA_ARRUME_KG,
  arrumeAbierto,
  arrumeSelect,
  calcularArrume,
  excedeTolerancia,
  mensajeDiferencia,
  type ArrumeRow,
  type OrdenArrume,
} from './arrume';
import type { AgregarArrumeDto, PesoArrumeDto } from './picking.dto';
import { TIPOS_PICKING, type TipoPicking } from './picking.service';
import { repartirArrume } from './repartir-arrume';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Despacho por arrume (posta y traslado): se sube el arrume completo a la báscula, se captura
 * el peso y se pistolean sus canastillas (cada una se registra en la orden con el neto de su
 * etiqueta). Al terminarlo, si la diferencia con el neto pesado es de máximo 1 kg, el neto y la
 * tara se reparten entre sus etiquetas; si no, no se termina y la orden no se puede cerrar.
 */
@Injectable()
export class ArrumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posta: DespachoPostaService,
    private readonly traslado: TransferOrderService,
  ) {}

  private tipo(tipo: string): TipoPicking {
    if (!(TIPOS_PICKING as readonly string[]).includes(tipo)) throw new BadRequestException('Tipo de orden no válido.');
    return tipo as TipoPicking;
  }

  private ref(tipo: TipoPicking, ordenId: string): OrdenArrume {
    return tipo === 'posta' ? { canalDispatchOrderId: ordenId } : { transferOrderId: ordenId };
  }

  private async estadoOrden(ctx: AuthContext, tipo: TipoPicking, id: string) {
    const o =
      tipo === 'posta'
        ? await this.prisma.canalDispatchOrder.findFirst({
            where: { id, plantId: ctx.plantId, deletedAt: null, tipo: 'posta' },
            select: { status: true },
          })
        : await this.prisma.transferOrder.findFirst({
            where: { id, plantId: ctx.plantId, deletedAt: null },
            select: { status: true },
          });
    if (!o) throw new NotFoundException('Orden no encontrada.');
    return o.status;
  }

  private async ordenActiva(ctx: AuthContext, tipo: TipoPicking, id: string) {
    if ((await this.estadoOrden(ctx, tipo, id)) !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden no está activa.');
    }
  }

  private async dto(a: ArrumeRow) {
    const r = calcularArrume(a);
    const numero = await this.prisma.arrume.count({
      where: {
        canalDispatchOrderId: a.canalDispatchOrderId,
        transferOrderId: a.transferOrderId,
        createdAt: { lte: a.createdAt },
      },
    });
    return {
      id: a.id,
      numero,
      pesoBrutoKg: Number(a.pesoBrutoKg),
      taraCanastillaKg: Number(a.taraCanastillaKg),
      taraEstibaKg: Number(a.taraEstibaKg),
      canastillas: r.canastillas,
      taraTotalKg: r.taraTotalKg,
      netoKg: r.netoKg,
      netoEtiquetasKg: r.netoEtiquetasKg,
      diferenciaKg: r.diferenciaKg,
      toleranciaKg: TOLERANCIA_ARRUME_KG,
      items: r.items.map((i) => ({
        id: i.id,
        codigo: i.codigo,
        productoCodigo: i.product.codigo,
        productoNombre: i.product.nombre,
        unds: i.unds,
        netoEtiquetaKg: Number(i.netoEtiquetaKg),
      })),
    };
  }

  /** Arrume abierto (de la planta) por id, con su orden activa. */
  private async abiertoPorId(ctx: AuthContext, id: string) {
    const a = await this.prisma.arrume.findFirst({ where: { id, plantId: ctx.plantId }, select: arrumeSelect });
    if (!a) throw new NotFoundException('Arrume no encontrado.');
    if (a.terminadoAt) throw new BadRequestException('El arrume ya está terminado.');
    const tipo: TipoPicking = a.canalDispatchOrderId ? 'posta' : 'traslado';
    const ordenId = (a.canalDispatchOrderId ?? a.transferOrderId)!;
    await this.ordenActiva(ctx, tipo, ordenId);
    return { a, tipo, ordenId };
  }

  private async recargar(id: string) {
    return this.dto(await this.prisma.arrume.findUniqueOrThrow({ where: { id }, select: arrumeSelect }));
  }

  async abierto(ctx: AuthContext, tipoParam: string, ordenId: string) {
    const tipo = this.tipo(tipoParam);
    await this.estadoOrden(ctx, tipo, ordenId);
    const a = await arrumeAbierto(this.prisma, this.ref(tipo, ordenId));
    return { arrume: a ? await this.dto(a) : null };
  }

  /** Paso 1: el arrume está en la báscula y se captura su peso bruto. */
  async iniciar(ctx: AuthContext, tipoParam: string, ordenId: string, dto: PesoArrumeDto) {
    const tipo = this.tipo(tipoParam);
    await this.ordenActiva(ctx, tipo, ordenId);
    const ocupado = 'Ya hay un arrume abierto en esta orden: termínalo antes de pesar otro.';
    if (await arrumeAbierto(this.prisma, this.ref(tipo, ordenId))) throw new BadRequestException(ocupado);
    try {
      const a = await this.prisma.arrume.create({
        data: {
          plantId: ctx.plantId,
          ...this.ref(tipo, ordenId),
          pesoBrutoKg: dto.pesoBrutoKg,
          taraCanastillaKg: dto.taraCanastillaKg,
          taraEstibaKg: dto.taraEstibaKg ?? 0,
          createdById: ctx.userId,
        },
        select: arrumeSelect,
      });
      return this.dto(a);
    } catch (err) {
      // Índice único parcial: un solo arrume abierto por orden.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new BadRequestException(ocupado);
      throw err;
    }
  }

  /** Vuelve a pesar el arrume (p. ej. se bajó o subió una canastilla) o cambia sus taras. */
  async repesar(ctx: AuthContext, id: string, dto: PesoArrumeDto) {
    await this.abiertoPorId(ctx, id);
    await this.prisma.arrume.update({
      where: { id },
      data: { pesoBrutoKg: dto.pesoBrutoKg, taraCanastillaKg: dto.taraCanastillaKg, taraEstibaKg: dto.taraEstibaKg ?? 0 },
    });
    return this.recargar(id);
  }

  /** Paso 2: se pistolea una canastilla del arrume; debe estar en el picking (o PIN del supervisor). */
  async agregar(ctx: AuthContext, id: string, dto: AgregarArrumeDto) {
    const { a, tipo, ordenId } = await this.abiertoPorId(ctx, id);
    const codigo = dto.codigo.trim().toUpperCase();
    const info =
      tipo === 'posta'
        ? await this.posta.buscar(ctx, ordenId, codigo)
        : await this.traslado.buscarEtiqueta(ctx, ordenId, codigo);
    const taraKg = Number(a.taraCanastillaKg);
    // Hasta terminar el arrume cada etiqueta queda con su propio neto.
    const linea = { codigo: info.codigo, pesoKg: r2(info.netoEtiquetaKg + taraKg), taraKg, pin: dto.pin, pickingId: dto.pickingId };
    const opciones = { validarPicking: true, arrumeId: a.id };
    const [item] =
      tipo === 'posta'
        ? await this.posta.registrarVarios(ctx, ordenId, [linea], opciones)
        : await this.traslado.registrarVarios(ctx, ordenId, [linea], opciones);
    return { item, advertenciaInventario: info.advertenciaInventario, arrume: await this.recargar(id) };
  }

  /** Paso 3: cuadra el arrume (máx. 1 kg de diferencia) y reparte el neto pesado entre sus etiquetas. */
  async terminar(ctx: AuthContext, id: string) {
    const { a, tipo } = await this.abiertoPorId(ctx, id);
    const r = calcularArrume(a);
    if (!r.canastillas) throw new BadRequestException('Pistolea las canastillas del arrume antes de terminarlo.');
    if (excedeTolerancia(r.diferenciaKg)) {
      throw new BadRequestException({ statusCode: 400, error: DIFERENCIA_ARRUME, message: mensajeDiferencia(r.diferenciaKg) });
    }
    let lineas;
    try {
      lineas = repartirArrume(
        r.items.map((i) => Number(i.netoEtiquetaKg)),
        r.netoKg,
        r.taraTotalKg,
      );
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.arrume.updateMany({ where: { id, terminadoAt: null }, data: { terminadoAt: new Date() } });
      if (!count) throw new BadRequestException('El arrume ya está terminado.');
      for (const [k, i] of r.items.entries()) {
        const data = { pesoKg: lineas[k].pesoKg, taraKg: lineas[k].taraKg, netoKg: lineas[k].netoKg };
        if (tipo === 'posta') await tx.dispatchProductItem.update({ where: { id: i.id }, data });
        else await tx.transferOrderItem.update({ where: { id: i.id }, data });
      }
    });
    return this.recargar(id);
  }

  /** Cancela el arrume abierto: sus etiquetas salen de la orden. */
  async cancelar(ctx: AuthContext, id: string) {
    const { tipo } = await this.abiertoPorId(ctx, id);
    await this.prisma.$transaction(async (tx) => {
      if (tipo === 'posta') await tx.dispatchProductItem.deleteMany({ where: { arrumeId: id } });
      else await tx.transferOrderItem.deleteMany({ where: { arrumeId: id } });
      await tx.arrume.delete({ where: { id } });
    });
    return { ok: true };
  }
}

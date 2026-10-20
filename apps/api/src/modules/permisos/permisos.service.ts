import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { asegurarModulo, MODULO_PERMISOS } from '../../common/auth/modulos';
import { UpdatePermisosDto } from './dto/update-permisos.dto';

@Injectable()
export class PermisosService {
  constructor(private readonly prisma: PrismaService) {}

  private asegurarGestor(ctx: AuthContext) {
    return asegurarModulo(this.prisma, ctx, MODULO_PERMISOS);
  }

  async usuarios(ctx: AuthContext) {
    await this.asegurarGestor(ctx);
    return this.prisma.appUser.findMany({
      where: { plantId: ctx.plantId },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        documentId: true,
        role: true,
        active: true,
        accesoTotal: true,
        modulos: true,
      },
    });
  }

  async actualizar(ctx: AuthContext, userId: string, dto: UpdatePermisosDto) {
    await this.asegurarGestor(ctx);
    const usuario = await this.prisma.appUser.findFirst({
      where: { id: userId, plantId: ctx.plantId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    const modulos = [...new Set(dto.modulos)].sort();
    // Evita que quien administra se quite a sí mismo el acceso a Permisos.
    if (userId === ctx.userId && !dto.accesoTotal && !modulos.includes(MODULO_PERMISOS)) {
      throw new BadRequestException(
        'No puedes quitarte el acceso al módulo de Permisos a ti mismo.',
      );
    }

    return this.prisma.appUser.update({
      where: { id: userId },
      data: { accesoTotal: dto.accesoTotal, modulos },
      select: {
        id: true,
        fullName: true,
        documentId: true,
        role: true,
        active: true,
        accesoTotal: true,
        modulos: true,
      },
    });
  }
}

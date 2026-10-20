import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { asegurarModulo, MODULO_USUARIOS } from '../../common/auth/modulos';
import { CreateUsuarioDto, UpdateUsuarioDto } from './dto/usuario.dto';

const SELECT = {
  id: true,
  fullName: true,
  documentId: true,
  role: true,
  active: true,
  accesoTotal: true,
  modulos: true,
  lastLogin: true,
  createdAt: true,
} as const;

/** El login es por cédula + PIN; el email interno solo debe ser único. */
const emailInterno = (cedula: string) => `u${cedula}@planta.local`;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  private async cedulaLibre(documentId: string, excluirId?: string) {
    const otro = await this.prisma.appUser.findFirst({
      where: {
        OR: [{ documentId }, { email: emailInterno(documentId) }],
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
      select: { fullName: true },
    });
    if (otro) {
      throw new ConflictException(`La cédula ${documentId} ya está registrada (${otro.fullName}).`);
    }
  }

  async listar(ctx: AuthContext) {
    await asegurarModulo(this.prisma, ctx, MODULO_USUARIOS);
    return this.prisma.appUser.findMany({
      where: { plantId: ctx.plantId },
      orderBy: { fullName: 'asc' },
      select: SELECT,
    });
  }

  async crear(ctx: AuthContext, dto: CreateUsuarioDto) {
    await asegurarModulo(this.prisma, ctx, MODULO_USUARIOS);
    await this.cedulaLibre(dto.documentId);
    // Los usuarios nuevos no tienen módulos: se otorgan en Configuración → Permisos.
    return this.prisma.appUser.create({
      data: {
        plantId: ctx.plantId,
        email: emailInterno(dto.documentId),
        passwordHash: 'NO_USADO',
        pinHash: await bcrypt.hash(dto.pin, 10),
        documentId: dto.documentId,
        fullName: dto.fullName.trim(),
        role: dto.role,
        active: dto.active ?? true,
      },
      select: SELECT,
    });
  }

  async actualizar(ctx: AuthContext, id: string, dto: UpdateUsuarioDto) {
    await asegurarModulo(this.prisma, ctx, MODULO_USUARIOS);
    const actual = await this.prisma.appUser.findFirst({
      where: { id, plantId: ctx.plantId },
      select: { id: true, documentId: true, email: true },
    });
    if (!actual) throw new NotFoundException('Usuario no encontrado.');
    if (id === ctx.userId && dto.active === false) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    const cambiaCedula = dto.documentId != null && dto.documentId !== actual.documentId;
    if (cambiaCedula) await this.cedulaLibre(dto.documentId!, id);

    return this.prisma.appUser.update({
      where: { id },
      data: {
        ...(dto.fullName != null ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.role != null ? { role: dto.role } : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
        ...(dto.pin ? { pinHash: await bcrypt.hash(dto.pin, 10) } : {}),
        ...(cambiaCedula
          ? {
              documentId: dto.documentId,
              // El email interno sigue a la cédula (solo si era el generado).
              ...(actual.documentId && actual.email === emailInterno(actual.documentId)
                ? { email: emailInterno(dto.documentId!) }
                : {}),
            }
          : {}),
      },
      select: SELECT,
    });
  }
}

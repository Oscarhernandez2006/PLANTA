import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CheckCedulaDto } from './dto/check-cedula.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async checkCedula(dto: CheckCedulaDto) {
    const user = await this.prisma.appUser.findUnique({
      where: { documentId: dto.documentId },
      select: { fullName: true, active: true, pinHash: true },
    });
    const exists = !!user && user.active && !!user.pinHash;
    return { exists, fullName: exists ? user!.fullName : null };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.appUser.findUnique({
      where: { documentId: dto.documentId },
      include: {
        plant: { select: { id: true, code: true, legalName: true } },
      },
    });

    // Mensaje genérico para no revelar si la cédula existe.
    if (!user || !user.active || !user.pinHash) {
      throw new UnauthorizedException('Cédula o PIN incorrectos.');
    }

    const ok = await bcrypt.compare(dto.pin, user.pinHash);
    if (!ok) {
      throw new UnauthorizedException('Cédula o PIN incorrectos.');
    }

    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      plantId: user.plantId,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        documentId: user.documentId,
        role: user.role,
        plant: user.plant,
      },
    };
  }

  async me(ctx: AuthContext) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        fullName: true,
        documentId: true,
        role: true,
        plant: { select: { id: true, code: true, legalName: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    return user;
  }

  /** Verifica credenciales de un administrador (para autorizar acciones sensibles). */
  async verifyAdmin(dto: LoginDto) {
    const user = await this.prisma.appUser.findUnique({
      where: { documentId: dto.documentId },
      select: { active: true, pinHash: true, role: true, fullName: true },
    });

    const isAdmin =
      !!user &&
      user.active &&
      !!user.pinHash &&
      (user.role === 'admin' || user.role === 'desarrollador');

    if (!isAdmin || !(await bcrypt.compare(dto.pin, user!.pinHash!))) {
      throw new UnauthorizedException('Credenciales de administrador inválidas.');
    }

    return { ok: true, fullName: user!.fullName };
  }
}

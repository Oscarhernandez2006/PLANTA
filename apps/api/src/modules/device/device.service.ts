import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { ValidateDeviceDto } from './dto/validate-device.dto';

/** Normaliza una MAC a mayúsculas con separador ':'. */
function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase().replace(/-/g, ':');
}

@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validación pública (antes del login). Si no hay ningún equipo registrado,
   * permite el paso (modo bootstrap) para poder configurar el primero.
   */
  async validate(dto: ValidateDeviceDto) {
    const macs = dto.macs.map(normalizeMac);
    const displayMac = macs[0] ?? null;

    const total = await this.prisma.device.count();
    if (total === 0) {
      return { authorized: true, bootstrap: true, mac: displayMac, reason: null };
    }

    const active = await this.prisma.device.findFirst({
      where: { mac: { in: macs }, active: true },
    });
    if (active) {
      // Mantiene el nombre del equipo sincronizado con el nombre del PC (hostname).
      const name =
        dto.hostname && dto.hostname.trim() ? dto.hostname.trim() : active.name;
      await this.prisma.device.update({
        where: { id: active.id },
        data: {
          lastSeenAt: new Date(),
          hostname: dto.hostname ?? active.hostname,
          name,
        },
      });
      return {
        authorized: true,
        bootstrap: false,
        mac: active.mac,
        deviceName: name,
        reason: null,
      };
    }

    const inactive = await this.prisma.device.findFirst({
      where: { mac: { in: macs } },
    });
    return {
      authorized: false,
      bootstrap: false,
      mac: displayMac,
      reason: inactive ? 'inactive' : 'unregistered',
    };
  }

  findAll(ctx: AuthContext) {
    return this.prisma.device.findMany({
      where: { plantId: ctx.plantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(ctx: AuthContext, dto: CreateDeviceDto) {
    try {
      return await this.prisma.device.create({
        data: {
          plantId: ctx.plantId,
          mac: normalizeMac(dto.mac),
          name: dto.name,
          description: dto.description ?? null,
          active: dto.active ?? true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('Esa MAC ya está registrada.');
      }
      throw e;
    }
  }

  async update(ctx: AuthContext, id: string, dto: UpdateDeviceDto) {
    const device = await this.prisma.device.findFirst({
      where: { id, plantId: ctx.plantId },
    });
    if (!device) throw new NotFoundException('Equipo no encontrado.');

    return this.prisma.device.update({
      where: { id },
      data: {
        name: dto.name ?? device.name,
        description: dto.description ?? device.description,
        active: dto.active ?? device.active,
      },
    });
  }

  async remove(ctx: AuthContext, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, plantId: ctx.plantId },
    });
    if (!device) throw new NotFoundException('Equipo no encontrado.');
    await this.prisma.device.delete({ where: { id } });
    return { deleted: true };
  }
}

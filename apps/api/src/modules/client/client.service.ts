import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.findMany({
      where: { active: true },
      select: { id: true, nit: true, name: true, sede: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Alta de cliente + sede (un cliente puede tener varias sedes = varias filas con el mismo NIT). */
  create(dto: CreateClientDto) {
    return this.prisma.client.create({
      data: { nit: dto.nit.trim(), name: dto.name.trim(), sede: dto.sede.trim() },
      select: { id: true, nit: true, name: true, sede: true },
    });
  }
}

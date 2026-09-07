import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}

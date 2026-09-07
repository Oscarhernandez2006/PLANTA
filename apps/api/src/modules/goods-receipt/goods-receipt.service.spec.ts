import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { GoodsReceiptService } from './goods-receipt.service';
import type { AuthContext } from '../../common/auth/auth-context';

const ctx: AuthContext = {
  userId: '00000000-0000-0000-0000-000000000001',
  plantId: '00000000-0000-0000-0000-000000000002',
  role: UserRole.admin,
};

describe('GoodsReceiptService', () => {
  let service: GoodsReceiptService;
  let prisma: {
    goodsReceipt: { findFirst: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      goodsReceipt: {
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoodsReceiptService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(GoodsReceiptService);
  });

  it('findOne lanza NotFound cuando el ingreso no existe', async () => {
    prisma.goodsReceipt.findFirst.mockResolvedValue(null);
    await expect(service.findOne(ctx, 'missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findAll devuelve datos + metadatos de paginación', async () => {
    prisma.$transaction.mockResolvedValue([1, [{ id: 'r1' }]]);
    const result = await service.findAll(ctx, { page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });
});

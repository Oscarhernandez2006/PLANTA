import { UserRole } from '@prisma/client';
import { plantDateOnly } from '../../common/plant-date';
import { PrismaService } from '../../prisma/prisma.service';
import { InventariosService } from './inventarios.service';

describe('alertas de vencimiento del inventario', () => {
  const db = new PrismaService();
  const service = new InventariosService(db);
  const rotulado = jest.spyOn(db.rotuladoEtiqueta, 'findMany');
  const acondicionamiento = jest.spyOn(db.acondicionamientoEtiqueta, 'findMany');
  const posta = jest.spyOn(db.postaReceiptItem, 'findMany');

  beforeEach(() => {
    jest.spyOn(db.canalPieza, 'findMany').mockImplementation(jest.fn().mockResolvedValue([]));
    jest.spyOn(db.subproductoItem, 'findMany').mockImplementation(jest.fn().mockResolvedValue([]));
    jest.spyOn(db.canalReceiptItem, 'findMany').mockImplementation(jest.fn().mockResolvedValue([]));
    jest.spyOn(db.dispatchOrder, 'count').mockImplementation(jest.fn().mockResolvedValue(0));
    jest.spyOn(db.canalDispatchOrder, 'count').mockImplementation(jest.fn().mockResolvedValue(0));
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db.$disconnect();
  });

  it('identifica la bodega para cada origen y excluye las piezas transformadas', async () => {
    const producto = { codigo: '13119', nombre: 'Producto' };
    const fechaVencimiento = plantDateOnly();
    const base = { netoKg: 1, conservacion: 'refrigerado', fechaVencimiento, product: producto };
    const bodega = (id: string, cliente: string) => ({ id, nombre: 'PRINCIPAL', cliente: { concepto: cliente } });
    rotulado.mockImplementation(jest.fn().mockResolvedValue([
      { ...base, bodega: bodega('b1', 'CLIENTE A'), traslado: null, canastilla: null },
      { ...base, bodega: bodega('b1', 'CLIENTE A'), traslado: { transferOrder: { conditioningOrders: [{ id: 'oc' }] } }, canastilla: null },
    ]));
    acondicionamiento.mockImplementation(jest.fn().mockResolvedValue([
      { ...base, bodega: bodega('b2', 'CLIENTE B') },
    ]));
    posta.mockImplementation(jest.fn().mockResolvedValue([
      { ...base, receiptOrder: { bodega: { id: 'b3', nombre: 'PRINCIPAL' }, cliente: { concepto: 'CLIENTE C' } } },
    ]));

    const resumen = await service.resumen({ plantId: 'planta', userId: 'usuario', role: UserRole.admin });
    expect(resumen.alertas.productosPorVencer).toEqual(expect.arrayContaining([
      expect.objectContaining({ bodegaId: 'b1', cliente: 'CLIENTE A', codigo: '13119', unds: 1 }),
      expect.objectContaining({ bodegaId: 'b2', cliente: 'CLIENTE B', codigo: '13119', unds: 1 }),
      expect.objectContaining({ bodegaId: 'b3', cliente: 'CLIENTE C', codigo: '13119', unds: 1 }),
    ]));
    expect(resumen.alertas.productosPorVencer).toHaveLength(3);
  });
});

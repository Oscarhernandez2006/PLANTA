import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { advertenciaAntiguedad } from './advertencia-antiguedad';

describe('aviso de inventario más antiguo', () => {
  const db = new PrismaService();
  const seleccion = { etiquetaId: 'etiqueta', canastillaId: null, productId: 'producto' };
  const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
  const seleccionadas = jest.spyOn(db.rotuladoEtiqueta, 'findMany');
  const rotulado = jest.spyOn(db.rotuladoEtiqueta, 'findFirst');
  const acond = jest.spyOn(db.acondicionamientoEtiqueta, 'findFirst');
  const posta = jest.spyOn(db.postaReceiptItem, 'findFirst');

  beforeEach(() => {
    seleccionadas.mockImplementation(jest.fn().mockResolvedValue([{ fechaVencimiento: fecha('2026-12-10') }]));
    rotulado.mockImplementation(jest.fn().mockResolvedValue(null));
    acond.mockImplementation(jest.fn().mockResolvedValue(null));
    posta.mockImplementation(jest.fn().mockResolvedValue(null));
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db.$disconnect();
  });

  it('avisa sin bloquear si hay una pieza disponible de la misma referencia y cliente', async () => {
    rotulado.mockImplementation(jest.fn().mockResolvedValue({ fechaVencimiento: fecha('2026-12-03') }));
    await expect(advertenciaAntiguedad(db, 'planta', 'cliente', seleccion)).resolves.toContain('2026-12-03');
    expect(rotulado).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'planta', productId: 'producto', bodega: { clienteId: 'cliente' },
        id: { not: 'etiqueta' }, traslado: { is: null }, despacho: { is: null },
      }),
    }));
  });

  it('no advierte cuando no hay existencias con una fecha anterior', async () => {
    await expect(advertenciaAntiguedad(db, 'planta', 'cliente', seleccion)).resolves.toBeNull();
  });

  it('compara la fecha más reciente de una canastilla sin compararla consigo misma', async () => {
    seleccionadas.mockImplementation(jest.fn().mockResolvedValue([
      { fechaVencimiento: fecha('2026-12-05') }, { fechaVencimiento: fecha('2026-12-10') },
    ]));
    acond.mockImplementation(jest.fn().mockResolvedValue({ fechaVencimiento: fecha('2026-12-08') }));
    await expect(advertenciaAntiguedad(db, 'planta', 'cliente', {
      etiquetaId: null, canastillaId: 'canastilla', productId: 'producto',
    })).resolves.toContain('2026-12-08');
    expect(rotulado).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        fechaVencimiento: { lt: fecha('2026-12-10') },
        AND: expect.arrayContaining([{ OR: [{ canastillaId: null }, { canastillaId: { not: 'canastilla' } }] }]),
      }),
    }));
  });

  it('informa si no hay fecha o si falla la comparación, sin impedir la operación', async () => {
    seleccionadas.mockImplementation(jest.fn().mockResolvedValue([{ fechaVencimiento: null }]));
    await expect(advertenciaAntiguedad(db, 'planta', 'cliente', seleccion)).resolves.toContain('no tiene fecha');
    seleccionadas.mockImplementation(jest.fn().mockRejectedValue(new Error('fallo de consulta')));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    await expect(advertenciaAntiguedad(db, 'planta', 'cliente', seleccion)).resolves.toContain('Puedes continuar');
    expect(log).toHaveBeenCalled();
  });
});

import { avancePreorden } from './avance-preorden';

const pedido = (productoId: string, kgPedidos: number) => ({
  productoId,
  productoCodigo: productoId,
  productoNombre: productoId,
  plu: null,
  productoCliente: null,
  kgPedidos,
});
const item = (productoId: string, netoEtiquetaKg: number, netoPesadoKg: number | null = null) => ({
  productoId,
  productoCodigo: productoId,
  productoNombre: productoId,
  netoEtiquetaKg,
  netoPesadoKg,
});

describe('avancePreorden', () => {
  it('el porcentaje cuenta cada producto solo hasta lo pedido (el exceso no compensa faltantes)', () => {
    const { totales, lineas } = avancePreorden([pedido('A', 100), pedido('B', 100)], [item('A', 150), item('B', 10)]);
    expect(totales.kgCumplidos).toBe(110);
    expect(totales.porcentaje).toBe(55);
    expect(totales.lineasCompletas).toBe(1);
    expect(lineas.find((l) => l.productoId === 'A')?.completo).toBe(true);
  });

  it('lo alistado fuera de la orden de compra no suma al porcentaje y va al final', () => {
    const { totales, lineas } = avancePreorden([pedido('A', 50)], [item('X', 20, 19.5), item('A', 5)]);
    expect(totales.porcentaje).toBe(10);
    expect(totales.kgAlistados).toBe(25);
    expect(lineas.map((l) => l.productoId)).toEqual(['A', 'X']);
    expect(lineas[1]).toMatchObject({ kgPedidos: null, empaques: 1, kgPesados: 19.5, completo: false });
  });

  it('sin orden de compra no hay porcentaje', () => {
    expect(avancePreorden([], [item('A', 10)]).totales.porcentaje).toBeNull();
  });
});

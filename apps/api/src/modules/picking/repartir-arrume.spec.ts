import { repartirArrume } from './repartir-arrume';

const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe('repartirArrume', () => {
  it('reparte neto y tara en proporción al neto de cada etiqueta, cuadrando exacto', () => {
    const r = repartirArrume([10, 20, 30], 57, 6);
    expect(r.map((l) => l.netoKg)).toEqual([9.5, 19, 28.5]);
    expect(r.map((l) => l.taraKg)).toEqual([1, 2, 3]);
    expect(r.map((l) => l.pesoKg)).toEqual([10.5, 21, 31.5]);
  });

  it('asigna los centavos sobrantes por mayor residuo sin descuadrar el total', () => {
    const r = repartirArrume([1, 1, 1], 10, 1);
    expect(suma(r.map((l) => l.netoKg))).toBe(10);
    expect(suma(r.map((l) => l.taraKg))).toBe(1);
    expect(r.map((l) => l.netoKg).sort()).toEqual([3.33, 3.33, 3.34]);
  });

  it('reparte por igual cuando las etiquetas no traen peso', () => {
    const r = repartirArrume([0, 0], 5, 0);
    expect(r.map((l) => l.netoKg)).toEqual([2.5, 2.5]);
    expect(r.map((l) => l.taraKg)).toEqual([0, 0]);
  });

  it('ninguna línea queda con neto en cero', () => {
    const r = repartirArrume([0, 100], 0.5, 0);
    expect(r.every((l) => l.netoKg >= 0.01)).toBe(true);
    expect(suma(r.map((l) => l.netoKg))).toBe(0.5);
  });

  it('rechaza un neto menor a un centavo por etiqueta', () => {
    expect(() => repartirArrume([1, 1, 1], 0.02, 0)).toThrow();
  });
});

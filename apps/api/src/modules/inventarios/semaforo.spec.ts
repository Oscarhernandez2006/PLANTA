import { peorSemaforo, semaforoCanal, semaforoVencimiento } from './semaforo';

describe('semáforo de inventario', () => {
  const hoy = new Date('2026-11-20T00:00:00Z');

  it('clasifica las fechas de vencimiento y no inventa fechas ausentes', () => {
    expect(semaforoVencimiento(new Date('2026-11-26T00:00:00Z'), hoy)).toBe('verde');
    expect(semaforoVencimiento(new Date('2026-11-25T00:00:00Z'), hoy)).toBe('amarillo');
    expect(semaforoVencimiento(new Date('2026-11-24T00:00:00Z'), hoy)).toBe('rojo');
    expect(semaforoVencimiento(new Date('2026-11-19T00:00:00Z'), hoy)).toBe('rojo');
    expect(semaforoVencimiento(null, hoy)).toBe('desconocido');
  });

  it('marca el quinto día de las canales y los siguientes', () => {
    const ingreso = new Date('2026-11-20T00:00:00Z');
    const dia = 86_400_000;
    expect(semaforoCanal(ingreso, ingreso.getTime() + 4 * dia - 1)).toBe('verde');
    expect(semaforoCanal(ingreso, ingreso.getTime() + 4 * dia)).toBe('amarillo');
    expect(semaforoCanal(ingreso, ingreso.getTime() + 5 * dia)).toBe('rojo');
  });

  it('propaga el estado más grave sin ocultar fechas desconocidas', () => {
    expect(peorSemaforo('verde', 'desconocido')).toBe('desconocido');
    expect(peorSemaforo('desconocido', 'amarillo')).toBe('amarillo');
    expect(peorSemaforo('amarillo', 'rojo')).toBe('rojo');
    expect(peorSemaforo('rojo', 'verde')).toBe('rojo');
  });
});

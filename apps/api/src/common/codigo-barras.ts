import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Código de barras de etiquetas de Rotulado (piezas y canastillas) y de
 * Acondicionamiento: 8 dígitos, sin ceros a la izquierda, único por planta.
 *
 * La BD entrega un consecutivo n (1, 2, 3…) y el código es
 *   10 000 000 + (n × MULT) mod 90 000 000
 * MULT es coprimo con 90 000 000, así la función es biyectiva: cada n da un
 * código distinto y de un código se recupera n. Se ven "mezclados"
 * (71803401, 43606802, 15410203…) y caben 90 millones. El código no codifica
 * OP/producto/pieza: esa información se busca en la BD a partir del código.
 */
export const CODIGO_BARRAS_LARGO = 8;
export const CODIGO_BARRAS_RE = /^[1-9]\d{7}$/;
const BASE = 10_000_000n;
const RANGO = 90_000_000n;
const MULT = 61_803_401n;
const MULT_INV = inversoModular(MULT, RANGO);
const MAX_SECUENCIA = Number(RANGO) - 1;

export type TipoCodigoBarras = 'pieza' | 'canastilla' | 'acondicionamiento';

function inversoModular(a: bigint, m: bigint): bigint {
  let [g, r] = [m, a % m];
  let [x, s] = [0n, 1n];
  while (r !== 0n) {
    const q = g / r;
    [g, r] = [r, g - q * r];
    [x, s] = [s, x - q * s];
  }
  if (g !== 1n) throw new Error('MULT no es coprimo con el rango de códigos.');
  return ((x % m) + m) % m;
}

export function codigoDesdeSecuencia(n: number): string {
  return String(BASE + (BigInt(n) * MULT) % RANGO);
}

export function secuenciaDesdeCodigo(codigo: string): number {
  return Number(((BigInt(codigo) - BASE) * MULT_INV) % RANGO);
}

/** Reserva y devuelve el siguiente código disponible de la planta. */
export async function siguienteCodigoBarras(db: Db, plantId: string): Promise<string> {
  const { ultimo } = await db.codigoBarrasSecuencia.upsert({
    where: { plantId },
    create: { plantId, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
    select: { ultimo: true },
  });
  if (ultimo > MAX_SECUENCIA) {
    throw new BadRequestException('Se agotaron los códigos de barras de la planta.');
  }
  return codigoDesdeSecuencia(ultimo);
}

/** Último código entregado (para validar que un código enviado por el cliente fue reservado). */
export async function ultimoCodigoBarras(db: Db, plantId: string): Promise<number> {
  const s = await db.codigoBarrasSecuencia.findUnique({ where: { plantId }, select: { ultimo: true } });
  return s?.ultimo ?? 0;
}

export function normalizarCodigoBarras(codigo: string): string {
  const valor = codigo.trim();
  if (!CODIGO_BARRAS_RE.test(valor)) throw new BadRequestException('Código de barras no válido.');
  return valor;
}

/**
 * Dice a qué tabla pertenece un código. Como todos salen del mismo contador,
 * a lo sumo una de las tres lo tiene. Las piezas borradas (soft-delete) se
 * siguen reconociendo como tales para dar el mensaje correcto.
 */
export async function tipoCodigoBarras(
  db: Db,
  plantId: string,
  codigo: string,
): Promise<TipoCodigoBarras | null> {
  const [pieza, canastilla, acond] = await Promise.all([
    db.rotuladoEtiqueta.findFirst({ where: { codigo, plantId }, select: { id: true } }),
    db.rotuladoCanastilla.findFirst({ where: { codigo, plantId }, select: { id: true } }),
    db.acondicionamientoEtiqueta.findFirst({ where: { codigo, plantId }, select: { id: true } }),
  ]);
  if (pieza) return 'pieza';
  if (canastilla) return 'canastilla';
  if (acond) return 'acondicionamiento';
  return null;
}

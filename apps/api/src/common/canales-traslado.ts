import type { CanalPiezaTipo } from '@prisma/client';

export interface PiezaTraslado {
  pieza: CanalPiezaTipo;
  eventoId: string;
  kg: number;
}

interface Grupo {
  canales: number;
  kg: number;
}

/**
 * Agrupa las piezas trasladadas en canales: la media izquierda y la derecha del
 * mismo animal cuentan juntas como una canal (izq + der); las mitades sin su
 * pareja quedan aparte.
 */
export function agruparCanales(piezas: PiezaTraslado[]) {
  const completas: Grupo = { canales: 0, kg: 0 };
  const pares: Grupo = { canales: 0, kg: 0 };
  const sueltasIzq: Grupo = { canales: 0, kg: 0 };
  const sueltasDer: Grupo = { canales: 0, kg: 0 };

  const mitades = new Map<string, { izq: number[]; der: number[] }>();
  for (const p of piezas) {
    if (p.pieza === 'canal') {
      completas.canales += 1;
      completas.kg += p.kg;
      continue;
    }
    const m = mitades.get(p.eventoId) ?? { izq: [], der: [] };
    (p.pieza === 'cizq' ? m.izq : m.der).push(p.kg);
    mitades.set(p.eventoId, m);
  }
  for (const { izq, der } of mitades.values()) {
    const n = Math.min(izq.length, der.length);
    for (let i = 0; i < n; i++) {
      pares.canales += 1;
      pares.kg += izq[i] + der[i];
    }
    for (const kg of izq.slice(n)) {
      sueltasIzq.canales += 1;
      sueltasIzq.kg += kg;
    }
    for (const kg of der.slice(n)) {
      sueltasDer.canales += 1;
      sueltasDer.kg += kg;
    }
  }

  return {
    completas,
    pares,
    sueltasIzq,
    sueltasDer,
    total: completas.canales + pares.canales + sueltasIzq.canales + sueltasDer.canales,
  };
}

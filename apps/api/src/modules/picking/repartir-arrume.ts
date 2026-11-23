export interface LineaArrume {
  netoKg: number;
  taraKg: number;
  /** Peso bruto asignado a la línea (neto + tara). */
  pesoKg: number;
}

const aCentavos = (kg: number) => BigInt(Math.round(kg * 100));

/**
 * Reparte `total` centavos en proporción a `pesos` por el método del mayor residuo
 * (la suma siempre cuadra exacto). Si todos los pesos son 0, reparte por igual.
 */
function repartir(total: bigint, pesos: bigint[]): bigint[] {
  const suma = pesos.reduce((a, b) => a + b, 0n);
  const base = suma > 0n ? pesos : pesos.map(() => 1n);
  const divisor = suma > 0n ? suma : BigInt(pesos.length);
  const partes = base.map((p) => (total * p) / divisor);
  let resto = total - partes.reduce((a, b) => a + b, 0n);
  const orden = base
    .map((p, i) => ({ i, residuo: (total * p) % divisor }))
    .sort((a, b) => (b.residuo > a.residuo ? 1 : b.residuo < a.residuo ? -1 : a.i - b.i));
  for (let k = 0; resto > 0n; k = (k + 1) % orden.length, resto--) partes[orden[k].i]++;
  return partes;
}

/**
 * Reparte el neto y la tara de un arrume (varias canastillas pesadas juntas) entre sus
 * etiquetas, en proporción al neto de cada etiqueta. Cada línea queda con neto >= 0,01 kg.
 */
export function repartirArrume(netosEtiquetaKg: number[], netoTotalKg: number, taraTotalKg: number): LineaArrume[] {
  const n = netosEtiquetaKg.length;
  if (n === 0) throw new Error('El arrume no tiene etiquetas.');
  const neto = aCentavos(netoTotalKg);
  if (neto < BigInt(n)) throw new Error('El peso neto del arrume es muy bajo para repartirlo entre sus etiquetas.');
  const pesos = netosEtiquetaKg.map((kg) => {
    const c = aCentavos(kg);
    return c > 0n ? c : 0n;
  });

  const netos = repartir(neto, pesos);
  // Ninguna línea puede quedar en 0: se le pasa un centavo de la mayor.
  for (let i = 0; i < n; i++) {
    if (netos[i] > 0n) continue;
    let mayor = 0;
    for (let j = 1; j < n; j++) if (netos[j] > netos[mayor]) mayor = j;
    netos[mayor]--;
    netos[i]++;
  }
  const taras = repartir(aCentavos(taraTotalKg), pesos);

  return netos.map((c, i) => ({
    netoKg: Number(c) / 100,
    taraKg: Number(taras[i]) / 100,
    pesoKg: Number(c + taras[i]) / 100,
  }));
}

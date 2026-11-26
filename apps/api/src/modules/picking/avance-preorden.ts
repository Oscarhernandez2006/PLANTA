/** Avance de un producto de la pre-orden: pedido (orden de compra) vs. alistado y pesado. */
export interface LineaAvance {
  productoId: string;
  productoCodigo: string;
  productoNombre: string;
  plu: string | null;
  productoCliente: string | null;
  /** null: el producto no está en la orden de compra. */
  kgPedidos: number | null;
  empaques: number;
  /** Neto de etiqueta de lo pistoleado. */
  kgAlistados: number;
  /** Neto real de lo ya pesado en arrume. */
  kgPesados: number;
  completo: boolean;
}

export interface TotalesAvance {
  kgPedidos: number;
  kgAlistados: number;
  /** Kilos alistados que cuentan para el pedido: cada producto aporta hasta lo pedido. */
  kgCumplidos: number;
  /** % de la orden de compra alistado (por kilos); null si la pre-orden no tiene OC. */
  porcentaje: number | null;
  lineasCompletas: number;
  lineasTotal: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const nombrePreorden = (p: { ocNumero: string | null; tiendaNombre: string | null }) =>
  [p.tiendaNombre, p.ocNumero ? `OC ${p.ocNumero}` : null].filter(Boolean).join(' · ') || 'Sin orden de compra';

export function avancePreorden(
  pedidos: { productoId: string; productoCodigo: string; productoNombre: string; plu: string | null; productoCliente: string | null; kgPedidos: number }[],
  items: { productoId: string; productoCodigo: string; productoNombre: string; netoEtiquetaKg: number; netoPesadoKg: number | null }[],
): { lineas: LineaAvance[]; totales: TotalesAvance } {
  const lineas = new Map<string, LineaAvance>();
  for (const p of pedidos) {
    lineas.set(p.productoId, { ...p, empaques: 0, kgAlistados: 0, kgPesados: 0, completo: false });
  }
  for (const i of items) {
    let l = lineas.get(i.productoId);
    if (!l) {
      l = {
        productoId: i.productoId,
        productoCodigo: i.productoCodigo,
        productoNombre: i.productoNombre,
        plu: null,
        productoCliente: null,
        kgPedidos: null,
        empaques: 0,
        kgAlistados: 0,
        kgPesados: 0,
        completo: false,
      };
      lineas.set(i.productoId, l);
    }
    l.empaques += 1;
    l.kgAlistados += i.netoEtiquetaKg;
    l.kgPesados += i.netoPesadoKg ?? 0;
  }

  let kgPedidos = 0;
  let kgAlistados = 0;
  let kgCumplidos = 0;
  let lineasCompletas = 0;
  const lista = [...lineas.values()].map((l) => {
    const kgA = r2(l.kgAlistados);
    const completo = l.kgPedidos !== null && kgA >= l.kgPedidos;
    kgAlistados += kgA;
    if (l.kgPedidos !== null) {
      kgPedidos += l.kgPedidos;
      kgCumplidos += Math.min(kgA, l.kgPedidos);
      if (completo) lineasCompletas += 1;
    }
    return { ...l, kgAlistados: kgA, kgPesados: r2(l.kgPesados), completo };
  });
  // Primero lo pendiente de la OC, luego lo completo y al final lo que no está en la OC.
  const orden = (l: LineaAvance) => (l.kgPedidos === null ? 2 : l.completo ? 1 : 0);
  lista.sort((a, b) => orden(a) - orden(b) || a.productoNombre.localeCompare(b.productoNombre, 'es'));

  return {
    lineas: lista,
    totales: {
      kgPedidos: r2(kgPedidos),
      kgAlistados: r2(kgAlistados),
      kgCumplidos: r2(kgCumplidos),
      porcentaje: kgPedidos > 0 ? Math.round((kgCumplidos / kgPedidos) * 1000) / 10 : null,
      lineasCompletas,
      lineasTotal: pedidos.length,
    },
  };
}

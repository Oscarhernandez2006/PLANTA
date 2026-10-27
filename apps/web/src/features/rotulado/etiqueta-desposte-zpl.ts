import logoUrl from '@/assets/logo-santacruz.png';

export interface EtiquetaDesposteDatos {
  tienda: string;
  lote: string;
  productoCodigo: string;
  productoNombre: string;
  empaque: string;
  pieza: number;
  netoKg: number;
  sacrificio: string;
  produccion: string;
  vencimiento: string;
  conservacion: string;
  temperatura: string;
  ref: string;
  /** Código de barras guardado; si falta se arma igual: lote + producto + pieza. */
  codigo?: string;
  /** Solo en la etiqueta de canastilla: `pieza` son las unidades que lleva. */
  canastilla?: { numero: number; taraKg: number; brutoKg: number };
  /** Pieza al vacío: el neto es el bruto completo y la tara del empaque se imprime aparte. */
  taraKg?: number;
}

const dots = (mm: number) => Math.round((mm * 203) / 25.4);

/**
 * La pieza se guarda como estación × 10000 + consecutivo de la estación: 30007 se muestra
 * "3-7" (estación 3, pieza 7). Sin estación (0) se muestra solo el consecutivo.
 */
export function formatPieza(pieza: number) {
  const estacion = Math.floor(pieza / 10000);
  const n = pieza % 10000;
  return estacion ? `${estacion}-${n}` : String(n);
}

const limpiar = (value: string) => value.replace(/[\^~\r\n]/g, ' ').trim();

let logoZpl: Promise<string> | null = null;

export function obtenerLogoEtiquetaZpl(): Promise<string> {
  logoZpl ??= (async () => {
    const image = new Image();
    image.src = logoUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 44;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar el logo de la etiqueta.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const escala = Math.min(canvas.width / image.width, canvas.height / image.height);
    context.drawImage(image, 0, 0, image.width * escala, image.height * escala);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const bytesPerRow = canvas.width / 8;
    let hex = '';
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixel = (y * canvas.width + x + bit) * 4;
          const luminancia = 0.299 * pixels[pixel] + 0.587 * pixels[pixel + 1] + 0.114 * pixels[pixel + 2];
          if (pixels[pixel + 3] > 127 && luminancia < 190) byte |= 128 >> bit;
        }
        hex += byte.toString(16).padStart(2, '0');
      }
    }
    const total = bytesPerRow * canvas.height;
    return `^FO12,5^GFA,${total},${total},${bytesPerRow},${hex.toUpperCase()}^FS`;
  })().catch((error: unknown) => {
    logoZpl = null;
    throw error;
  });
  return logoZpl;
}

function fecha(value: string) {
  return value ? value.slice(0, 10).split('-').reverse().join('/') : '---';
}

/** Piezas de la etiqueta en puntos de impresora (203 dpi); de aquí salen el ZPL y la vista en pantalla. */
export type ElementoEtiqueta =
  | { t: 'logo' }
  | { t: 'texto'; x: number; y: number; alto: number; ancho: number; valor: string; centradoEn?: number }
  | { t: 'caja'; x: number; y: number; ancho: number; alto: number; grosor: number }
  | { t: 'qr'; x: number; y: number; aumento: number; valor: string }
  | { t: 'barras'; x: number; y: number; alto: number; modulo: number; valor: string };

export const TAMANO_ETIQUETA = dots(60);

export function elementosEtiquetaDesposte(datos: EtiquetaDesposteDatos): ElementoEtiqueta[] {
  const loteCodigo = datos.lote.replace(/\D/g, '');
  const productoCodigo = datos.productoCodigo.replace(/\D/g, '');
  const canastilla = datos.canastilla;
  const piezaCodigo = canastilla
    ? `C${String(canastilla.numero).padStart(3, '0')}`
    : String(datos.pieza).padStart(6, '0');
  const piezaTexto = canastilla ? String(datos.pieza).padStart(2, '0') : formatPieza(datos.pieza);
  const codigo = datos.codigo || `${loteCodigo}${productoCodigo}${piezaCodigo}`;
  const nombreProducto = datos.productoNombre.trim().toUpperCase();
  const nombre = nombreProducto.endsWith(datos.empaque.toUpperCase())
    ? nombreProducto
    : `${nombreProducto} ${datos.empaque.toUpperCase()}`;
  const texto = (
    x: number,
    y: number,
    alto: number,
    ancho: number,
    valor: string,
    centradoEn?: number,
  ): ElementoEtiqueta => ({
    t: 'texto',
    x,
    y,
    alto,
    ancho,
    valor: limpiar(valor),
    centradoEn,
  });
  const caja = (x: number, y: number, ancho: number, alto: number, grosor: number): ElementoEtiqueta => ({
    t: 'caja',
    x,
    y,
    ancho,
    alto,
    grosor,
  });

  return [
    { t: 'logo' },
    texto(95, 19, 25, 25, 'AGROPECUARIA SANTACRUZ'),
    texto(100, 44, 30, 20, nombre),
    caja(15, 78, 76, 50, 3),
    texto(22, 84, 17, 10, 'No. DE TIENDA'),
    texto(47, 100, 30, 17, datos.tienda),
    texto(14, 133, 20, 18, 'LOTE'),
    texto(140, 133, 20, 18, 'REF.'),
    texto(220, 133, 20, 18, 'ORIGEN'),
    texto(310, 133, 20, 18, 'PIEZA'),
    texto(14, 151, 23, 18, datos.lote),
    texto(130, 148, 18, 18, datos.ref || '---'),
    texto(220, 151, 20, 18, 'BOVINO'),
    texto(piezaTexto.length > 3 ? 310 : 328, 151, 23, 18, piezaTexto),
    caja(360, 124, 2, 116, 2),
    caja(12, 172, 350, 2, 2),
    texto(14, 180, 19, 22, `FECHA DE SACRIFICIO:    ${fecha(datos.sacrificio)}`),
    texto(14, 200, 19, 22, `FECHA DE PRODUCCION:  ${fecha(datos.produccion)}`),
    texto(14, 220, 19, 22, `FECHA DE VENCIMIENTO: ${fecha(datos.vencimiento)}`),
    texto(388, 130, 20, 14, 'NETO (kg)'),
    ...(canastilla
      ? [
          texto(366, 148, 70, 36, datos.netoKg.toFixed(2)),
          texto(366, 200, 13, 9, 'TARA(kg)'),
          texto(418, 200, 13, 9, 'BRUTO(kg)'),
          texto(370, 215, 20, 14, canastilla.taraKg.toFixed(1)),
          texto(422, 215, 20, 14, canastilla.brutoKg.toFixed(1)),
        ]
      : datos.taraKg !== undefined
        ? [
            texto(366, 148, 70, 36, datos.netoKg.toFixed(2)),
            texto(392, 200, 13, 9, 'TARA(kg)'),
            texto(396, 215, 20, 14, datos.taraKg.toFixed(2)),
          ]
        : [texto(364, 152, 110, 55, datos.netoKg.toFixed(2))]),
    caja(12, 238, 455, 2, 2),
    texto(14, 243, 20, 20, `CONSERVACION: ${datos.conservacion.toUpperCase()} ${datos.temperatura}`),
    texto(14, 261, 20, 17, 'Instruciones de uso: Cocinar completamente antes de consumir.'),
    caja(12, 282, 455, 2, 2),
    texto(14, 287, 20, 17, 'Procesado y empacado por AGROPECUARIA SANTACRUZ LTDA.'),
    caja(15, 309, 88, 50, 3),
    caja(100, 309, 88, 50, 3),
    texto(20, 314, 14, 17, 'PLANTA DE'),
    texto(20, 329, 14, 17, 'BENEFICIO'),
    texto(20, 344, 14, 17, 'DESPOSTE'),
    texto(105, 318, 44, 30, '466BD'),
    texto(196, 318, 18, 16, 'Km 3 via Oriental, Malambo / Atlantico'),
    texto(196, 338, 18, 16, 'Tel. 3766701 - frigorificosantacruz.com'),
    caja(15, 364, 84, 84, 3),
    texto(22, 367, 24, 17, 'BARCODE'),
    texto(36, 387, 24, 17, loteCodigo),
    texto(36, 407, 24, 17, productoCodigo),
    texto(piezaCodigo.length > 4 ? 36 : 42, 427, 24, 17, piezaCodigo),
    { t: 'qr', x: 104, y: 346, aumento: 4, valor: codigo },
    texto(196, 372, 14, 18, 'Para: AGROPECUARIA SANTACRUZ'),
    texto(196, 390, 14, 18, 'KM 3 VIA ORIENTAL - MALAMBO'),
    texto(196, 408, 14, 18, 'Tel. 6053766701'),
    { t: 'barras', x: 220, y: 426, alto: 22, modulo: 1, valor: codigo },
    texto(220, 451, 13, 8, codigo, anchoCode128B(codigo)),
  ];
}

/** Ancho en puntos (módulo 1) del Code 128 subconjunto B que imprime la Zebra con ^BCN. */
function anchoCode128B(valor: string) {
  return 11 * valor.length + 35;
}

export function generarEtiquetaDesposteZpl(datos: EtiquetaDesposteDatos, logo: string, copias = 1) {
  const zpl = elementosEtiquetaDesposte(datos).map((e) => {
    switch (e.t) {
      case 'logo':
        return logo;
      case 'texto':
        return `^FO${e.x},${e.y}^A0N,${e.alto},${e.ancho}${e.centradoEn ? `^FB${e.centradoEn},1,0,C` : ''}^FD${e.valor}^FS`;
      case 'caja':
        return `^FO${e.x},${e.y}^GB${e.ancho},${e.alto},${e.grosor}^FS`;
      case 'qr':
        return `^FO${e.x},${e.y}^BQN,4,${e.aumento}^FDLA,${e.valor}^FS`;
      case 'barras':
        return `^FO${e.x},${e.y}^BY${e.modulo},2,${e.alto}^BCN,${e.alto},N,N,N^FD${e.valor}^FS`;
    }
  });
  // Solo contenido: sin comandos de configuración de la impresora (^PW, ^LL,
  // ^LH…), que se ajusta a mano en la propia impresora.
  return [
    '^XA',
    '^CI28',
    ...zpl,
    // ^PQ: la impresora repite la misma etiqueta (p. ej. canastilla: una para la bolsa y otra para la canastilla).
    ...(copias > 1 ? [`^PQ${copias},0,1,Y`] : []),
    '^XZ',
  ].join('\n');
}
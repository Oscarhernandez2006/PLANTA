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
  /** Solo en la etiqueta de canastilla: `pieza` son las unidades que lleva. */
  canastilla?: { numero: number; taraKg: number; brutoKg: number };
}

const dots = (mm: number) => Math.round((mm * 203) / 25.4);

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

export function generarEtiquetaDesposteZpl(datos: EtiquetaDesposteDatos, logo: string) {
  const loteCodigo = datos.lote.replace(/\D/g, '');
  const productoCodigo = datos.productoCodigo.replace(/\D/g, '');
  const canastilla = datos.canastilla;
  const piezaCodigo = canastilla
    ? `C${String(canastilla.numero).padStart(3, '0')}`
    : String(datos.pieza).padStart(4, '0');
  const piezaTexto = canastilla ? String(datos.pieza).padStart(2, '0') : String(datos.pieza);
  const codigo = `${loteCodigo}${productoCodigo}${piezaCodigo}`;
  const nombreProducto = datos.productoNombre.trim().toUpperCase();
  const nombre = nombreProducto.endsWith(datos.empaque.toUpperCase())
    ? nombreProducto
    : `${nombreProducto} ${datos.empaque.toUpperCase()}`;
  const texto = (x: number, y: number, height: number, width: number, value: string) =>
    `^FO${x},${y}^A0N,${height},${width}^FD${limpiar(value)}^FS`;

  return [
    '^XA',
    '^CI28',
    `^PW${dots(60)}`,
    `^LL${dots(60)}`,
    '^LH0,0',
    logo,
    texto(95, 19, 25, 25, 'AGROPECUARIA SANTACRUZ'),
    texto(100, 44, 30, 20, nombre),
    '^FO15,78^GB76,50,3^FS',
    texto(22, 84, 17, 10, 'No. DE TIENDA'),
    texto(47, 100, 30, 17, datos.tienda),
    texto(14, 133, 20, 18, 'LOTE'),
    texto(140, 133, 20, 18, 'REF.'),
    texto(220, 133, 20, 18, 'ORIGEN'),
    texto(310, 133, 20, 18, 'PIEZA'),
    texto(14, 151, 23, 18, datos.lote),
    texto(130, 148, 18, 18, datos.ref || '---'),
    texto(220, 151, 20, 18, 'BOVINO'),
    texto(328, 151, 23, 18, piezaTexto),
    '^FO360,124^GB2,116,2^FS',
    '^FO12,172^GB350,2,2^FS',
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
      : [texto(364, 152, 110, 55, datos.netoKg.toFixed(2))]),
    '^FO12,238^GB455,2,2^FS',
    texto(14, 243, 20, 20, `CONSERVACION: ${datos.conservacion.toUpperCase()} ${datos.temperatura}`),
    texto(14, 261, 20, 17, 'Instruciones de uso: Cocinar completamente antes de consumir.'),
    '^FO12,282^GB455,2,2^FS',
    texto(14, 287, 20, 17, 'Procesado y empacado por AGROPECUARIA SANTACRUZ LTDA.'),
    '^FO15,309^GB88,50,3^FS',
    '^FO100,309^GB88,50,3^FS',
    texto(20, 314, 14, 17, 'PLANTA DE'),
    texto(20, 329, 14, 17, 'BENEFICIO'),
    texto(20, 344, 14, 17, 'DESPOSTE'),
    texto(105, 318, 44, 30, '466BD'),
    texto(196, 318, 18, 16, 'Km 3 via Oriental, Malambo / Atlantico'),
    texto(196, 338, 18, 16, 'Tel. 3766701 - frigorificosantacruz.com'),
    '^FO15,364^GB84,84,3^FS',
    texto(22, 367, 24, 17, 'BARCODE'),
    texto(36, 387, 24, 17, loteCodigo),
    texto(36, 407, 24, 17, productoCodigo),
    texto(42, 427, 24, 17, piezaCodigo),
    `^FO104,346^BQN,4,4^FDLA,${codigo}^FS`,
    texto(196, 372, 14, 18, 'Para: AGROPECUARIA SANTACRUZ'),
    texto(196, 390, 14, 18, 'KM 3 VIA ORIENTAL - MALAMBO'),
    texto(196, 408, 14, 18, 'Tel. 6053766701'),
    `^FO220,426^BY1,2,22^BCN,22,N,N,N^FD${codigo}^FS`,
    texto(290, 452, 13, 8, codigo),
    '^XZ',
  ].join('\n');
}
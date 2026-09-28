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
  const codigo = `${datos.lote.replace(/\D/g, '')}${datos.productoCodigo.replace(/\D/g, '')}${String(datos.pieza).padStart(4, '0')}`;
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
    texto(160, 133, 20, 18, 'REF.'),
    texto(275, 133, 20, 18, 'ORIGEN'),
    texto(390, 133, 20, 18, 'PIEZA'),
    texto(14, 151, 23, 18, datos.lote),
    texto(152, 148, 18, 18, datos.ref || '---'),
    texto(275, 151, 20, 18, 'BOVINO'),
    texto(405, 151, 23, 18, String(datos.pieza)),
    '^FO12,172^GB455,2,2^FS',
    texto(14, 180, 19, 22, `FECHA DE SACRIFICIO:    ${fecha(datos.sacrificio)}`),
    texto(14, 200, 19, 22, `FECHA DE PRODUCCION:  ${fecha(datos.produccion)}`),
    texto(14, 220, 19, 22, `FECHA DE VENCIMIENTO: ${fecha(datos.vencimiento)}`),
    texto(400, 180, 18, 10, 'NETO (kg)'),
    texto(396, 200, 48, 28, datos.netoKg.toFixed(2)),
    '^FO12,242^GB455,2,2^FS',
    texto(14, 250, 20, 20, `CONSERVACION: ${datos.conservacion.toUpperCase()} ${datos.temperatura}`),
    texto(14, 270, 20, 17, 'Instruciones de uso: Cocinar completamente antes de consumir.'),
    '^FO12,293^GB455,2,2^FS',
    texto(14, 300, 20, 17, 'Procesado y empacado por AGROPECUARIA SANTACRUZ LTDA.'),
    '^FO15,323^GB56,50,3^FS',
    '^FO68,323^GB56,50,3^FS',
    texto(20, 330, 14, 8, 'PLANTA DE'),
    texto(20, 344, 14, 8, 'BENEFICIO'),
    texto(20, 358, 14, 8, 'DESPOSTE'),
    texto(73, 332, 44, 18, '466BD'),
    texto(130, 332, 18, 20, 'Km 3 via Oriental, Malambo / Atlantico'),
    texto(130, 353, 18, 20, 'Tel. 3766701 - frigorificosantacruz.com'),
    '^FO15,380^GB82,84,3^FS',
    `^FO104,370^BQN,4,4^FDLA,${codigo}^FS`,
    texto(196, 382, 14, 18, 'Para: AGROPECUARIA SANTACRUZ'),
    texto(196, 401, 14, 18, 'KM 3 VIA ORIENTAL - MALAMBO'),
    texto(196, 420, 14, 18, 'Tel. 6053766701'),
    `^FO220,436^BY1,2,22^BCN,22,N,N,N^FD${codigo}^FS`,
    texto(290, 462, 13, 8, codigo),
    '^XZ',
  ].join('\n');
}
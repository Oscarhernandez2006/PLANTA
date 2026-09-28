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
  const palabras = limpiar(nombre).split(/\s+/);
  const titulo: string[] = [''];
  for (const palabra of palabras) {
    const ultima = titulo.length - 1;
    if (`${titulo[ultima]} ${palabra}`.trim().length > 25 && titulo[ultima]) titulo.push('');
    titulo[titulo.length - 1] = `${titulo[titulo.length - 1]} ${palabra}`.trim();
  }
  const texto = (x: number, y: number, size: number, value: string) =>
    `^FO${x},${y}^A0N,${size},${Math.round(size * 0.58)}^FD${limpiar(value)}^FS`;

  return [
    '^XA',
    '^CI28',
    `^PW${dots(60)}`,
    `^LL${dots(60)}`,
    '^LH0,0',
    logo,
    texto(90, 8, 23, 'AGROPECUARIA SANTACRUZ'),
    texto(90, 36, 22, titulo[0] ?? ''),
    texto(12, 61, 22, titulo.slice(1).join(' ').slice(0, 35)),
    '^FO12,89^GB455,2,2^FS',
    texto(14, 96, 17, 'No. DE TIENDA'),
    texto(160, 94, 30, datos.tienda),
    texto(14, 130, 16, 'LOTE'),
    texto(160, 130, 16, 'REF.'),
    texto(275, 130, 16, 'ORIGEN'),
    texto(390, 130, 16, 'PIEZA'),
    texto(14, 151, 23, datos.lote),
    texto(160, 151, 18, datos.ref || '---'),
    texto(275, 151, 20, 'BOVINO'),
    texto(405, 151, 23, String(datos.pieza)),
    '^FO12,182^GB455,2,2^FS',
    texto(14, 191, 17, `SACRIFICIO: ${fecha(datos.sacrificio)}`),
    texto(14, 214, 17, `PRODUCCION: ${fecha(datos.produccion)}`),
    texto(14, 237, 17, `VENCIMIENTO: ${fecha(datos.vencimiento)}`),
    texto(305, 190, 18, 'NETO (kg)'),
    texto(310, 218, 47, datos.netoKg.toFixed(2)),
    '^FO12,269^GB455,2,2^FS',
    texto(14, 276, 17, `CONSERVACION: ${datos.conservacion.toUpperCase()} ${datos.temperatura}`),
    texto(14, 298, 14, 'Cocinar completamente antes de consumir.'),
    texto(14, 317, 14, 'Procesado y empacado por AGROPECUARIA SANTACRUZ LTDA.'),
    texto(14, 336, 14, 'PLANTA DE BENEFICIO 466BD - Km 3 via Oriental, Malambo'),
    texto(14, 355, 14, 'Atlantico - Tel. 3766701 - frigorificosantacruz.com'),
    '^FO14,379^BQN,2,2^FDLA,' + codigo + '^FS',
    texto(100, 382, 14, 'Para: AGROPECUARIA SANTACRUZ'),
    texto(100, 401, 14, 'KM 3 VIA ORIENTAL - MALAMBO'),
    texto(100, 420, 14, 'Tel. 6053766701'),
    `^FO14,440^BY1,2,22^BCN,22,N,N,N^FD${codigo}^FS`,
    texto(14, 464, 13, codigo),
    '^XZ',
  ].join('\n');
}
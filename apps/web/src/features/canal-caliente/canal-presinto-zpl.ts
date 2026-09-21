import {
  CANAL_TIPO_TITULO,
  TURNO_DIGITO,
  codigoBarras,
  type PresintoTicketData,
} from './canal-presinto-print';
import { getSavedPrinterName, isDesktop, printRaw } from '@/lib/device';

/**
 * Generador de ZPL para el presinto de Canal Caliente, pensado para una
 * Zebra ZD230 (u otra compatible) con rollo continuo angosto: el cabezal
 * solo puede imprimir hasta ~10cm de ancho, así que el lado FÍSICO angosto
 * del presinto (2.5cm) va a través del cabezal (eje X del ZPL / `^PW`) y el
 * lado largo (26.5cm) corre a lo largo del rollo (eje Y del ZPL / `^LL`).
 * Por eso todo el contenido se dibuja ROTADO 90° (`^A0R`/`^BCR`): lo que en
 * el diseño "de pantalla" era la posición horizontal (0-265mm) pasa a ser
 * la posición a lo largo del rollo, y lo que era la posición vertical
 * (0-25mm) pasa a ser la posición a través del cabezal.
 *
 * NOTA: esto es una primera versión sin probar en la impresora física.
 * Puede necesitar ajuste fino de posiciones/tamaños de fuente y de la
 * densidad/velocidad ya calibradas en la propia impresora.
 */

const DPI = 203; // DPI estándar de la ZD230. Si la tuya es de 300dpi, cambiar aquí.
const DPMM = DPI / 25.4;
const LARGO_MM = 265; // a lo largo del rollo (antes "ancho" en el PDF)
const ANCHO_MM = 25; // a través del cabezal (antes "alto" en el PDF)

/** Posición a través del cabezal (eje físico X, 0..ANCHO_MM). */
function px(anchoMM: number) {
  return Math.round(anchoMM * DPMM);
}

/** Posición a lo largo del rollo (eje físico Y, 0..LARGO_MM). */
function py(largoMM: number) {
  return Math.round(largoMM * DPMM);
}

/** ZPL no permite `^` ni `~` dentro de `^FD` (son prefijos de comando). */
function sanear(texto: string) {
  return texto.replace(/[\^~]/g, ' ');
}

/** Comandos ZPL de UNA copia del presinto, dentro del bloque [anchoOffsetMM, anchoOffsetMM+anchoBloqueMM]. */
function bloqueZPL(
  d: PresintoTicketData,
  anchoOffsetMM: number,
  anchoBloqueMM: number,
): string {
  const s = anchoBloqueMM / ANCHO_MM;
  const cmds: string[] = [];

  const texto = (
    largoMM: number,
    anchoMM: number,
    hDots: number,
    valor: string,
  ) => {
    cmds.push(
      `^FO${px(anchoOffsetMM + anchoMM)},${py(largoMM)}^A0R,${hDots},${hDots}^FD${sanear(valor)}^FS`,
    );
  };

  const campo = (
    largoMM: number,
    anchoLabelMM: number,
    anchoValueMM: number,
    label: string,
    valor: string,
  ) => {
    texto(largoMM, anchoLabelMM, Math.round(13 * s), `${label}:`);
    texto(largoMM, anchoValueMM, Math.round(13 * s), valor || '-');
  };

  // Código de barras (Code128), rotado, altura a lo largo del rollo.
  const codigo = codigoBarras(d);
  const barcodeH = Math.round(70 * s); // dots, a lo largo del rollo
  cmds.push(
    `^FO${px(anchoOffsetMM + 2)},${py(2)}^BY3,3,${Math.round(80 * s)}` +
      `^BCR,${barcodeH},Y,N,N^FD${codigo}^FS`,
  );

  // Datos: dos columnas de campo/valor (posiciones "largo" = a lo largo del rollo).
  const labelA1 = 4;
  const valueA1 = 10;
  const labelA2 = 15;
  const valueA2 = 21;
  let y1 = 58;
  let y2 = 58;
  const lineH = 14;

  campo(y1, labelA1, valueA1, 'Fecha Sacrificio', d.fechaSacrificio);
  y1 += lineH;
  campo(y1, labelA1, valueA1, 'Lote', String(d.lote));
  y1 += lineH;
  campo(y1, labelA1, valueA1, 'Guia', d.guia);
  y1 += lineH;
  campo(y1, labelA1, valueA1, 'Expendio', d.expendio);
  y1 += lineH;
  campo(y1, labelA1, valueA1, 'Cliente', d.cliente);

  campo(y2, labelA2, valueA2, 'Tipo', d.tipoAnimal);
  y2 += lineH;
  campo(y2, labelA2, valueA2, 'Ref', String(d.ref));
  y2 += lineH;
  campo(y2, labelA2, valueA2, 'Turno', String(TURNO_DIGITO[d.turno]));

  // Recuadro PESO (kg): ^GB no rota con ^A/^BC, así que su w/h físicos van
  // intercambiados respecto al diseño "de pantalla".
  const pesoBoxLargo = 170; // posición a lo largo del rollo
  const boxLargoAncho = 26; // "ancho" del recuadro en el diseño original (a lo largo del rollo)
  const boxAnchoMM = anchoBloqueMM - 4 * s; // "alto" original -> ancho físico real
  const boxAnchoOffset = anchoOffsetMM + 2 * s;
  cmds.push(
    `^FO${px(boxAnchoOffset)},${py(pesoBoxLargo)}^GB${px(boxAnchoMM)},${py(boxLargoAncho)},2^FS`,
  );
  texto(pesoBoxLargo + 5, 4 * s, Math.round(10 * s), 'PESO (kg)');
  texto(pesoBoxLargo + 5, anchoBloqueMM - 14 * s, Math.round(24 * s), d.pesoKg.toFixed(0));

  // Recuadro TURNO.
  const turnoBoxLargo = pesoBoxLargo + boxLargoAncho + 3;
  cmds.push(
    `^FO${px(boxAnchoOffset)},${py(turnoBoxLargo)}^GB${px(boxAnchoMM)},${py(boxLargoAncho)},2^FS`,
  );
  texto(turnoBoxLargo + 5, 4 * s, Math.round(10 * s), 'TURNO');
  texto(
    turnoBoxLargo + 5,
    anchoBloqueMM - 14 * s,
    Math.round(24 * s),
    String(TURNO_DIGITO[d.turno]),
  );

  // Título del tipo de canal.
  const tituloLargo = turnoBoxLargo + boxLargoAncho + 4;
  const titulo = CANAL_TIPO_TITULO[d.canalTipo];
  const palabras = titulo.split(' ');
  const mitad = Math.ceil(palabras.length / 2);
  const linea1 = palabras.slice(0, mitad).join(' ');
  const linea2 = palabras.slice(mitad).join(' ');
  texto(tituloLargo, 1 * s, Math.round(15 * s), linea1);
  if (linea2) texto(tituloLargo, 13 * s, Math.round(15 * s), linea2);

  return cmds.join('\n');
}

/**
 * Genera el ZPL del presinto completo: 2 copias apiladas a través del ancho
 * de la tira de 25mm (una junto a la otra), corriendo ambas a lo largo de
 * los 265mm del rollo.
 */
export function generarZPL(d: PresintoTicketData): string {
  const PW = px(ANCHO_MM);
  const LL = py(LARGO_MM);
  const mitadAncho = ANCHO_MM / 2;

  const partes = [
    '^XA',
    '^CI28', // UTF-8, para tildes/ñ.
    `^PW${PW}`,
    `^LL${LL}`,
    '^LH0,0',
    bloqueZPL(d, 0, mitadAncho),
    bloqueZPL(d, mitadAncho, mitadAncho),
    // Línea de corte entre las 2 copias (a través del cabezal, en el medio).
    `^FO${px(mitadAncho)},0^GB0,${LL},2^FS`,
    '^XZ',
  ];
  return partes.join('\n');
}

/** Descarga el .zpl para arrastrarlo sobre el ícono de la impresora Zebra (Zebra Setup Utilities / cola de Windows). */
export function descargarPresintoZPL(d: PresintoTicketData) {
  const zpl = generarZPL(d);
  const blob = new Blob([zpl], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const nombre = `presinto_${d.lote}-${TURNO_DIGITO[d.turno]}${d.ref}_${Date.now()}.zpl`;
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ImprimirPresintoResultado {
  ok: boolean;
  /** true si se envió directo a la impresora (app de escritorio); false si se descargó el .zpl como respaldo. */
  directo: boolean;
  error?: string;
}

/**
 * Imprime el presinto DIRECTO en la impresora configurada (app de
 * escritorio, sin diálogos ni pasos manuales). Si no hay app de escritorio,
 * no hay impresora configurada, o falla el envío, cae de respaldo a
 * descargar el .zpl para arrastrarlo manualmente.
 */
export async function imprimirPresintoDirecto(
  d: PresintoTicketData,
): Promise<ImprimirPresintoResultado> {
  const zpl = generarZPL(d);

  if (!isDesktop()) {
    descargarPresintoZPL(d);
    return {
      ok: false,
      directo: false,
      error:
        'No se detectó la app de escritorio (esto se ve como navegador web).',
    };
  }

  const printerName = getSavedPrinterName();
  if (!printerName) {
    descargarPresintoZPL(d);
    return {
      ok: false,
      directo: false,
      error: 'No hay impresora configurada (abre "Impresora de presintos").',
    };
  }

  const resultado = await printRaw(printerName, zpl);
  if (resultado.ok) return { ok: true, directo: true };

  descargarPresintoZPL(d);
  return {
    ok: false,
    directo: false,
    error: resultado.error || 'No se pudo imprimir directo.',
  };
}

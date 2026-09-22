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
// Factor de escala aplicado a fuentes/espaciado/largo: la letra a tamaño
// "real" (265mm) salía demasiado chica para leer, se agranda todo a
// costa de una tira más larga (es rollo continuo, no hay problema en cortar
// una tira más larga).
const ESCALA = 2.2;
const LARGO_MM = Math.round(265 * ESCALA); // a lo largo del rollo (antes "ancho" en el PDF)
// A través del cabezal (antes "alto" en el PDF): 5cm TOTAL, repartidos en
// las 2 copias apiladas (2.5cm cada una, confirmado con el usuario contra
// la impresión real). El cabezal de la ZD230 imprime hasta ~10cm, así que
// entra sin problema.
const ANCHO_MM = 50;

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

/** Recorta valores muy largos (ej. nombres de cliente, guías largas) para que no se encimen con el siguiente campo. */
function truncar(texto: string, max: number) {
  return texto.length > max ? `${texto.slice(0, max - 1)}.` : texto;
}

/**
 * Comandos ZPL de UNA copia del presinto, dentro del bloque
 * [anchoOffsetMM, anchoOffsetMM+anchoBloqueMM] (anchoBloqueMM = 25mm,
 * igual que `blockH` en `canal-presinto-print.ts`).
 *
 * El layout replica el diseño "de pantalla" de `dibujarTicket` (mismo
 * orden: código de barras a la izquierda, 2 columnas de campos, recuadros
 * PESO/TURNO y título a la derecha). Mapeo de ejes (igual que el resto del
 * archivo): la posición X del diseño original (columnas/recuadros, a lo
 * largo del rollo) se multiplica por `ESCALA` para aprovechar la tira más
 * larga; la posición Y del diseño original (0-25mm, DENTRO de una fila, a
 * través del cabezal) se usa tal cual porque `anchoBloqueMM` ya es 25mm
 * real. O sea: los campos de una misma columna (Fecha/Lote/Guia/...) NO se
 * apilan a lo largo del rollo, se apilan a través del cabezal, todos en el
 * mismo punto "largo" de su columna — igual que en el PDF.
 */
function bloqueZPL(
  d: PresintoTicketData,
  anchoOffsetMM: number,
  anchoBloqueMM: number,
): string {
  const cmds: string[] = [];
  // Estira las posiciones "a lo largo del rollo" (antes x del diseño de
  // pantalla) para dar espacio a la letra más grande.
  const sx = ESCALA;
  // Convierte tamaños de fuente en pt (como en el PDF) a dots. SIN empujón
  // extra: el eje ancho está limitado a 25mm reales (igual que el PDF), así
  // que hay que respetar las mismas proporciones para que quepa igual de
  // bien; el tamaño "grande" ya lo da la tira más larga (ESCALA en el eje
  // largo), no agrandar también este eje o se desborda de los 25mm.
  const pt = (p: number) => Math.round(p * 0.3528 * DPMM);

  // ^A0R,h,w: alto (h, hacia el eje ancho/legibilidad) y ancho de letra (w,
  // hacia el eje largo/espacio que ocupa cada carácter) son INDEPENDIENTES.
  // Usar w = h haría que un texto largo se desborde fuera de su columna.
  const texto = (
    largoMM: number,
    anchoMM: number,
    hDots: number,
    valor: string,
    wDots: number = Math.round(hDots * 0.6),
  ) => {
    cmds.push(
      `^FO${px(anchoOffsetMM + anchoMM)},${py(largoMM)}^A0R,${hDots},${wDots}^FD${sanear(valor)}^FS`,
    );
  };

  const labelH = pt(10.5);
  // Una "columna" tiene una posición FIJA a lo largo del rollo (largoMM);
  // sus campos se apilan a través del cabezal (anchoMM, fila a fila).
  const campo = (
    largoLabelMM: number,
    largoValorMM: number,
    anchoMM: number,
    label: string,
    valor: string,
  ) => {
    texto(largoLabelMM, anchoMM, labelH, `${label}:`);
    texto(largoValorMM, anchoMM, labelH, truncar(valor || '-', 16));
  };

  // Código de barras (Code128), a la izquierda, altura = casi todo el
  // ancho del bloque (igual que el PDF, que lo hace de alto = blockH-4mm).
  const codigo = codigoBarras(d);
  const barcodeH = px(anchoBloqueMM - 4);
  cmds.push(
    `^FO${px(anchoOffsetMM + 2)},${py(2 * sx)}^BY3,3,${barcodeH}` +
      `^BCR,${barcodeH},Y,N,N^FD${codigo}^FS`,
  );

  // Columna 1 (Cliente / Expendio / Guia / Lote / Fecha de Sacrificio,
  // orden invertido a pedido del usuario): fija a lo largo del rollo,
  // apilada a través del cabezal (interlineado `lineH`, ajustable acá si
  // hace falta más o menos separación).
  const largoLabel1 = 58 * sx;
  const largoValor1 = 82 * sx;
  const lineH = 4.0;
  let anchoFila = 3;
  campo(largoLabel1, largoValor1, anchoFila, 'Cliente', d.cliente);
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Expendio', d.expendio);
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Guia', d.guia);
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Lote', String(d.lote));
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Fecha de Sacrificio', d.fechaSacrificio);

  // Columna 2 (Tipo / Ref / Turno), más adelante a lo largo del rollo.
  const largoLabel2 = 128 * sx;
  const largoValor2 = 146 * sx;
  let anchoFila2 = 3;
  campo(largoLabel2, largoValor2, anchoFila2, 'Tipo', d.tipoAnimal);
  anchoFila2 += lineH;
  campo(largoLabel2, largoValor2, anchoFila2, 'Ref', String(d.ref));
  anchoFila2 += lineH;
  campo(largoLabel2, largoValor2, anchoFila2, 'Turno', String(TURNO_DIGITO[d.turno]));

  // Recuadro PESO (kg): ^GB no rota con ^A/^BC, así que su w/h físicos van
  // intercambiados respecto al diseño "de pantalla" (ancho del diseño ->
  // eje ancho físico; alto del diseño -> eje largo físico).
  const boxLargo = 170 * sx; // posición a lo largo del rollo (antes "x" del PDF)
  const boxAncho = anchoBloqueMM - 4; // alto físico del recuadro (antes "h" del PDF, sin escalar)
  const boxLargoAncho = 26 * sx; // ancho físico del recuadro (antes "w" del PDF, escalado)
  const boxAnchoOffset = anchoOffsetMM + 2;
  cmds.push(
    `^FO${px(boxAnchoOffset)},${py(boxLargo)}^GB${px(boxAncho)},${py(boxLargoAncho)},2^FS`,
  );
  texto(boxLargo + 5, 1, pt(9.5), 'PESO(kg)');
  texto(boxLargo + boxLargoAncho * 0.35, boxAncho / 2 - 3, pt(21), d.pesoKg.toFixed(0));

  // Recuadro TURNO.
  const turnoBoxLargo = boxLargo + boxLargoAncho + 3 * sx;
  cmds.push(
    `^FO${px(boxAnchoOffset)},${py(turnoBoxLargo)}^GB${px(boxAncho)},${py(boxLargoAncho)},2^FS`,
  );
  texto(turnoBoxLargo + 5, 1, pt(9.5), 'TURNO');
  texto(
    turnoBoxLargo + boxLargoAncho * 0.35,
    boxAncho / 2 - 3,
    pt(21),
    String(TURNO_DIGITO[d.turno]),
  );

  // Título del tipo de canal, a la derecha de todo.
  const tituloLargo = turnoBoxLargo + boxLargoAncho + 4 * sx;
  const titulo = CANAL_TIPO_TITULO[d.canalTipo];
  const palabras = titulo.split(' ');
  const tituloH = pt(21);
  if (palabras.length > 1) {
    const mitad = Math.ceil(palabras.length / 2);
    texto(tituloLargo, 2, tituloH, palabras.slice(0, mitad).join(' '));
    texto(tituloLargo + tituloH * 0.6 * 1.6, 2, tituloH, palabras.slice(mitad).join(' '));
  } else {
    texto(tituloLargo, anchoBloqueMM / 2 - 4, tituloH, titulo);
  }

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

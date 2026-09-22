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
// `LARGO_MM` es el largo FÍSICO real que la impresora corta (no un simple
// límite de contenido) — 26cm es el requisito real del usuario. Antes se
// había subido a 420mm para que el título no se cortara, pero eso hacía
// que la impresora cortara la tira real a 42cm, mucho más de lo pedido.
// La solución correcta es comprimir los márgenes (más abajo) para que TODO
// entre dentro de estos 260mm reales, no agrandar el largo de corte.
const LARGO_MM = 260;
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
  // Columna 2 (Tipo/Ref/Gancho) con letra más grande que la columna 1.
  const labelH2 = pt(13);
  // Ancho de letra NORMAL (0.6, el mismo default de `texto`) para que la
  // etiqueta se siga leyendo bien; achicar este valor la hacía ver borrosa
  // al imprimir. El acercamiento del valor se logra solo con el margen fijo
  // (más abajo), no angostando la letra.
  const labelWDots = Math.round(labelH * 0.6);
  const labelCharMM = labelWDots / DPMM;
  const anchoEtiqueta = (label: string, hDots: number = labelH) =>
    (label.length + 1) * (Math.round(hDots * 0.6) / DPMM);
  const campo = (
    largoLabelMM: number,
    largoValorMM: number,
    anchoMM: number,
    label: string,
    valor: string,
    hDots: number = labelH,
  ) => {
    texto(largoLabelMM, anchoMM, hDots, `${label}:`);
    texto(largoValorMM, anchoMM, hDots, truncar(valor || '-', 16));
  };

  // Código de barras (Code128): posición a lo largo del rollo corrida más
  // a la derecha (antes casi pegado al borde izquierdo). Altura reducida
  // (~65% del bloque) y CENTRADO en el ancho del bloque (antes pegado
  // arriba) para que se vea más prolijo.
  const codigo = codigoBarras(d);
  const barcodeHmm = (anchoBloqueMM - 4) * 0.65;
  const barcodeH = px(barcodeHmm);
  const barcodeAnchoOffset = anchoOffsetMM + (anchoBloqueMM - barcodeHmm) / 2;
  const barcodeLargo = 23 * sx; // corrido a la derecha (antes 12) a pedido del usuario
  // Largo real del código (Code128, subset B): 11 módulos por carácter +
  // 11 (start) + 11 (checksum) + 13 (stop), a 3 dots de módulo. Se necesita
  // para saber DÓNDE termina y no tapar el texto de al lado.
  const barcodeModulos = 11 * (codigo.length + 2) + 13;
  const barcodeLargoAncho = (barcodeModulos * 3) / DPMM;
  cmds.push(
    `^FO${px(barcodeAnchoOffset)},${py(barcodeLargo)}^BY3,3,${barcodeH}` +
      `^BCR,${barcodeH},Y,N,N^FD${codigo}^FS`,
  );

  // Columna 1 (Cliente / Expendio / Guia / Lote / Fecha de Sacrificio,
  // orden ORIGINAL, pedido de vuelta por el usuario): pegada al código de
  // barras (~0.5cm de separación DESPUÉS de donde termina el código, no
  // desde donde empieza, para no montarse encima). El valor va a una
  // columna fija (basada en la etiqueta más larga, "Fecha de Sacrificio:")
  // para que las 5 filas queden alineadas parejo.
  const largoLabel1 = barcodeLargo + barcodeLargoAncho + 8;
  const largoValor1 = largoLabel1 + anchoEtiqueta('Fecha de Sacrificio') - 22;
  const lineH = 4.0;
  let anchoFila = 3;
  campo(largoLabel1, largoValor1, anchoFila, 'Fecha de Sacrificio', d.fechaSacrificio);
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Lote', String(d.lote));
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Guia', d.guia);
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Expendio', d.expendio);
  anchoFila += lineH;
  campo(largoLabel1, largoValor1, anchoFila, 'Cliente', d.cliente);

  // Columna 2 (Tipo / Ref / Gancho): pegada al lado de la columna 1 (justo
  // después de donde terminan sus valores), no a una posición fija lejana.
  const largoLabel2 = largoValor1 + 16 * labelCharMM - 12;
  // "Gancho" es una etiqueta corta: usar el mismo "-15" de la columna 1
  // (pensado para "Fecha de Sacrificio", mucho más larga) casi no dejaba
  // espacio y el valor se imprimía prácticamente encima de la etiqueta
  // (se veía borroso). Acá el valor va a un margen fijo chico en vez de
  // restarle a la etiqueta más larga de la columna.
  const largoValor2 = largoLabel2 + anchoEtiqueta('Gancho', labelH2) - 10;
  const lineH2 = lineH + 1.2;
  let anchoFila2 = 3;
  campo(largoLabel2, largoValor2, anchoFila2, 'Tipo', d.tipoAnimal, labelH2);
  anchoFila2 += lineH2;
  campo(largoLabel2, largoValor2, anchoFila2, 'Ref', String(d.ref), labelH2);
  anchoFila2 += lineH2;
  campo(largoLabel2, largoValor2, anchoFila2, 'Gancho', String(TURNO_DIGITO[d.turno]), labelH2);

  // Recuadro PESO (kg): ^GB no rota con ^A/^BC, así que su w/h físicos van
  // intercambiados respecto al diseño "de pantalla" (ancho del diseño ->
  // eje ancho físico; alto del diseño -> eje largo físico). Posiciones
  // pegadas a la columna 2 (SIN multiplicar por `sx`) para que TODO
  // (recuadros + título) quede dentro de los ~26cm reales de la tira.
  // Se reduce este margen (antes +41) para compensar que el código de
  // barras/columnas se corrieron a la derecha, y así seguir entrando
  // dentro de los 260mm reales.
  const boxLargo = largoValor2 + 23; // pegado al valor de Tipo/Ref/Gancho
  const boxAncho = 18; // alto físico del recuadro, fijo 18mm a pedido del usuario
  const boxLargoAncho = 18; // ancho físico del recuadro, fijo 18mm (cuadrado 18x18)
  const boxGrosor = px(1.1); // borde más grueso (antes 0.6mm)
  const boxAnchoOffset = anchoOffsetMM + 2;
  // Centra un texto dentro del ancho del recuadro (a lo largo del rollo),
  // según la cantidad de caracteres y el tamaño de letra usado. Factor 0.3
  // (no 0.6): el glifo real de estos números/etiquetas ocupa bastante
  // menos que el ancho nominal, confirmado contra la impresión real.
  const centrarEnBox = (inicioLargo: number, texto2: string, hDots: number) => {
    const anchoTexto = texto2.length * (Math.round(hDots * 0.3) / DPMM);
    return inicioLargo + Math.max(0, (boxLargoAncho - anchoTexto) / 2);
  };
  // Centra el BLOQUE (número + etiqueta) verticalmente dentro del alto del
  // recuadro, según la altura real de cada línea de texto. Se usa 0.75 del
  // alto nominal en el cálculo (el glifo real de la fuente ZPL ocupa menos
  // que el alto pedido), si no el bloque se calculaba "más alto" de lo que
  // en realidad se imprime y quedaba descentrado hacia arriba.
  const numeroHmm = (pt(21) / DPMM) * 0.75;
  const etiquetaHmm = (pt(8) / DPMM) * 0.75;
  const gapMM = 2.75; // más separación entre el número y la etiqueta (antes 1.5)
  const bloqueAlto = numeroHmm + gapMM + etiquetaHmm;
  const numeroAncho = (boxAncho - bloqueAlto) / 2;
  const etiquetaAncho = numeroAncho + numeroHmm + gapMM;
  cmds.push(
    `^FO${px(boxAnchoOffset)},${py(boxLargo)}^GB${px(boxAncho)},${py(boxLargoAncho)},${boxGrosor}^FS`,
  );
  // Orden invertido a pedido del usuario: número grande ARRIBA, etiqueta
  // chica ABAJO, todo centrado dentro del recuadro.
  texto(centrarEnBox(boxLargo, d.pesoKg.toFixed(0), pt(21)), numeroAncho, pt(21), d.pesoKg.toFixed(0));
  texto(centrarEnBox(boxLargo, 'PESO (kg)', pt(8)), etiquetaAncho, pt(8), 'PESO (kg)');

  // Recuadro TURNO.
  const turnoBoxLargo = boxLargo + boxLargoAncho + 3;
  cmds.push(
    `^FO${px(boxAnchoOffset)},${py(turnoBoxLargo)}^GB${px(boxAncho)},${py(boxLargoAncho)},${boxGrosor}^FS`,
  );
  texto(
    centrarEnBox(turnoBoxLargo, String(TURNO_DIGITO[d.turno]), pt(21)),
    numeroAncho,
    pt(21),
    String(TURNO_DIGITO[d.turno]),
  );
  texto(centrarEnBox(turnoBoxLargo, 'TURNO', pt(8)), etiquetaAncho, pt(8), 'TURNO');

  // Título del tipo de canal, a la derecha de todo.
  const tituloLargo = turnoBoxLargo + boxLargoAncho + 5;
  const titulo = CANAL_TIPO_TITULO[d.canalTipo];
  const palabras = titulo.split(' ');
  const tituloH = pt(21);
  if (palabras.length > 1) {
    const mitad = Math.ceil(palabras.length / 2);
    // MISMA posición a lo largo del rollo (tituloLargo) para las 2 líneas;
    // lo que cambia es la posición a través del cabezal (anchoMM), así
    // quedan apiladas una arriba de la otra. La segunda mitad de palabras
    // va ARRIBA y la primera mitad ABAJO (ej. "CANAL COMPLETA" -> COMPLETA
    // arriba, CANAL abajo; "MEDIA CANAL CON COLA" -> CON COLA arriba,
    // MEDIA CANAL abajo), a pedido del usuario.
    const arriba = palabras.slice(mitad);
    const abajo = palabras.slice(0, mitad);
    texto(tituloLargo, 2, tituloH, arriba.join(' '));
    texto(tituloLargo, anchoBloqueMM / 2 + 2, tituloH, abajo.join(' '));
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
    '^MNN', // Fuerza rollo CONTINUO (sin sensor de gap/marca negra): si la
    // impresora tenía calibrado un largo de etiqueta corto de un rollo
    // anterior, cortaba antes de imprimir todo el contenido.
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

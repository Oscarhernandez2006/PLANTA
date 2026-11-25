import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import logoUrl from '@/assets/logo-santacruz.png';

const PRIMARIO: [number, number, number] = [14, 107, 92];
const TEXTO: [number, number, number] = [30, 41, 59];
const ESCALA = 2;
const ANCHO_FOTO = 860;

function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const esperarPintado = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Copia del modal lista para fotografiar: etapas + contenido completo, sin desplazamientos
 * ni botones, al mismo ancho que se ve en pantalla.
 */
function copiaDelModal(modal: HTMLElement) {
  const cuerpo = modal.querySelector<HTMLElement>('[data-dialog-body]');
  if (!cuerpo) throw new Error('Modal sin contenido');
  const sub = modal.querySelector<HTMLElement>('[data-dialog-sub]');
  // Más angosto que el modal en pantalla: al llevarlo al ancho de la hoja A4 la letra queda más grande.
  const ancho = ANCHO_FOTO;

  // El contenedor saca la copia de la pantalla; la hoja (lo que se fotografía) queda en posición normal.
  const fuera = document.createElement('div');
  fuera.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  const hoja = document.createElement('div');
  hoja.style.cssText = `width:${ancho}px;background:#fff;`;
  hoja.className = 'bg-card text-foreground';
  fuera.appendChild(hoja);
  if (sub) hoja.appendChild(sub.cloneNode(true));
  const contenido = cuerpo.cloneNode(true) as HTMLElement;
  contenido.classList.remove('overflow-y-auto', 'min-h-0', 'flex-1');
  hoja.appendChild(contenido);

  hoja.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.maxHeight !== 'none' && el.tagName !== 'IMG' && el.tagName !== 'svg') el.style.maxHeight = 'none';
    if (/(auto|scroll|hidden)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) el.style.overflow = 'visible';
    if (cs.position === 'sticky') el.style.position = 'static';
  });
  // Los íconos del paso (+ chevrones) se quedan; el aspecto de botón deshabilitado no.
  hoja.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.disabled = false;
    b.style.cursor = 'default';
  });
  hoja.querySelectorAll<HTMLElement>('table').forEach((t) => (t.style.whiteSpace = 'normal'));
  document.body.appendChild(fuera);
  // Si alguna tabla no cabe aun partiendo el texto, se ensancha la hoja para no recortarla.
  const sobra = Math.max(0, ...[...hoja.querySelectorAll('table')].map((t) => t.scrollWidth - (t.parentElement?.clientWidth ?? 0)));
  if (sobra > 0) hoja.style.width = `${ancho + sobra}px`;
  fijarAlturasPropias(hoja);
  return hoja;
}

/** Posiciones (px de la hoja) donde conviene cortar: inicio de cada paso y de cada fila de tabla. */
function puntosDeCorte(hoja: HTMLElement) {
  const tope = hoja.getBoundingClientRect().top;
  const ys = (sel: string) =>
    [...new Set([...hoja.querySelectorAll(sel)].map((el) => Math.round(el.getBoundingClientRect().top - tope)))]
      .filter((y) => y > 0)
      .sort((a, b) => a - b);
  // Filas de datos (nunca justo después del encabezado de la tabla) y bloques dentro de cada paso.
  return {
    alto: hoja.offsetHeight,
    secciones: ys('li'),
    filas: ys('tbody tr:not(:first-child), li > *, li > div > *, li > div > * > *'),
  };
}

/**
 * La foto no copia alturas (ver estilosACopiar): a los elementos que tienen una altura propia
 * (íconos, círculos, barras) o que van posicionados se les fija con min/max-height; los demás crecen con su contenido.
 */
function fijarAlturasPropias(hoja: HTMLElement) {
  const els = [...hoja.querySelectorAll<HTMLElement | SVGElement>('*')];
  const alturas = els.map((el) => el.getBoundingClientRect().height);
  const absolutos = els.map((el) => getComputedStyle(el).position === 'absolute');
  const regla = document.createElement('style');
  regla.textContent = '[data-pdf-hoja] *:not(svg):not(svg *) { height: auto !important; block-size: auto !important; }';
  hoja.setAttribute('data-pdf-hoja', '');
  document.head.appendChild(regla);
  const naturales = els.map((el) => el.getBoundingClientRect().height);
  regla.remove();
  els.forEach((el, i) => {
    if (el instanceof SVGSVGElement && !(el.parentNode instanceof SVGElement)) {
      const r = el.getBoundingClientRect();
      el.setAttribute('width', String(r.width));
      el.setAttribute('height', String(r.height));
    } else if (
      el instanceof HTMLElement &&
      (Math.abs(alturas[i] - naturales[i]) > 0.5 || absolutos[i])
    ) {
      el.style.minHeight = el.style.maxHeight = `${alturas[i]}px`;
    }
  });
}

/**
 * Recorre la foto una vez: filas de píxeles sin texto (en blanco o solo con fondos y bordes claros), donde
 * se puede cortar la página sin partir letras, etiquetas ni filas de tabla, y el alto real del contenido.
 */
function analizar(lienzo: HTMLCanvasElement) {
  const { width, height } = lienzo;
  const px = lienzo.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  const libres = new Uint8Array(height);
  let ultima = 0;
  for (let y = 0; y < height; y++) {
    let libre = 1;
    let blanca = true;
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (blanca && (r < 250 || g < 250 || b < 250)) blanca = false;
      // Tinta = texto o fondos oscuros; las líneas y bordes grises (~180) no cuentan.
      if (r * 0.299 + g * 0.587 + b * 0.114 < 150) {
        libre = 0;
        break;
      }
    }
    libres[y] = libre;
    if (!blanca) ultima = y;
  }
  return { libres, contenido: ultima, total: Math.min(height, ultima + 12 * ESCALA) };
}

let fuentesCss: Promise<string | null> | null = null;

/** CSS de las fuentes web de la página (Inter) con los archivos incrustados, para que la foto use la misma letra. */
function fuentesIncrustadas() {
  fuentesCss ??= (async () => {
    const hojas = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis"]')];
    if (!hojas.length) return null;
    let css = (await Promise.all(hojas.map((l) => fetch(l.href).then((r) => (r.ok ? r.text() : ''))))).join('\n');
    // Solo el subconjunto latino: es el que usa el sistema y evita descargar los demás alfabetos.
    css = css.replace(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g, (_, subset: string, regla: string) =>
      subset === 'latin' ? regla : '',
    );
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    const datos = await Promise.all(
      urls.map(async (u) => {
        const blob = await (await fetch(u)).blob();
        return new Promise<string>((ok, mal) => {
          const fr = new FileReader();
          fr.onload = () => ok(fr.result as string);
          fr.onerror = mal;
          fr.readAsDataURL(blob);
        });
      }),
    );
    urls.forEach((u, i) => (css = css.split(u).join(datos[i])));
    return css;
  })().catch(() => {
    fuentesCss = null;
    return null;
  });
  return fuentesCss;
}

/**
 * Estilos que se copian a la foto: todos menos las alturas fijas, así cada caja crece con su contenido
 * (al dibujarse, el texto puede ocupar unas décimas de px más y se recortaría la última fila).
 */
let propiedades: string[] | null = null;
const SIN_ALTURA = new Set(['height', 'block-size']);
function estilosACopiar() {
  propiedades ??= [...getComputedStyle(document.documentElement)].filter((n) => !SIN_ALTURA.has(n));
  return propiedades;
}

async function fotografiar(hoja: HTMLElement) {
  // Margen extra al final: al dibujarse, el contenido puede quedar unos px más alto que en pantalla.
  const opciones = {
    pixelRatio: ESCALA,
    backgroundColor: '#ffffff',
    cacheBust: true,
    height: hoja.offsetHeight + 120,
    includeStyleProperties: estilosACopiar(),
  };
  const fontEmbedCSS = await fuentesIncrustadas();
  if (fontEmbedCSS) return toCanvas(hoja, { ...opciones, fontEmbedCSS });
  // Sin internet no se pueden incrustar las fuentes de Google: se usa la del sistema.
  return toCanvas(hoja, { ...opciones, skipFonts: true });
}

/** Abre los pasos plegados del modal para que salgan en el PDF; devuelve cómo volverlos a cerrar. */
async function desplegarPasos(modal: HTMLElement) {
  const cerrados = [...modal.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]')];
  cerrados.forEach((b) => b.click());
  if (cerrados.length) await esperarPintado();
  return () => cerrados.forEach((b) => b.click());
}

/** Informe de trazabilidad en PDF (A4 vertical): el modal tal cual se ve, con encabezado de la empresa. */
export async function descargarTrazabilidadPdf(
  modal: HTMLElement,
  p: { titulo: string; codigo: string; subtitulo: string; estado: string },
) {
  const replegar = await desplegarPasos(modal);
  let hoja: HTMLElement | null = null;
  let lienzo: HTMLCanvasElement;
  let puntos: ReturnType<typeof puntosDeCorte>;
  try {
    hoja = copiaDelModal(modal);
    await document.fonts.ready;
    await esperarPintado();
    puntos = puntosDeCorte(hoja);
    lienzo = await fotografiar(hoja);
  } finally {
    hoja?.parentElement?.remove();
    replegar();
  }
  const { total, libres, contenido } = analizar(lienzo);

  // Al dibujarse la foto queda unos px más alta que en pantalla: se ajusta la escala y se busca la fila libre más cercana.
  const factor = Math.max(1, contenido / (puntos.alto * ESCALA)) * ESCALA;
  const aLienzo = (y: number) => {
    const base = Math.round(y * factor);
    for (let d = 0; d <= 12 * ESCALA; d++) {
      if (libres[base - d]) return base - d;
      if (libres[base + d]) return base + d;
    }
    return -1;
  };
  const secciones = puntos.secciones.map(aLienzo).filter((y) => y > 0);
  const filas = puntos.filas.map(aLienzo).filter((y) => y > 0);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 10;
  const anchoMm = pageW - m * 2;
  const pxPorMm = lienzo.width / anchoMm;

  const logo = await cargarImagen(logoUrl);
  const encabezado = () => {
    if (logo) doc.addImage(logo, 'PNG', m, m, 26, 15, undefined, 'FAST');
    doc.setTextColor(...TEXTO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('AGROPECUARIA SANTA CRUZ LTDA', pageW - m, m + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('NIT. 830.505.537-2 · MALAMBO - ATLÁNTICO', pageW - m, m + 8.5, { align: 'right' });
    doc.text(`Generado ${new Date().toLocaleString('es-CO')}`, pageW - m, m + 12.5, { align: 'right' });
    const y = m + 19;
    doc.setFillColor(...PRIMARIO);
    doc.roundedRect(m, y, anchoMm, 12, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(p.titulo.toUpperCase(), m + 3, y + 5);
    doc.setFontSize(9);
    doc.text(`${p.codigo} · ${p.subtitulo}`.toUpperCase(), m + 3, y + 9.5, { maxWidth: anchoMm - 50 });
    doc.text(p.estado.toUpperCase(), pageW - m - 3, y + 7.5, { align: 'right' });
    return y + 15;
  };

  const pie = 12;
  const altoPagina = Math.floor((pageH - pie - m) * pxPorMm);
  const ultimoEn = (lista: number[], desde: number, hasta: number) => {
    let r = -1;
    for (const y of lista) if (y > desde && y <= hasta) r = y;
    return r;
  };
  let inicio = 0;
  let primera = true;
  while (inicio < total - 2) {
    if (!primera) doc.addPage();
    const y0 = primera ? encabezado() : m;
    const altoDisponible = Math.floor((pageH - pie - y0) * pxPorMm);
    let fin = Math.min(inicio + altoDisponible, total);
    if (fin < total) {
      // 1) Antes de un paso completo, si ese paso cabe entero en la página siguiente.
      const s = ultimoEn(secciones, inicio + altoDisponible * 0.3, fin);
      const finSeccion = secciones.find((y) => y > s) ?? total;
      // 2) Entre filas o bloques. 3) Cualquier franja sin texto.
      const f = ultimoEn(filas, inicio + altoDisponible * 0.4, fin);
      if (s > 0 && finSeccion - s <= altoPagina) fin = s;
      else if (f > 0) fin = f;
      else
        for (let y = fin; y > inicio + altoDisponible * 0.4; y--)
          if (libres[y]) {
            fin = y;
            break;
          }
    }
    const trozo = document.createElement('canvas');
    trozo.width = lienzo.width;
    trozo.height = fin - inicio;
    const ctx = trozo.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, trozo.width, trozo.height);
    ctx.drawImage(lienzo, 0, inicio, lienzo.width, trozo.height, 0, 0, lienzo.width, trozo.height);
    doc.addImage(trozo.toDataURL('image/jpeg', 0.92), 'JPEG', m, y0, anchoMm, trozo.height / pxPorMm, undefined, 'FAST');
    inicio = fin;
    primera = false;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Trazabilidad ${p.codigo} · página ${i} de ${paginas}`, pageW / 2, pageH - 6, { align: 'center' });
  }
  doc.save(`trazabilidad-${p.codigo.replace(/[^\w-]+/g, '_')}.pdf`);
}

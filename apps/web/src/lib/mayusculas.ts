// Todo texto que se escribe en el software queda en MAYÚSCULA (teclado físico,
// teclado en pantalla o pegado). Aplica a <input> de texto y <textarea>;
// para excluir un campo (p. ej. correo) se marca con `data-keep-case`.

const TIPOS_TEXTO = new Set(['text', 'search']);

type CampoTexto = HTMLInputElement | HTMLTextAreaElement;

function esCampoTexto(el: EventTarget | null): el is CampoTexto {
  if (el instanceof HTMLTextAreaElement) {
    // ok
  } else if (el instanceof HTMLInputElement) {
    if (!TIPOS_TEXTO.has((el.getAttribute('type') || 'text').toLowerCase())) return false;
  } else {
    return false;
  }
  return !el.readOnly && !el.closest('[data-keep-case]');
}

function onInput(e: Event) {
  if ((e as InputEvent).isComposing) return;
  const el = e.target;
  if (!esCampoTexto(el)) return;

  const valor = el.value;
  const mayus = valor.toLocaleUpperCase('es-CO');
  if (mayus === valor) return;

  const { selectionStart, selectionEnd } = el;
  // Setter nativo: React detecta el cambio y su onChange recibe ya el texto en mayúscula.
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, mayus);
  if (selectionStart != null && mayus.length === valor.length) {
    el.setSelectionRange(selectionStart, selectionEnd);
  }
}

let instalado = false;

/** Se registra en captura, antes de que React procese el evento. */
export function instalarMayusculas() {
  if (instalado) return;
  instalado = true;
  document.addEventListener('input', onInput, true);
}

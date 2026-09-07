import { useEffect, useRef, useState } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKeyboard } from './keyboard-context';

/** Devuelve el input/textarea con foco, o null. */
function focusedField(): HTMLInputElement | HTMLTextAreaElement | null {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el;
  }
  return null;
}

function nativeSetValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  // Dispara el onChange de React (input controlado).
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertText(text: string) {
  const el = focusedField();
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  nativeSetValue(el, el.value.slice(0, start) + text + el.value.slice(end));
  const caret = start + text.length;
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* type=date/number no soportan selección */
  }
}

function backspace() {
  const el = focusedField();
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  if (start === end) {
    if (start === 0) return;
    nativeSetValue(el, el.value.slice(0, start - 1) + el.value.slice(end));
    try {
      el.setSelectionRange(start - 1, start - 1);
    } catch {
      /* noop */
    }
  } else {
    nativeSetValue(el, el.value.slice(0, start) + el.value.slice(end));
    try {
      el.setSelectionRange(start, start);
    } catch {
      /* noop */
    }
  }
}

export function OnScreenKeyboard() {
  const { visible, close } = useKeyboard();
  const [layoutName, setLayoutName] = useState('default');
  const panelRef = useRef<HTMLDivElement>(null);

  // Empuja el contenido (var --osk-height) y desplaza el campo enfocado a la vista.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty('--osk-height', '0px');
      return;
    }
    const h = panelRef.current?.offsetHeight ?? 320;
    root.style.setProperty('--osk-height', `${h}px`);

    const scrollFocused = () => {
      const el = focusedField();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const t = window.setTimeout(scrollFocused, 50);
    document.addEventListener('focusin', scrollFocused);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('focusin', scrollFocused);
      root.style.setProperty('--osk-height', '0px');
    };
  }, [visible]);

  if (!visible) return null;

  function onKeyPress(button: string) {
    switch (button) {
      case '{shift}':
      case '{lock}':
        setLayoutName((l) => (l === 'default' ? 'shift' : 'default'));
        return;
      case '{bksp}':
        backspace();
        return;
      case '{space}':
        insertText(' ');
        return;
      case '{enter}':
        close();
        return;
      default:
        insertText(button);
    }
  }

  return (
    <div
      ref={panelRef}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-2 shadow-2xl backdrop-blur"
      // Evita que al tocar el panel se pierda el foco del input destino.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            Teclado en pantalla
          </span>
          <Button variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={close}>
            <X className="size-4" /> Cerrar
          </Button>
        </div>
        <Keyboard
          layoutName={layoutName}
          onKeyPress={onKeyPress}
          preventMouseDownDefault
          layout={{
            default: [
              '1 2 3 4 5 6 7 8 9 0',
              'q w e r t y u i o p',
              'a s d f g h j k l ñ',
              '{shift} z x c v b n m {bksp}',
              '@ . - _ {space} {enter}',
            ],
            shift: [
              '1 2 3 4 5 6 7 8 9 0',
              'Q W E R T Y U I O P',
              'A S D F G H J K L Ñ',
              '{shift} Z X C V B N M {bksp}',
              '@ . - _ {space} {enter}',
            ],
          }}
          display={{
            '{bksp}': '⌫',
            '{space}': 'Espacio',
            '{shift}': '⇧',
            '{enter}': 'Cerrar',
          }}
        />
      </div>
    </div>
  );
}

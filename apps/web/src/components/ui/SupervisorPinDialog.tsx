import { useState } from 'react';
import { LoaderCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Numpad } from '@/components/ui/numpad';

/**
 * Pide el PIN de un supervisor. `onConfirm` devuelve el mensaje de error
 * (se muestra en el diálogo) o null si la acción se hizo.
 */
export function SupervisorPinDialog({
  open,
  title,
  description,
  accion,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  accion: string;
  onClose: () => void;
  onConfirm: (pin: string) => Promise<string | null>;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function cerrar() {
    if (enviando) return;
    setPin('');
    setError(null);
    onClose();
  }

  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    if (pin.length < 4 || enviando) return;
    setEnviando(true);
    setError(null);
    const err = await onConfirm(pin);
    setEnviando(false);
    setPin('');
    if (err) setError(err);
  }

  return (
    <Dialog open={open} onClose={cerrar} title={title} className="max-w-2xl">
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">{description}</div>
          <Input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label="PIN de supervisor"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="PIN de supervisor"
            className="h-12 text-center text-2xl tracking-[0.5em]"
          />
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <div className="mt-auto flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={cerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" className="h-12 flex-1" disabled={enviando || pin.length < 4}>
              {enviando ? <LoaderCircle className="size-4 animate-spin" /> : <Lock className="size-4" />}
              {accion}
            </Button>
          </div>
        </div>
        <Numpad
          disabled={enviando}
          onDigit={(d) => setPin((p) => (p + d).slice(0, 12))}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          onClear={() => setPin('')}
        />
      </form>
    </Dialog>
  );
}

import { useState } from 'react';
import { Lock, LoaderCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from './button';
import { Dialog } from './dialog';
import { Input } from './input';

/** Verifica cédula + PIN de un administrador para autorizar acciones sensibles. */
export function useVerifyAdmin() {
  return useMutation({
    mutationFn: async (creds: { documentId: string; pin: string }) =>
      (
        await api.post<{ ok: boolean; fullName: string }>(
          '/auth/verify-admin',
          creds,
        )
      ).data,
  });
}

/** Diálogo reutilizable que pide cédula+PIN de un administrador antes de ejecutar una acción sensible (borrar, cambiar de orden, etc). */
export function AdminAuthDialog({
  open,
  onClose,
  onAuthorized,
  title = 'Autorización requerida',
  description = 'Ingresa la cédula y PIN de un administrador para continuar.',
}: {
  open: boolean;
  onClose: () => void;
  onAuthorized: () => void;
  title?: string;
  description?: string;
}) {
  const [documentId, setDocumentId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verify = useVerifyAdmin();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    verify.mutate(
      { documentId: documentId.trim(), pin: pin.trim() },
      {
        onSuccess: () => {
          setDocumentId('');
          setPin('');
          onAuthorized();
        },
        onError: (err) => {
          const detail = (
            err as { response?: { data?: { message?: string | string[] } } }
          ).response?.data?.message;
          setError(
            Array.isArray(detail)
              ? detail.join(' ')
              : detail || 'No se pudo verificar. Intenta de nuevo.',
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className="max-w-sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Cédula</label>
          <Input
            autoFocus
            inputMode="numeric"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value.replace(/\D/g, ''))}
            placeholder="Cédula del administrador"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">PIN</label>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
          />
        </div>
        {error && (
          <p className="text-sm font-medium text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              verify.isPending || documentId.length < 5 || pin.length < 4
            }
          >
            {verify.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Lock className="size-4" />
            )}
            Autorizar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { PostaReciboIcon } from '@/components/icons/PostaReciboIcon';
import { RegistroPostaTab } from './RegistroPostaTab';

export function PostaReciboPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PostaReciboIcon className="size-9" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orden recibo en posta</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Registro de órdenes de recibo en posta.
          </p>
        </div>
      </div>

      <RegistroPostaTab />
    </div>
  );
}


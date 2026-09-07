import { useEffect } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from './auth-context';

/** Confirmación breve tras un login exitoso, antes de entrar al Panel. */
export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();

  useEffect(() => {
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [onDone]);

  const firstName = user?.fullName?.split(' ')[0] ?? '';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex size-24 animate-pop-in items-center justify-center rounded-full bg-emerald-50">
        <svg
          viewBox="0 0 52 52"
          className="size-12"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="26" cy="26" r="24" className="text-emerald-100" strokeWidth="3" />
          <path
            d="M16 27 L23 34 L37 19"
            className="animate-check-draw text-emerald-600"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="animate-fade-up space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          ¡Bienvenido{firstName ? `, ${firstName}` : ''}!
        </h1>
        <p className="text-sm text-muted-foreground">
          Inicio de sesión exitoso
        </p>
      </div>
      <LoaderCircle className="size-6 animate-spin text-muted-foreground/60" />
    </div>
  );
}

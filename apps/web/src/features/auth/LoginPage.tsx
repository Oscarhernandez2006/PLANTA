import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Numpad } from '@/components/ui/numpad';
import { cn } from '@/lib/utils';
import { useAuth } from './auth-context';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import { PhotoCarousel } from './PhotoCarousel';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import logoCarnes from '@/assets/logo-carnes.png';
import logoAgroporcicola from '@/assets/logo-agroporcicola.png';
import logoCarnesfrias from '@/assets/logo-carnesfrias.png';

type Step = 'cedula' | 'pin';
const MIN_CEDULA = 5;
const MIN_PIN = 4;
const MAX_PIN = 12;

export function LoginPage() {
  const { login, checkCedula } = useAuth();
  const [step, setStep] = useState<Step>('cedula');
  const [cedula, setCedula] = useState('');
  const [pin, setPin] = useState('');
  const [userName, setUserName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleContinue() {
    setChecking(true);
    setError(null);
    try {
      const { exists, fullName } = await checkCedula(cedula);
      if (!exists) {
        setError('Esta cédula no está registrada en el sistema.');
        return;
      }
      setUserName(fullName);
      setStep('pin');
    } catch {
      setError('No se pudo validar la cédula. Intentá de nuevo.');
    } finally {
      setChecking(false);
    }
  }

  function handleDigit(d: string) {
    setError(null);
    if (step === 'cedula') {
      if (cedula.length < 15) setCedula((v) => v + d);
    } else if (pin.length < MAX_PIN) {
      setPin((v) => v + d);
    }
  }

  function handleBackspace() {
    setError(null);
    if (step === 'cedula') setCedula((v) => v.slice(0, -1));
    else setPin((v) => v.slice(0, -1));
  }

  function handleClear() {
    setError(null);
    if (step === 'cedula') setCedula('');
    else setPin('');
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await login(cedula, pin);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'No se pudo iniciar sesión.';
      setError(Array.isArray(message) ? message.join(' · ') : message);
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  // Permite escribir con el teclado físico del equipo (dígitos, Backspace, Enter).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (submitting || checking) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (step === 'cedula') {
          if (cedula.length >= MIN_CEDULA) void handleContinue();
        } else if (pin.length >= MIN_PIN) {
          void submit();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cedula, pin, submitting, checking]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Panel de marca — visible en pantallas medianas y grandes */}
      <div className="relative hidden w-1/2 overflow-hidden bg-sidebar lg:block">
        {/* Carrusel de fondo */}
        <PhotoCarousel className="absolute inset-0" />
        {/* Overlay sutil para resaltar los logos */}
        <div className="pointer-events-none absolute inset-0 bg-sidebar/30" />

        {/* Un logo en cada esquina */}
        <img
          src={logoSantaCruz}
          alt="Agropecuaria Santa Cruz"
          className="absolute left-5 top-5 w-40 object-contain drop-shadow-2xl"
        />
        <img
          src={logoCarnes}
          alt="Carnes Santa Cruz"
          className="absolute right-5 top-5 w-40 object-contain drop-shadow-2xl"
        />
        <img
          src={logoAgroporcicola}
          alt="Agroporícola Santa Cruz"
          className="absolute bottom-5 left-5 w-40 object-contain drop-shadow-2xl"
        />
        <img
          src={logoCarnesfrias}
          alt="Santa Cruz Producimos Vida"
          className="absolute bottom-5 right-5 w-40 object-contain drop-shadow-2xl"
        />
      </div>

      {/* Panel de acceso */}
      <div className="flex w-full flex-col items-center justify-center gap-6 bg-muted/40 px-5 py-6 lg:w-1/2">
        {/* Marca fuera de la tarjeta, como encabezado de la pantalla */}
        <div className="flex items-center gap-3">
          <div className="brillo-diamante shrink-0 rounded-full">
            <img
              src={logoSantaCruz}
              alt="Agropecuaria Santa Cruz"
              className="h-[4.5rem] object-contain"
            />
          </div>
          <div className="font-['Montserrat'] text-[#1F2937]">
            <p className="texto-diamante text-5xl font-extrabold leading-[0.9] tracking-tight">SIGPRO</p>
            <p className="mt-1.5 whitespace-nowrap text-[0.72rem] font-bold uppercase tracking-wide">
              Sistema de gestión de producción
            </p>
          </div>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card px-8 py-7 shadow-xl shadow-slate-900/5">
          {step === 'pin' && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold leading-tight">
                  {userName ? `Hola, ${userName.split(' ')[0]}` : `Cédula ${cedula}`}
                </p>
                <p className="text-sm text-muted-foreground">Ingresá tu PIN</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 shrink-0"
                disabled={submitting}
                onClick={() => {
                  setStep('cedula');
                  setPin('');
                  setUserName(null);
                  setError(null);
                }}
              >
                <ArrowLeft className="size-4" /> Cambiar cédula
              </Button>
            </div>
          )}

          {step === 'cedula' ? (
            <CedulaDisplay value={cedula} />
          ) : (
            <PinDisplay length={pin.length} />
          )}

          {/* Aviso flotante: no empuja el teclado ni genera scroll */}
          {error && (
            <div className="pointer-events-none fixed left-1/2 top-6 z-50 w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 lg:left-3/4">
              <p
                role="alert"
                className="pointer-events-auto rounded-xl border border-red-200 bg-white px-4 py-3 text-center text-sm font-medium text-red-700 shadow-lg animate-in fade-in-0 slide-in-from-top-2"
              >
                {error}
              </p>
            </div>
          )}

          <Numpad
            className={step === 'pin' ? 'mt-4' : 'mt-6'}
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onClear={handleClear}
            disabled={submitting}
          />

          <div className={step === 'pin' ? 'mt-4' : 'mt-6'}>
            {step === 'cedula' ? (
              <Button
                size="lg"
                className={cn('h-14 w-full text-base', DESHABILITADO)}
                disabled={cedula.length < MIN_CEDULA || checking}
                onClick={handleContinue}
              >
                {checking ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : (
                  <>
                    Continuar <ArrowRight className="size-5" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="lg"
                className={cn('h-14 w-full text-base', DESHABILITADO)}
                disabled={pin.length < MIN_PIN || submitting}
                onClick={submit}
              >
                {submitting ? <LoaderCircle className="size-5 animate-spin" /> : 'Ingresar'}
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Agropecuaria Santa Cruz, {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

// Mientras falten datos el botón se ve gris, no como un rojo desvanecido.
const DESHABILITADO = 'disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none';

function CedulaDisplay({ value }: { value: string }) {
  return (
    <div className="flex h-16 items-center justify-center rounded-xl border border-border bg-card px-4 text-3xl font-semibold tracking-[0.2em] tabular-nums">
      {value ? (
        value
      ) : (
        <span className="text-2xl tracking-normal text-muted-foreground/50">
          Número de cédula
        </span>
      )}
    </div>
  );
}

function PinDisplay({ length }: { length: number }) {
  const dots = Math.max(length, MIN_PIN);
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: dots }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'size-4 rounded-full border-2 transition',
            i < length
              ? 'border-primary bg-primary'
              : 'border-border bg-transparent',
          )}
        />
      ))}
    </div>
  );
}

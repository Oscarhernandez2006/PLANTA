import { useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Numpad } from '@/components/ui/numpad';
import { cn } from '@/lib/utils';
import { useAuth } from './auth-context';
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
      <div className="flex w-full flex-col items-center justify-center px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <img
              src={logoSantaCruz}
              alt="Agropecuaria Santa Cruz"
              className="mb-3 size-16 object-contain"
            />
            <p className="text-lg font-semibold">Agropecuaria Santa Cruz</p>
          </div>

          <div className="mb-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {step === 'cedula' ? 'Iniciar sesión' : 'Ingresá tu PIN'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 'cedula'
                ? 'Escribí tu número de cédula'
                : userName
                  ? `Hola, ${userName.split(' ')[0]}`
                  : `Cédula ${cedula}`}
            </p>
          </div>

          {step === 'cedula' ? (
            <CedulaDisplay value={cedula} />
          ) : (
            <PinDisplay length={pin.length} />
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
              {error}
            </p>
          )}

          <Numpad
            className="mt-6"
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onClear={handleClear}
            disabled={submitting}
          />

          <div className="mt-6 space-y-3">
            {step === 'cedula' ? (
              <Button
                size="lg"
                className="h-14 w-full text-base"
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
              <>
                <Button
                  size="lg"
                  className="h-14 w-full text-base"
                  disabled={pin.length < MIN_PIN || submitting}
                  onClick={submit}
                >
                  {submitting ? (
                    <LoaderCircle className="size-5 animate-spin" />
                  ) : (
                    'Ingresar'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="h-12 w-full"
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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

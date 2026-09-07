import { useAuth } from '@/features/auth/auth-context';

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName?.split(' ')[0] ?? '';

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Hola{firstName ? `, ${firstName}` : ''}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Aún no hay módulos configurados. Se irán agregando a medida que los
        vayamos definiendo.
      </p>
    </div>
  );
}

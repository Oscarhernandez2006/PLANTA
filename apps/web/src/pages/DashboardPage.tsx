import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { MenuModulos } from '@/components/layout/MenuModulos';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.fullName?.split(' ')[0] ?? '';

  return (
    <div className="flex h-full min-h-[32rem] flex-col">
      <h1 className="mx-auto mb-4 w-full max-w-6xl shrink-0 text-2xl font-semibold tracking-tight">
        Hola{firstName ? `, ${firstName}` : ''}. ¿A qué módulo vas?
      </h1>
      <div className="min-h-0 flex-1">
        <MenuModulos onElegir={(ruta) => navigate(ruta)} />
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoaderCircle, TriangleAlert, Users, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SupervisorPinDialog } from '@/components/ui/SupervisorPinDialog';
import { cn } from '@/lib/utils';
import type { DestinoRecibo } from './api';

const QUE_FALTA: Record<Extract<DestinoRecibo, { ok: false }>['motivo'], string> = {
  sin_cliente: 'Crea (o activa) el cliente en el módulo Clientes.',
  sin_nit: 'Registra el NIT del cliente en el módulo Clientes.',
  sin_bodega: 'Crea una bodega para el cliente en el módulo Clientes.',
};

/**
 * Cierre de una orden de recibo: primero valida que el cliente exista con NIT y bodega (si no,
 * avisa qué falta crear) y luego pide la bodega destino y el PIN del supervisor.
 */
export function CierreRecibo({
  open,
  titulo,
  resumen,
  cargarDestino,
  onClose,
  onConfirm,
}: {
  open: boolean;
  titulo: string;
  resumen: React.ReactNode;
  cargarDestino: () => Promise<DestinoRecibo>;
  onClose: () => void;
  onConfirm: (pin: string, bodegaId: string) => Promise<string | null>;
}) {
  const navigate = useNavigate();
  const [destino, setDestino] = useState<DestinoRecibo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bodegaId, setBodegaId] = useState('');

  useEffect(() => {
    if (!open) {
      setDestino(null);
      setError(null);
      return;
    }
    let vigente = true;
    cargarDestino()
      .then((d) => {
        if (!vigente) return;
        setDestino(d);
        if (d.ok) setBodegaId(d.bodegas[0].id);
      })
      .catch(() => vigente && setError('No se pudo validar el cliente de la orden.'));
    return () => {
      vigente = false;
    };
    // Se valida una vez por apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  if (!destino || !destino.ok) {
    return (
      <Dialog open onClose={onClose} title={titulo} className="max-w-lg">
        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : !destino ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <TriangleAlert className="size-6 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="text-base font-semibold">Primero debes crear el cliente</p>
                <p>{destino.mensaje}</p>
                <p>
                  Para cerrar la orden de recibo y mover lo recibido al inventario y a la bodega del cliente, el cliente
                  debe existir con su NIT y tener una bodega creada. {QUE_FALTA[destino.motivo]}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-11" onClick={onClose}>
                Entendido
              </Button>
              <Button className="h-11" onClick={() => navigate('/clientes')}>
                <Users className="size-4" />
                Ir a Clientes
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <SupervisorPinDialog
      open
      title={titulo}
      accion="Cerrar orden"
      description={
        <div className="space-y-3">
          <div>{resumen}</div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide">
              Entra al inventario de {destino.cliente.concepto} en la bodega
            </p>
            <div className="grid gap-1.5">
              {destino.bodegas.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBodegaId(b.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold uppercase text-foreground',
                    bodegaId === b.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted',
                  )}
                >
                  <Warehouse className="size-4 shrink-0" />
                  {b.code} - {b.nombre}
                </button>
              ))}
            </div>
          </div>
          <p>
            Ingresa el PIN de un <b className="text-foreground">supervisor</b>.
          </p>
        </div>
      }
      onClose={onClose}
      onConfirm={(pin) => onConfirm(pin, bodegaId)}
    />
  );
}

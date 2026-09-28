import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label, Select } from '@/components/ui/input';
import { OrdenBeneficioIcon } from '@/components/icons/OrdenBeneficioIcon';
import { plantToday as today } from '@/lib/utils';
import {
  useOrdenBeneficioCandidates,
  useOrdenBeneficioNextReference,
  useCreateOrdenBeneficio,
  formatOB,
  type OrdenBeneficioStatus,
} from './orden-beneficio-api';

export function OrdenBeneficioPage() {
  const todayStr = today();
  // Candidatos (para crear lote) siempre son del día actual.
  const candidates = useOrdenBeneficioCandidates(todayStr);

  const cands = candidates.data ?? [];

  // Guías disponibles para crear un lote, aplanadas con su cliente.
  const guiasDisponibles = cands.flatMap((c) =>
    c.guiasDetalle.map((g) => ({ ...g, cliente: c.cliente })),
  );

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <OrdenBeneficioIcon className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Orden de Beneficio
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Crea un lote de beneficio a partir de una guía de movilización
              con animales cargados desde Peso en Pie.
            </p>
          </div>
        </div>
      </div>

      <RegistrarOrdenBeneficioForm
        date={todayStr}
        guiasDisponibles={guiasDisponibles}
        loadingGuias={candidates.isLoading}
        onCreated={() => candidates.refetch()}
      />
    </div>
  );
}

type GuiaDisponible = {
  guia: string;
  cliente: string;
  corrales: string[];
  animalesEnPie: number;
  asignados: number;
  disponibles: number;
  pcReference: number | null;
  bpReference: number | null;
};

function RegistrarOrdenBeneficioForm({
  date,
  guiasDisponibles,
  loadingGuias,
  onCreated,
}: {
  date: string;
  guiasDisponibles: GuiaDisponible[];
  loadingGuias: boolean;
  onCreated: () => void;
}) {
  const nextRef = useOrdenBeneficioNextReference(date);
  const crear = useCreateOrdenBeneficio();
  const [guia, setGuia] = useState('');
  const [status, setStatus] = useState<OrdenBeneficioStatus>('activo');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const seleccionada = guiasDisponibles.find((g) => g.guia === guia);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!seleccionada) {
      setError('Selecciona una guía de movilización.');
      return;
    }
    try {
      const created = await crear.mutateAsync({
        cliente: seleccionada.cliente,
        guia: seleccionada.guia,
        date,
        status,
      });
      setOkMsg(`Lote ${formatOB(created.reference)} registrado.`);
      setGuia('');
      setStatus('activo');
      void nextRef.refetch();
      onCreated();
    } catch (err) {
      const detail = (
        err as { response?: { data?: { message?: string | string[] } } }
      ).response?.data?.message;
      setError(
        Array.isArray(detail) ? detail.join(' ') : detail || 'No se pudo crear el lote.',
      );
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Registrar orden de beneficio</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              OI N.º
            </Label>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
              {nextRef.data ? formatOB(nextRef.data.next) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Se asigna automáticamente al guardar.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ob-proceso">Proceso</Label>
              <Input id="ob-proceso" value="SACRIFICIO" disabled className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-fecha-proceso">Fecha del proceso</Label>
              <Input
                id="ob-fecha-proceso"
                type="date"
                className="h-9"
                value={date}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-fecha-sacrificio">Fecha del sacrificio</Label>
              <Input
                id="ob-fecha-sacrificio"
                type="date"
                className="h-9"
                value={date}
                disabled
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ob-guia">Guía de movilización</Label>
              <Combobox
                id="ob-guia"
                className="h-9"
                value={guia}
                onChange={setGuia}
                placeholder={loadingGuias ? 'Cargando…' : 'Busca por guía o cliente…'}
                emptyText="Sin guías disponibles"
                options={guiasDisponibles.map((g) => ({
                  value: g.guia,
                  label: `${g.guia} — ${g.cliente} (${g.disponibles} disponibles)`,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-cliente">Cliente</Label>
              <Input
                id="ob-cliente"
                value={seleccionada?.cliente ?? ''}
                disabled
                placeholder="Se completa al elegir la guía"
                className="h-9"
              />
            </div>
          </div>
          {!loadingGuias && !guiasDisponibles.length && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Aún no hay guías con animales cargados. Carga los animales y
              cierra la guía en Peso en Pie para verla aquí.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ob-estado">Estado</Label>
            <Select
              id="ob-estado"
              className="h-9 sm:max-w-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrdenBeneficioStatus)}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              <option value="procesado">Procesado</option>
            </Select>
          </div>

          {seleccionada && (
            <p className="text-sm text-muted-foreground">
              Se asignarán los {seleccionada.disponibles} animales disponibles
              de esta guía al nuevo lote.
            </p>
          )}
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {okMsg && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {okMsg}
            </p>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <Button
              type="submit"
              size="lg"
              className="h-9 px-8"
              disabled={!seleccionada || crear.isPending}
            >
              <Save className="size-5" />
              {crear.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

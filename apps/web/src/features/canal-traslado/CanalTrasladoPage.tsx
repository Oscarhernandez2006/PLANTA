import { useState } from 'react';
import { ArrowLeftRight, Inbox, LoaderCircle, RefreshCw, ScanLine, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import {
  CAVAS_TRASLADO,
  useBuscarCanal,
  useTrasladarCanal,
  useHistorialTraslados,
  type CanalEscaneada,
} from './api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CanalTrasladoPage() {
  const [date, setDate] = useState(today());
  const [consecutivo, setConsecutivo] = useState('');
  const [pendientes, setPendientes] = useState<CanalEscaneada[]>([]);
  const [cavaDestino, setCavaDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const buscar = useBuscarCanal();
  const trasladar = useTrasladarCanal();
  const historial = useHistorialTraslados(date);

  function escanear() {
    const valor = consecutivo.trim();
    if (!valor) return;
    setError(null);
    buscar.mutate(
      { consecutivo: valor, date },
      {
        onSuccess: (canal) => {
          setConsecutivo('');
          setPendientes((prev) =>
            prev.some((p) => p.eventoId === canal.eventoId)
              ? prev
              : [...prev, canal],
          );
        },
        onError: (err) => {
          const detail = (
            err as { response?: { data?: { message?: string | string[] } } }
          ).response?.data?.message;
          setError(
            Array.isArray(detail) ? detail.join(' ') : detail || 'No se encontró la canal.',
          );
          setConsecutivo('');
        },
      },
    );
  }

  function quitar(eventoId: string) {
    setPendientes((prev) => prev.filter((p) => p.eventoId !== eventoId));
  }

  async function confirmarTraslado() {
    if (!cavaDestino || !motivo.trim() || !pendientes.length) return;
    setError(null);
    const restantes: CanalEscaneada[] = [];
    for (const p of pendientes) {
      try {
        await trasladar.mutateAsync({
          eventoId: p.eventoId,
          cavaDestino,
          motivo: motivo.trim(),
        });
      } catch (err) {
        const detail = (
          err as { response?: { data?: { message?: string | string[] } } }
        ).response?.data?.message;
        setError(
          `Canal #${p.consecutivo}: ${
            Array.isArray(detail) ? detail.join(' ') : detail || 'no se pudo trasladar.'
          }`,
        );
        restantes.push(p);
      }
    }
    setPendientes(restantes);
    if (!restantes.length) setMotivo('');
  }

  const rows = historial.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Traslado de Canales
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Escanea el consecutivo de cada canal para moverla de una cava a
              otra, con motivo y responsable para trazabilidad real.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-40"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => historial.refetch()}
            disabled={historial.isFetching}
          >
            <RefreshCw className={cn('size-4', historial.isFetching && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
            Escanear canal (consecutivo del día)
            <div className="flex items-center gap-2">
              <ScanLine className="size-5 text-muted-foreground" />
              <Input
                autoFocus
                value={consecutivo}
                onChange={(e) => setConsecutivo(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') escanear();
                }}
                placeholder="Ej: 42"
                className="h-9"
              />
            </div>
          </label>
          <Button onClick={escanear} disabled={buscar.isPending || !consecutivo.trim()}>
            {buscar.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              'Agregar'
            )}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {pendientes.length > 0 && (
          <div className="rounded-md border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>Canal</TH>
                  <TH>Lote</TH>
                  <TH>Cliente</TH>
                  <TH>Cava actual</TH>
                  <TH className="w-10" />
                </TR>
              </THead>
              <TBody>
                {pendientes.map((p) => (
                  <TR key={p.eventoId}>
                    <TD className="font-semibold tabular-nums">#{p.consecutivo}</TD>
                    <TD className="tabular-nums">{p.reference}</TD>
                    <TD>{p.cliente}</TD>
                    <TD>{p.cava ?? '—'}</TD>
                    <TD>
                      <button
                        onClick={() => quitar(p.eventoId)}
                        title="Quitar de la lista"
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Cava destino
            <Select value={cavaDestino} onChange={(e) => setCavaDestino(e.target.value)} className="h-9">
              <option value="">Seleccione...</option>
              {CAVAS_TRASLADO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Motivo del traslado
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: reubicación por capacidad, mantenimiento, despacho..."
              className="h-9"
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Responsable: {user?.fullName ?? '—'}
          </span>
          <Button
            onClick={confirmarTraslado}
            disabled={
              !pendientes.length || !cavaDestino || !motivo.trim() || trasladar.isPending
            }
          >
            {trasladar.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="size-4" />
            )}
            Confirmar traslado ({pendientes.length})
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Historial de traslados del día
        </div>
        {historial.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando…
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-6" />
            Aún no hay traslados registrados este día.
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Hora</TH>
                  <TH>Lote</TH>
                  <TH>Cliente</TH>
                  <TH>De</TH>
                  <TH>A</TH>
                  <TH>Motivo</TH>
                  <TH>Responsable</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums">{hora(r.createdAt)}</TD>
                    <TD className="tabular-nums">{r.reference}</TD>
                    <TD>{r.cliente}</TD>
                    <TD>
                      <Badge tone="neutral">{r.cavaOrigen ?? 'Sin cava'}</Badge>
                    </TD>
                    <TD>
                      <Badge tone="success">{r.cavaDestino}</Badge>
                    </TD>
                    <TD className="max-w-xs truncate" title={r.motivo}>
                      {r.motivo}
                    </TD>
                    <TD>{r.operatorName}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

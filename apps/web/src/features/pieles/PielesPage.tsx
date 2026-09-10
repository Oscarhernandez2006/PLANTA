import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { PielesIcon } from '@/components/icons/PielesIcon';
import { cn } from '@/lib/utils';
import {
  usePielesPendientes,
  usePielesPesados,
  useRegistrarPiel,
  type PielPendiente,
} from './api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function PielesPage() {
  const pendientes = usePielesPendientes();
  const pesados = usePielesPesados();

  const cola = useMemo(
    () =>
      [...(pendientes.data ?? [])].sort(
        (a, b) => a.consecutivo - b.consecutivo,
      ),
    [pendientes.data],
  );
  const actual = cola[0] ?? null;
  const enCola = cola.slice(1);
  const pesadosList = pesados.data ?? [];
  const refrescando = pendientes.isFetching || pesados.isFetching;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PielesIcon className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pieles</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cada animal caído en Insensibilización aparece aquí para tomar el
              peso de su piel, en el orden en que cayó.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{today()}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              pendientes.refetch();
              pesados.refetch();
            }}
            disabled={refrescando}
          >
            <RefreshCw className={cn('size-4', refrescando && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Animal por pesar */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <Scale className="size-4" /> Animal por pesar
        </div>
        {pendientes.isLoading ? (
          <Loading />
        ) : !actual ? (
          <Empty text="No hay animales caídos por pesar. En cuanto se insensibilice un animal, aparecerá aquí." />
        ) : (
          <PesarActual actual={actual} pendientesCount={cola.length} />
        )}
      </Card>

      {/* En cola */}
      {enCola.length > 0 && (
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
            <Clock className="size-4" /> En cola ({enCola.length})
          </div>
          <div className="overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-20">Consec.</TH>
                  <TH>Cliente</TH>
                  <TH>Guía</TH>
                  <TH>Cayó</TH>
                </TR>
              </THead>
              <TBody>
                {enCola.map((p) => (
                  <TR key={p.eventoId}>
                    <TD className="font-semibold tabular-nums">
                      {p.consecutivo}
                    </TD>
                    <TD className="font-medium">{p.cliente}</TD>
                    <TD className="text-muted-foreground">
                      {p.guias.length ? p.guias.join(', ') : '—'}
                    </TD>
                    <TD className="tabular-nums text-muted-foreground">
                      {hora(p.stunnedAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Pesados hoy */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <PielesIcon className="size-4" /> Pieles pesadas hoy
        </div>
        {pesados.isLoading ? (
          <Loading />
        ) : !pesadosList.length ? (
          <Empty text="Aún no se ha pesado ninguna piel hoy." />
        ) : (
          <div className="overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-20">Consec.</TH>
                  <TH>Cliente</TH>
                  <TH>Guía</TH>
                  <TH className="text-right">Peso (kg)</TH>
                  <TH>Hora</TH>
                  <TH>Operario</TH>
                </TR>
              </THead>
              <TBody>
                {pesadosList.map((p) => (
                  <TR key={p.eventoId}>
                    <TD className="font-semibold tabular-nums">
                      {p.consecutivo}
                    </TD>
                    <TD className="font-medium">{p.cliente}</TD>
                    <TD className="text-muted-foreground">
                      {p.guias.length ? p.guias.join(', ') : '—'}
                    </TD>
                    <TD className="text-right font-semibold tabular-nums">
                      {p.pesoKg.toFixed(2)}
                    </TD>
                    <TD className="tabular-nums text-muted-foreground">
                      {hora(p.pieladoAt)}
                    </TD>
                    <TD className="text-muted-foreground">{p.operatorName}</TD>
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

function PesarActual({
  actual,
  pendientesCount,
}: {
  actual: PielPendiente;
  pendientesCount: number;
}) {
  const [peso, setPeso] = useState('');
  const registrar = useRegistrarPiel();
  const inputRef = useRef<HTMLInputElement>(null);

  // Al pasar al siguiente animal, limpia el campo y reenfoca.
  useEffect(() => {
    setPeso('');
    inputRef.current?.focus();
  }, [actual.eventoId]);

  const valor = Number(peso.replace(',', '.'));
  const valido = peso.trim() !== '' && Number.isFinite(valor) && valor > 0;

  function guardar() {
    if (!valido || registrar.isPending) return;
    registrar.mutate({ eventoId: actual.eventoId, pesoKg: valor });
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">
          Consecutivo del día
        </div>
        <div className="text-4xl font-bold tabular-nums text-foreground">
          #{actual.consecutivo}
        </div>
        <div className="pt-1 text-lg font-semibold">
          {actual.cliente}
          {actual.guias.length ? (
            <span className="text-muted-foreground">
              {' '}
              · {actual.guias.join(', ')}
            </span>
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground">
          Cayó a las {hora(actual.stunnedAt)} · {pendientesCount} por pesar
        </div>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Peso de la piel (kg)
          <Input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            autoFocus
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardar();
            }}
            className="h-11 w-40 text-lg"
            placeholder="0.00"
          />
        </label>
        <Button
          size="lg"
          onClick={guardar}
          disabled={!valido || registrar.isPending}
        >
          {registrar.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Scale className="size-4" />
          )}
          Guardar peso
        </Button>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" /> Cargando…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
      <Inbox className="size-6" />
      {text}
    </div>
  );
}

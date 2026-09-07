import { useEffect, useState } from 'react';
import { Check, Eraser, Pencil, Inbox, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import {
  useConductores,
  useConductorNextCode,
  useCreateConductor,
  formatProcedenciaCode,
} from './api';

export function ConductorModal({
  open,
  onClose,
  value,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onConfirm: (conductor: string) => void;
}) {
  const keyboard = useKeyboard();
  const [codigo, setCodigo] = useState<number | null>(null);
  const [conductor, setConductor] = useState(value);
  const [detalles, setDetalles] = useState('');
  const [error, setError] = useState<string | null>(null);

  // El campo Conductor funciona como buscador de la lista.
  const registros = useConductores(conductor.trim());
  const nextCode = useConductorNextCode(open);
  const create = useCreateConductor();

  // Código a mostrar: el del registro seleccionado o el próximo autogenerado.
  const displayCode = codigo ?? nextCode.data?.next ?? null;

  useEffect(() => {
    if (open) {
      setConductor(value);
      setCodigo(null);
      setDetalles('');
      setError(null);
    }
  }, [open, value]);

  function limpiar() {
    setCodigo(null);
    setConductor('');
    setDetalles('');
    setError(null);
  }

  async function confirmar() {
    const concepto = conductor.trim();
    if (!concepto) {
      setError('Escribí el conductor.');
      return;
    }
    setError(null);
    try {
      const saved = await create.mutateAsync({ concepto });
      onConfirm(saved.concepto);
    } catch {
      setError('No se pudo guardar el conductor.');
    }
  }

  const rows = registros.data ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Conductor"
      description="Conductor de la guía de movilización."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="codigo-cond">Código</Label>
            <Input
              id="codigo-cond"
              className="h-11 tabular-nums"
              readOnly
              value={displayCode != null ? formatProcedenciaCode(displayCode) : ''}
              placeholder="Automático"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cond-modal">Conductor</Label>
            <KeyboardField>
              <Input
                id="cond-modal"
                className="h-11 pr-11"
                placeholder="Escribí el conductor…"
                value={conductor}
                onChange={(e) => {
                  setConductor(e.target.value);
                  setCodigo(null);
                }}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="detalles-cond">Detalles</Label>
          <KeyboardField>
            <Input
              id="detalles-cond"
              className="h-11 pr-11"
              value={detalles}
              onChange={(e) => setDetalles(e.target.value)}
              onDoubleClick={keyboard.open}
            />
          </KeyboardField>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Registros</Label>
            {registros.isFetching && (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <Table>
              <THead className="sticky top-0 bg-muted/40">
                <TR>
                  <TH className="w-32">Código</TH>
                  <TH>Concepto</TH>
                </TR>
              </THead>
              <TBody>
                {rows.length === 0 ? (
                  <TR className="hover:bg-transparent">
                    <TD colSpan={2} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                        <Inbox className="size-7" />
                        <p className="text-sm font-medium">Sin registros</p>
                      </div>
                    </TD>
                  </TR>
                ) : (
                  rows.map((r) => (
                    <TR
                      key={r.id}
                      onClick={() => {
                        setConductor(r.concepto);
                        setCodigo(r.code);
                      }}
                      className="cursor-pointer"
                    >
                      <TD className="font-medium tabular-nums">
                        {formatProcedenciaCode(r.code)}
                      </TD>
                      <TD>{r.concepto}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" className="h-11 px-4" title="Editar">
            <Pencil className="size-5" />
            Editar
          </Button>
          <Button
            variant="outline"
            className="h-11 px-4"
            title="Limpiar"
            onClick={limpiar}
          >
            <Eraser className="size-5" />
            Limpiar
          </Button>
          <Button
            className="h-11 px-5"
            title="Confirmar"
            onClick={confirmar}
            disabled={create.isPending}
          >
            {create.isPending ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Check className="size-5" />
            )}
            Confirmar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

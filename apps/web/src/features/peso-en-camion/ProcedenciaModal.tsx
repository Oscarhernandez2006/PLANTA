import { useEffect, useState } from 'react';
import { Check, Eraser, Pencil, Inbox, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KeyboardField } from '@/components/keyboard/KeyboardField';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { useProcedencias, useCreateProcedencia } from './api';

export function ProcedenciaModal({
  open,
  onClose,
  value,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onConfirm: (procedencia: string) => void;
}) {
  const keyboard = useKeyboard();
  const [nit, setNit] = useState('');
  const [rspp, setRspp] = useState('');
  const [procedencia, setProcedencia] = useState(value);
  const [detalles, setDetalles] = useState('');
  const [error, setError] = useState<string | null>(null);

  // El campo Procedencia funciona como buscador de la lista.
  const registros = useProcedencias(procedencia.trim());
  const create = useCreateProcedencia();

  // Sincroniza el valor entrante cada vez que se abre.
  useEffect(() => {
    if (open) {
      setProcedencia(value);
      setNit('');
      setRspp('');
      setDetalles('');
      setError(null);
    }
  }, [open, value]);

  function limpiar() {
    setNit('');
    setRspp('');
    setProcedencia('');
    setDetalles('');
    setError(null);
  }

  async function confirmar() {
    const concepto = procedencia.trim();
    if (!nit.trim()) {
      setError('Escribí el NIT de la procedencia.');
      return;
    }
    if (!concepto) {
      setError('Escribí la procedencia.');
      return;
    }
    setError(null);
    try {
      const saved = await create.mutateAsync({
        concepto,
        nit: nit.trim(),
        rspp: rspp.trim() || undefined,
      });
      onConfirm(saved.concepto);
    } catch {
      setError('No se pudo guardar la procedencia.');
    }
  }

  const rows = registros.data ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Procedencia"
      description="Registro sanitario de predio proveedor (RSPP) y procedencia."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_180px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="nit-proc">NIT</Label>
            <KeyboardField>
              <Input
                id="nit-proc"
                className="h-9 pr-11 tabular-nums"
                placeholder="NIT"
                value={nit}
                onChange={(e) => setNit(e.target.value.replace(/[^0-9.-]/g, ''))}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rspp">RSPP</Label>
            <KeyboardField>
              <Input
                id="rspp"
                className="h-9 pr-11"
                value={rspp}
                onChange={(e) => setRspp(e.target.value.toUpperCase())}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proc-modal">Procedencia</Label>
            <KeyboardField>
              <Input
                id="proc-modal"
                className="h-9 pr-11"
                placeholder="Escribí la procedencia…"
                value={procedencia}
                onChange={(e) => setProcedencia(e.target.value)}
                onDoubleClick={keyboard.open}
              />
            </KeyboardField>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="detalles">Detalles</Label>
          <KeyboardField>
            <Input
              id="detalles"
              className="h-9 pr-11"
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
                  <TH className="w-40">NIT</TH>
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
                        setProcedencia(r.concepto);
                        setNit(r.nit ?? '');
                        setRspp(r.rspp ?? '');
                      }}
                      className="cursor-pointer"
                    >
                      <TD className="font-medium tabular-nums">{r.nit ?? '—'}</TD>
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
          <Button variant="outline" className="h-9 px-4" title="Editar">
            <Pencil className="size-5" />
            Editar
          </Button>
          <Button
            variant="outline"
            className="h-9 px-4"
            title="Limpiar"
            onClick={limpiar}
          >
            <Eraser className="size-5" />
            Limpiar
          </Button>
          <Button
            className="h-9 px-5"
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

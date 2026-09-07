import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { QuarterType, UnitForm } from '@frigorifico/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import {
  useCreateGoodsReceipt,
  useSuppliers,
  type CreateGoodsReceiptInput,
} from './api';
import { quarterTypeLabels, unitFormLabels } from './labels';

interface ItemRow {
  itemCode: string;
  unitForm: UnitForm;
  quarterType?: QuarterType;
  weightKg: string;
}

const emptyRow = (): ItemRow => ({
  itemCode: '',
  unitForm: UnitForm.MEDIA_CANAL,
  weightKg: '',
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function CreateGoodsReceiptDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const suppliers = useSuppliers();
  const create = useCreateGoodsReceipt();

  const [supplierId, setSupplierId] = useState('');
  const [receivedDate, setReceivedDate] = useState(today());
  const [originIcaCode, setOriginIcaCode] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSupplierId('');
    setReceivedDate(today());
    setOriginIcaCode('');
    setItems([emptyRow()]);
    setError(null);
  }

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: CreateGoodsReceiptInput = {
      supplierId,
      receivedDate,
      originIcaCode: originIcaCode || undefined,
      items: items.map((it) => ({
        itemCode: it.itemCode.trim(),
        unitForm: it.unitForm,
        quarterType:
          it.unitForm === UnitForm.CUARTO ? it.quarterType : undefined,
        weightKg: Number(it.weightKg),
      })),
    };

    if (!payload.supplierId) return setError('Seleccioná un proveedor.');
    if (payload.items.some((it) => !it.itemCode))
      return setError('Todos los ítems necesitan un código.');
    if (payload.items.some((it) => !it.weightKg || it.weightKg <= 0))
      return setError('Todos los ítems necesitan un peso válido.');
    if (
      payload.items.some(
        (it) => it.unitForm === UnitForm.CUARTO && !it.quarterType,
      )
    )
      return setError('Indicá si el cuarto es delantero o trasero.');

    try {
      await create.mutateAsync(payload);
      reset();
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'No se pudo registrar el ingreso.';
      setError(Array.isArray(message) ? message.join(' · ') : message);
    }
  }

  const totalKg = items.reduce((acc, it) => acc + (Number(it.weightKg) || 0), 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nuevo ingreso de mercancía"
      description="Registrá las canales, medias canales o cuartos recibidos desde faena."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Proveedor / origen</Label>
            <Select
              id="supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {suppliers.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.icaFarmCode ? ` (${s.icaFarmCode})` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Fecha de ingreso</Label>
            <Input
              id="date"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ica">Guía / predio ICA (opcional)</Label>
            <Input
              id="ica"
              value={originIcaCode}
              onChange={(e) => setOriginIcaCode(e.target.value)}
              placeholder="ICA-12345"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Ítems ({items.length})</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, emptyRow()])}
            >
              <Plus /> Agregar ítem
            </Button>
          </div>

          <div className="space-y-2">
            {items.map((it, i) => (
              <div
                key={i}
                className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1.2fr_1fr_1fr_0.9fr_auto]"
              >
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Código
                  </Label>
                  <Input
                    value={it.itemCode}
                    onChange={(e) =>
                      updateItem(i, { itemCode: e.target.value })
                    }
                    placeholder="CANAL-001"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Forma
                  </Label>
                  <Select
                    value={it.unitForm}
                    onChange={(e) =>
                      updateItem(i, {
                        unitForm: e.target.value as UnitForm,
                        quarterType: undefined,
                      })
                    }
                  >
                    {Object.values(UnitForm).map((uf) => (
                      <option key={uf} value={uf}>
                        {unitFormLabels[uf]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Cuarto
                  </Label>
                  <Select
                    value={it.quarterType ?? ''}
                    disabled={it.unitForm !== UnitForm.CUARTO}
                    onChange={(e) =>
                      updateItem(i, {
                        quarterType: (e.target.value || undefined) as
                          | QuarterType
                          | undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {Object.values(QuarterType).map((qt) => (
                      <option key={qt} value={qt}>
                        {quarterTypeLabels[qt]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Peso (kg)
                  </Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={it.weightKg}
                    onChange={(e) =>
                      updateItem(i, { weightKg: e.target.value })
                    }
                    placeholder="0,000"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setItems((prev) =>
                      prev.length === 1
                        ? prev
                        : prev.filter((_, idx) => idx !== i),
                    )
                  }
                  aria-label="Quitar ítem"
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Total:{' '}
            <span className="font-semibold text-foreground">
              {totalKg.toLocaleString('es-CO', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 3,
              })}{' '}
              kg
            </span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Registrando…' : 'Registrar ingreso'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

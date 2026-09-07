import { useState } from 'react';
import {
  Calculator,
  Check,
  ClipboardList,
  Eraser,
  Pencil,
  Printer,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { cn } from '@/lib/utils';

const fieldClass = 'h-11 rounded-none border-slate-300 bg-white text-base';
const corrales = Array.from({ length: 26 }, (_, index) =>
  `Corral ${String(index + 1).padStart(2, '0')}`,
);

export function PesoEnPiePage() {
  const [fecha, setFecha] = useState('2026-09-07');
  const [guia, setGuia] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [cliente, setCliente] = useState('');
  const [tipoAnimal, setTipoAnimal] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [lote, setLote] = useState('0');
  const [animal, setAnimal] = useState('');
  const [peso, setPeso] = useState('0.0');
  const [tab, setTab] = useState('total');
  const [guiasAbiertas, setGuiasAbiertas] = useState(10);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const tabs: TabItem[] = [
    { value: 'total', label: `Total: 00 (${peso} kg)` },
    { value: 'observaciones', label: 'Observaciones' },
    { value: 'guias', label: `Guías Abiertas: ${guiasAbiertas}` },
  ];

  function limpiar() {
    setGuia('');
    setProveedor('');
    setCliente('');
    setTipoAnimal('');
    setUbicacion('');
    setLote('0');
    setAnimal('');
    setPeso('0.0');
    setMensaje(null);
  }

  function guardar() {
    setMensaje('Registro listo para guardar cuando se conecte la báscula.');
    setGuiasAbiertas((value) => value + 1);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white text-slate-900">
      <div className="border border-slate-200 bg-slate-50 p-2 sm:p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex size-16 shrink-0 items-center justify-center border border-slate-400 bg-white text-slate-800">
            <PesoEnPieIcon className="size-12" />
          </div>
          <div className="w-40 space-y-1">
            <Label htmlFor="peso-pie-fecha">Fecha:</Label>
            <Input id="peso-pie-fecha" type="date" className={fieldClass} value={fecha} onChange={(event) => setFecha(event.target.value)} />
          </div>
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor="peso-pie-guia">Guía de Movilización:</Label>
            <Input id="peso-pie-guia" className={fieldClass} value={guia} onChange={(event) => setGuia(event.target.value)} />
          </div>
          <ActionButton label="Confirmar registro" onClick={guardar}><Check className="size-10" /></ActionButton>
          <ActionButton label="Limpiar formulario" onClick={limpiar}><Eraser className="size-9" /></ActionButton>
          <div className="ml-auto flex items-center gap-2">
            <ActionButton label="Calculadora"><Calculator className="size-9" /></ActionButton>
            <ActionButton label="Lista de guías"><ClipboardList className="size-9" /></ActionButton>
          </div>
        </div>

        <div className="mt-2 grid gap-2">
          <Field label="Proveedor:" value={proveedor} onChange={setProveedor} />
          <Field label="Cliente:" value={cliente} onChange={setCliente} />
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <SelectField label="Tipo de Animal:" value={tipoAnimal} onChange={setTipoAnimal} options={['Bovino', 'Porcino', 'Otro']} />
          <SelectField label="Ubicación (Corral):" value={ubicacion} onChange={setUbicacion} options={corrales} />
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
          <LargeField label="Lote:" value={lote} onChange={setLote} />
          <LargeField label="Animal No.:" value={animal} onChange={setAnimal} />
          <LargeField label="Peso (kg):" value={peso} onChange={setPeso} inputMode="decimal" valueClass="text-4xl font-bold text-emerald-600" />
          <div className="flex items-end gap-2 pb-0.5">
            <ActionButton label="Leer báscula"><Scale className="size-9" /></ActionButton>
            <ActionButton label="Editar peso"><Pencil className="size-9" /></ActionButton>
            <ActionButton label="Imprimir recibo"><Printer className="size-9" /></ActionButton>
          </div>
        </div>

        <div className="mt-2 overflow-hidden border border-slate-200 bg-white">
          <Tabs tabs={tabs} value={tab} onChange={setTab} className="bg-slate-50" />
          <div className="min-h-[260px] p-3 sm:min-h-[340px]">
            {tab === 'observaciones' && (
              <textarea className="min-h-40 w-full resize-y border border-slate-300 p-3 text-sm outline-none focus:border-slate-500" placeholder="Observaciones del pesaje..." />
            )}
            {tab === 'guias' && (
              <div className="grid gap-2 sm:grid-cols-3">
                {Array.from({ length: guiasAbiertas }, (_, index) => (
                  <button key={index} type="button" className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100">Guía abierta {String(index + 1).padStart(2, '0')}</button>
                ))}
              </div>
            )}
            {tab === 'total' && mensaje && <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{mensaje}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return <Button type="button" variant="outline" size="icon" className="size-14 rounded-lg border-2 border-slate-700 bg-white text-slate-800 shadow-none hover:bg-slate-100" title={label} aria-label={label} onClick={onClick}>{children}</Button>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block border border-slate-200 bg-white px-2 pb-2 pt-0.5"><span className="relative -top-3 bg-white px-1 text-base font-medium">{label}</span><Input className={cn(fieldClass, '-mt-1')} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block border border-slate-200 bg-white px-2 pb-2 pt-0.5"><span className="relative -top-3 bg-white px-1 text-base font-medium">{label}</span><select className={cn(fieldClass, '-mt-1 w-full px-3')} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Seleccionar...</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function LargeField({ label, value, onChange, inputMode, valueClass }: { label: string; value: string; onChange: (value: string) => void; inputMode?: 'decimal'; valueClass?: string }) {
  return <label className="block border border-slate-200 bg-white px-2 pb-2 pt-0.5"><span className="relative -top-3 bg-white px-1 text-base font-medium">{label}</span><Input className={cn(fieldClass, '-mt-1 h-16 text-center text-3xl tabular-nums', valueClass)} value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} /></label>;
}

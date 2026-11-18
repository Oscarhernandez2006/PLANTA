import { useEffect, useMemo, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';
import { formatOB } from '../registrar/orden-beneficio-api';
import { codigoBarras, tituloCanalTipo, type PresintoTicketData } from './canal-presinto-print';

function Qr({ valor }: { valor: string }) {
  const modulos = useMemo(() => {
    try {
      return QRCode.create(valor, { errorCorrectionLevel: 'M' }).modules;
    } catch {
      return null;
    }
  }, [valor]);
  if (!modulos) return null;
  const celdas = [];
  for (let r = 0; r < modulos.size; r++)
    for (let c = 0; c < modulos.size; c++)
      if (modulos.get(r, c)) celdas.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} />);
  return (
    <svg viewBox={`0 0 ${modulos.size} ${modulos.size}`} className="size-16 shrink-0" shapeRendering="crispEdges">
      {celdas}
    </svg>
  );
}

function Barras({ valor }: { valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, valor, {
        format: 'CODE128B',
        width: 2,
        height: 50,
        fontSize: 14,
        margin: 0,
        background: 'transparent',
      });
    } catch {
      ref.current.innerHTML = '';
    }
  }, [valor]);
  return <svg ref={ref} className="h-16 w-auto shrink-0" />;
}

function Campo({ label, valor, grande }: { label: string; valor: string; grande?: boolean }) {
  return (
    <div className={cn('flex gap-1 whitespace-nowrap leading-tight', grande ? 'text-[13px]' : 'text-[11px]')}>
      <span className="font-bold">{label}:</span>
      <span className="max-w-[11rem] truncate">{valor || '-'}</span>
    </div>
  );
}

function Recuadro({ valor, label }: { valor: string; label: string }) {
  return (
    <div className="flex size-[4.5rem] shrink-0 flex-col items-center justify-center rounded-[2px] border-[3px] border-black">
      <span className="text-2xl font-bold leading-none tabular-nums">{valor}</span>
      <span className="mt-1 text-[9px] font-bold">{label}</span>
    </div>
  );
}

/** Vista en pantalla del presinto de canal, con la misma distribución que el ZPL. */
export function PresintoPreview({ datos, className }: { datos: PresintoTicketData; className?: string }) {
  const codigo = codigoBarras(datos);
  const palabras = tituloCanalTipo(datos).split(' ');
  const mitad = Math.ceil(palabras.length / 2);
  return (
    <div
      className={cn(
        'flex w-max items-center gap-4 rounded-md border border-zinc-300 bg-white px-4 py-2 font-sans text-black shadow-sm',
        className,
      )}
    >
      <Qr valor={codigo} />
      <Barras valor={codigo} />
      <div className="flex flex-col gap-0.5">
        <Campo label="Fecha de Sacrificio" valor={datos.fechaSacrificio} />
        <Campo label="Lote" valor={formatOB(datos.lote)} />
        <Campo label="Guia" valor={datos.guia} />
        <Campo label="Expendio" valor={datos.expendio} />
        <Campo label="Cliente" valor={datos.cliente} />
      </div>
      <div className="flex flex-col gap-1">
        <Campo label="Tipo" valor={datos.tipoAnimal} grande />
        <Campo label="Ref" valor={String(datos.ref)} grande />
        <Campo label="Gancho" valor={String(datos.turno)} grande />
      </div>
      <Recuadro valor={datos.pesoKg.toFixed(0)} label="PESO (kg)" />
      <Recuadro valor={String(datos.turno)} label="TURNO" />
      <div className="whitespace-nowrap text-xl font-black leading-tight">
        <div>{palabras.slice(mitad).join(' ')}</div>
        <div>{palabras.slice(0, mitad).join(' ')}</div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import logoUrl from '@/assets/logo-santacruz.png';
import {
  elementosEtiquetaDesposte,
  TAMANO_ETIQUETA,
  type EtiquetaDesposteDatos,
} from './etiqueta-desposte-zpl';

// Ancho real de la fuente 0 de Zebra frente a Arial a igual altura (aprox.).
const AJUSTE_ANCHO = 0.75;
// La Zebra imprime el QR (^BQ) más abajo de su ^FO; se compensa solo en la vista.
const DESFASE_QR_Y = 20;

function Barras({ x, y, alto, modulo, valor }: { x: number; y: number; alto: number; modulo: number; valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, valor, {
        // Igual que la Zebra con ^BCN: subconjunto B.
        format: 'CODE128B',
        width: modulo,
        height: alto,
        displayValue: false,
        margin: 0,
        background: 'transparent',
      });
    } catch {
      ref.current.innerHTML = '';
    }
  }, [valor, alto, modulo]);
  return (
    <g transform={`translate(${x},${y})`}>
      <svg ref={ref} />
    </g>
  );
}

function Qr({ x, y, aumento, valor }: { x: number; y: number; aumento: number; valor: string }) {
  const modulos = useMemo(() => {
    try {
      return QRCode.create(valor, { errorCorrectionLevel: 'L' }).modules;
    } catch {
      return null;
    }
  }, [valor]);
  if (!modulos) return null;
  const celdas = [];
  for (let r = 0; r < modulos.size; r++) {
    for (let c = 0; c < modulos.size; c++) {
      if (modulos.get(r, c)) {
        celdas.push(
          <rect key={`${r}-${c}`} x={x + c * aumento} y={y + r * aumento} width={aumento} height={aumento} />,
        );
      }
    }
  }
  return <g fill="#000">{celdas}</g>;
}

/** Vista en pantalla de la etiqueta de desposte, dibujada con las mismas piezas que el ZPL. */
export function EtiquetaDespostePreview({ datos, className }: { datos: EtiquetaDesposteDatos; className?: string }) {
  const elementos = elementosEtiquetaDesposte(datos);
  return (
    <svg
      viewBox={`0 0 ${TAMANO_ETIQUETA} ${TAMANO_ETIQUETA}`}
      className={className}
      role="img"
      aria-label="Vista de la etiqueta"
    >
      <rect width={TAMANO_ETIQUETA} height={TAMANO_ETIQUETA} rx={10} fill="#fff" stroke="#d4d4d8" strokeWidth={2} />
      {elementos.map((e, i) => {
        switch (e.t) {
          case 'logo':
            return (
              <image
                key={i}
                href={logoUrl}
                x={12}
                y={5}
                width={72}
                height={44}
                preserveAspectRatio="xMinYMin meet"
                style={{ filter: 'grayscale(1) contrast(3)' }}
              />
            );
          case 'texto':
            return (
              <text
                key={i}
                transform={`translate(${e.centradoEn ? e.x + e.centradoEn / 2 : e.x},${e.y + e.alto * 0.8}) scale(${(e.ancho / e.alto) * AJUSTE_ANCHO},1)`}
                textAnchor={e.centradoEn ? 'middle' : 'start'}
                fontFamily="Arial, Helvetica, sans-serif"
                fontWeight={700}
                fontSize={e.alto}
                style={{ whiteSpace: 'pre' }}
              >
                {e.valor}
              </text>
            );
          case 'caja': {
            // ZPL: si el ancho o el alto no supera el grosor, es una línea rellena.
            if (e.ancho <= e.grosor || e.alto <= e.grosor) {
              return <rect key={i} x={e.x} y={e.y} width={e.ancho} height={e.alto} fill="#000" />;
            }
            return (
              <rect
                key={i}
                x={e.x + e.grosor / 2}
                y={e.y + e.grosor / 2}
                width={e.ancho - e.grosor}
                height={e.alto - e.grosor}
                fill="none"
                stroke="#000"
                strokeWidth={e.grosor}
              />
            );
          }
          case 'qr':
            return <Qr key={i} {...e} y={e.y + DESFASE_QR_Y} />;
          case 'barras':
            return <Barras key={i} {...e} />;
        }
      })}
    </svg>
  );
}

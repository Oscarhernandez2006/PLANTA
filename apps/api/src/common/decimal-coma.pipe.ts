import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

// Solo valores que son un número con coma decimal ("12,5", "-0,75"); los textos no se tocan.
const DECIMAL_COMA = /^\s*[-+]?\d+,\d+\s*$/;

function normalizar(valor: unknown): unknown {
  if (typeof valor === 'string') {
    return DECIMAL_COMA.test(valor) ? valor.trim().replace(',', '.') : valor;
  }
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, normalizar(v)]),
    );
  }
  return valor;
}

/** Acepta decimales con coma en body/query y los convierte a punto antes de validar. */
@Injectable()
export class DecimalComaPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    return metadata.type === 'body' || metadata.type === 'query' ? normalizar(value) : value;
  }
}

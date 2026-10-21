import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';

// Todo texto libre se guarda en MAYÚSCULA. Solo se tocan propiedades @IsString
// del DTO que no sean valores controlados (enum, lista, UUID, fecha, patrón,
// correo) ni campos donde el caso importa.
const VALIDADORES_EXCLUIDOS = new Set([
  'isEnum',
  'isIn',
  'isUuid',
  'isDateString',
  'isIso8601',
  'matches',
  'isEmail',
  'isUrl',
  'isMacAddress',
]);

const CAMPOS_EXCLUIDOS = new Set([
  'pin',
  'password',
  'documentId',
  'correo',
  'email',
  'macs',
  'mac',
  'macAddress',
  'hostname',
  'modulos',
  'search',
  'codigo',
  'barcode',
  'itemCode',
]);

const cache = new Map<Function, string[]>();

/** Propiedades de texto libre de una clase DTO (memorizado por clase). */
function camposTexto(clase: Function): string[] {
  const enCache = cache.get(clase);
  if (enCache) return enCache;

  const porCampo = new Map<string, Set<string>>();
  for (const m of getMetadataStorage().getTargetValidationMetadatas(clase, '', true, false)) {
    const nombre = (m as { name?: string }).name ?? m.type;
    const set = porCampo.get(m.propertyName) ?? new Set<string>();
    set.add(nombre);
    porCampo.set(m.propertyName, set);
  }

  const campos = [...porCampo.entries()]
    .filter(
      ([campo, validadores]) =>
        validadores.has('isString') &&
        !CAMPOS_EXCLUIDOS.has(campo) &&
        !campo.endsWith('Id') &&
        ![...validadores].some((v) => VALIDADORES_EXCLUIDOS.has(v)),
    )
    .map(([campo]) => campo);
  cache.set(clase, campos);
  return campos;
}

const mayus = (v: string) => v.toLocaleUpperCase('es-CO');

function convertir(obj: unknown): void {
  if (Array.isArray(obj)) {
    obj.forEach(convertir);
    return;
  }
  if (!obj || typeof obj !== 'object') return;
  const clase = (obj as object).constructor;
  if (!clase || clase === Object) return;

  const registro = obj as Record<string, unknown>;
  for (const campo of camposTexto(clase)) {
    const v = registro[campo];
    if (typeof v === 'string') registro[campo] = mayus(v);
    else if (Array.isArray(v)) registro[campo] = v.map((x) => (typeof x === 'string' ? mayus(x) : x));
  }
  // DTOs anidados (@ValidateNested).
  for (const v of Object.values(registro)) {
    if (v && typeof v === 'object') convertir(v);
  }
}

/** Debe ir después del ValidationPipe (necesita la instancia del DTO). */
@Injectable()
export class MayusculasPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === 'body') convertir(value);
    return value;
  }
}

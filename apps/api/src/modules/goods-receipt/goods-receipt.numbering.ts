import { BadRequestException } from '@nestjs/common';
import { QuarterType, UnitForm } from '@prisma/client';

/** Formatea el consecutivo de ingreso legible: ING-2026-000123. */
export function buildReceiptNumber(year: number, seq: number): string {
  return `ING-${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Regla de negocio (capa 2): quarter_type es obligatorio cuando la unidad es
 * un cuarto, y debe ser nulo en cualquier otra forma. La base de datos lo
 * refuerza con un CHECK constraint (capa 3).
 */
export function normalizeQuarterType(
  unitForm: UnitForm,
  quarterType?: QuarterType | null,
): QuarterType | null {
  if (unitForm === UnitForm.cuarto) {
    if (!quarterType) {
      throw new BadRequestException(
        'quarterType es obligatorio cuando unitForm = cuarto.',
      );
    }
    return quarterType;
  }
  return null;
}

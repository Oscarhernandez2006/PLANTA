import { BadRequestException } from '@nestjs/common';
import { QuarterType, UnitForm } from '@prisma/client';
import {
  buildReceiptNumber,
  normalizeQuarterType,
} from './goods-receipt.numbering';

describe('goods-receipt.numbering', () => {
  describe('buildReceiptNumber', () => {
    it('formatea el consecutivo con padding a 6 dígitos', () => {
      expect(buildReceiptNumber(2026, 1)).toBe('ING-2026-000001');
      expect(buildReceiptNumber(2026, 123)).toBe('ING-2026-000123');
    });

    it('no trunca consecutivos de más de 6 dígitos', () => {
      expect(buildReceiptNumber(2026, 1234567)).toBe('ING-2026-1234567');
    });
  });

  describe('normalizeQuarterType', () => {
    it('exige quarterType cuando la unidad es cuarto', () => {
      expect(() => normalizeQuarterType(UnitForm.cuarto)).toThrow(
        BadRequestException,
      );
    });

    it('acepta quarterType cuando la unidad es cuarto', () => {
      expect(
        normalizeQuarterType(UnitForm.cuarto, QuarterType.delantero),
      ).toBe(QuarterType.delantero);
    });

    it('fuerza null cuando la unidad no es cuarto (aunque llegue un valor)', () => {
      expect(
        normalizeQuarterType(UnitForm.media_canal, QuarterType.trasero),
      ).toBeNull();
      expect(normalizeQuarterType(UnitForm.canal_completa)).toBeNull();
    });
  });
});

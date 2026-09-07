import {
  GoodsReceiptStatus,
  QuarterType,
  UnitForm,
} from '@frigorifico/shared';

export const statusLabels: Record<GoodsReceiptStatus, string> = {
  [GoodsReceiptStatus.BORRADOR]: 'Borrador',
  [GoodsReceiptStatus.CONFIRMADO]: 'Confirmado',
  [GoodsReceiptStatus.EN_DESPOSTE]: 'En desposte',
  [GoodsReceiptStatus.CERRADO]: 'Cerrado',
  [GoodsReceiptStatus.ANULADO]: 'Anulado',
};

export const statusTone: Record<
  GoodsReceiptStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  [GoodsReceiptStatus.BORRADOR]: 'neutral',
  [GoodsReceiptStatus.CONFIRMADO]: 'success',
  [GoodsReceiptStatus.EN_DESPOSTE]: 'info',
  [GoodsReceiptStatus.CERRADO]: 'neutral',
  [GoodsReceiptStatus.ANULADO]: 'danger',
};

export const unitFormLabels: Record<UnitForm, string> = {
  [UnitForm.CANAL_COMPLETA]: 'Canal completa',
  [UnitForm.MEDIA_CANAL]: 'Media canal',
  [UnitForm.CUARTO]: 'Cuarto',
};

export const quarterTypeLabels: Record<QuarterType, string> = {
  [QuarterType.DELANTERO]: 'Delantero',
  [QuarterType.TRASERO]: 'Trasero',
};

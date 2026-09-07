import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { GoodsReceiptStatus, QuarterType, UnitForm } from '@frigorifico/shared';
import { api } from '@/lib/api';

export interface Supplier {
  id: string;
  name: string;
  icaFarmCode?: string | null;
}

export interface GoodsReceiptItem {
  id: string;
  itemCode: string;
  unitForm: UnitForm;
  quarterType: QuarterType | null;
  weightKg: string;
  status: string;
}

export interface GoodsReceiptListItem {
  id: string;
  receiptNumber: string;
  status: GoodsReceiptStatus;
  receivedAt: string;
  receivedDate: string;
  originIcaCode?: string | null;
  supplier: { id: string; name: string };
  _count: { items: number };
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateGoodsReceiptInput {
  supplierId: string;
  receivedDate: string;
  originIcaCode?: string;
  items: {
    itemCode: string;
    unitForm: UnitForm;
    quarterType?: QuarterType;
    weightKg: number;
  }[];
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<Supplier[]>('/suppliers')).data,
  });
}

export function useGoodsReceipts(params: {
  page: number;
  pageSize: number;
  status?: GoodsReceiptStatus;
}) {
  return useQuery({
    queryKey: ['goods-receipts', params],
    queryFn: async () =>
      (
        await api.get<Paginated<GoodsReceiptListItem>>('/goods-receipts', {
          params,
        })
      ).data,
  });
}

export function useCreateGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateGoodsReceiptInput) =>
      (await api.post('/goods-receipts', input)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['goods-receipts'] });
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Product {
  id: string;
  codigo: string;
  nombre: string;
}

export function useProducts(search: string) {
  return useQuery({
    queryKey: ['products', search],
    queryFn: async () =>
      (
        await api.get<Product[]>('/products', {
          params: search ? { search } : undefined,
        })
      ).data,
  });
}

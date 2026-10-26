import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from './client'
import { invalidateSales } from './salesHooks'
import type { CreditBookFilter, CreditBookSummary, CreditLedger, CreditPaymentInput, CreditSaleInput, Receipt } from './types'

// Buku hutang kedai (555). Kunci 'credit-book' & 'credit-ledger' juga dimuat semula oleh invalidateSales.

export const useCreditBook = (f: CreditBookFilter) =>
  useQuery({
    queryKey: ['credit-book', f],
    queryFn: () => http.get<CreditBookSummary>('/credit-book', { ...f }),
    placeholderData: (p) => p,
  })

export const useCreditLedger = (customerId: number | undefined, businessUnitId: number | undefined) =>
  useQuery({
    queryKey: ['credit-ledger', customerId, businessUnitId],
    queryFn: () => http.get<CreditLedger>(`/credit-book/${customerId}/${businessUnitId}`),
    enabled: !!customerId && !!businessUnitId,
  })

export function useCreditBookMutations() {
  const qc = useQueryClient()
  return {
    // Rekod hutang belum dikira jualan, tetapi kad Ringkasan papar jumlah buku hutang → muat semula
    addEntry: useMutation({
      mutationFn: (input: CreditSaleInput) => http.post<CreditLedger>('/credit-book/entries', input),
      onSuccess: () => invalidateSales(qc, true),
    }),
    voidEntry: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/credit-book/entries/${id}/void`, { reason }),
      onSuccess: () => invalidateSales(qc, true),
    }),
    // Bayaran = resit + Duit Masuk → muat semula data kewangan juga
    pay: useMutation({
      mutationFn: (input: CreditPaymentInput) => http.post<Receipt>('/credit-book/payments', input),
      onSuccess: () => invalidateSales(qc, true),
    }),
  }
}

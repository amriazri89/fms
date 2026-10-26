import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { http } from './client'
import type {
  Paged,
  Payable,
  PayableFilter,
  PayableInput,
  PayableListItem,
  PayablePaymentInput,
  PaymentVoucher,
  Supplier,
  SupplierDetail,
  SupplierInput,
  SupplierListItem,
} from './types'

const payableKeys = ['suppliers', 'supplier', 'payables', 'payable', 'voucher']
// Bayaran hutang menjana rekod duit keluar, jadi data kewangan juga perlu dimuat semula
const moneyKeys = ['transactions', 'transaction', 'dashboard', 'report', 'balances']

export function invalidatePayables(qc: QueryClient, includeMoney = false) {
  ;[...payableKeys, ...(includeMoney ? moneyKeys : [])].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

// ---------- Pembekal ----------
export const useSuppliers = (q = '', includeInactive = false) =>
  useQuery({
    queryKey: ['suppliers', q, includeInactive],
    queryFn: () => http.get<SupplierListItem[]>('/suppliers', { q, includeInactive }),
    placeholderData: (p) => p,
  })

export const useSupplier = (id: number | undefined) =>
  useQuery({ queryKey: ['supplier', id], queryFn: () => http.get<SupplierDetail>(`/suppliers/${id}`), enabled: !!id })

export function useSupplierMutations() {
  const qc = useQueryClient()
  const done = () => invalidatePayables(qc)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: SupplierInput }) =>
        id ? http.put<Supplier>(`/suppliers/${id}`, input) : http.post<Supplier>('/suppliers', input),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/suppliers/${id}`), onSuccess: done }),
  }
}

// ---------- Hutang ----------
export const usePayables = (f: PayableFilter) =>
  useQuery({
    queryKey: ['payables', f],
    queryFn: () => http.get<Paged<PayableListItem>>('/payables', { ...f }),
    placeholderData: (p) => p,
  })

export const usePayable = (id: number | undefined) =>
  useQuery({ queryKey: ['payable', id], queryFn: () => http.get<Payable>(`/payables/${id}`), enabled: !!id })

export const useVoucher = (paymentId: number | undefined) =>
  useQuery({ queryKey: ['voucher', paymentId], queryFn: () => http.get<PaymentVoucher>(`/payables/payments/${paymentId}`), enabled: !!paymentId })

export function usePayableMutations() {
  const qc = useQueryClient()
  const done = () => invalidatePayables(qc, true)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: PayableInput }) =>
        id ? http.put<Payable>(`/payables/${id}`, input) : http.post<Payable>('/payables', input),
      onSuccess: done,
    }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/payables/${id}/cancel`, { reason }),
      onSuccess: done,
    }),
    pay: useMutation({
      mutationFn: ({ id, input }: { id: number; input: PayablePaymentInput }) => http.post<PaymentVoucher>(`/payables/${id}/payments`, input),
      onSuccess: done,
    }),
    voidPayment: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/payables/payments/${id}/void`, { reason }),
      onSuccess: done,
    }),
  }
}

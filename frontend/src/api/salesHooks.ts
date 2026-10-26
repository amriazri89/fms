import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { http } from './client'
import type {
  Customer,
  CustomerActivity,
  CustomerActivityInput,
  CustomerDetail,
  CustomerInput,
  CustomerListItem,
  DocumentSettings,
  Invoice,
  InvoiceInput,
  InvoiceListItem,
  Paged,
  PaymentInput,
  PaymentListItem,
  Quotation,
  QuotationInput,
  QuotationListItem,
  QuotationStatus,
  Receipt,
  SalesFilter,
} from './types'

const salesKeys = ['customers', 'customer', 'follow-ups', 'quotations', 'quotation', 'invoices', 'invoice', 'receipts', 'receipt']
// Resit menjana rekod Duit Masuk, jadi data kewangan juga perlu dimuat semula
const moneyKeys = ['transactions', 'transaction', 'dashboard', 'report', 'balances']

export function invalidateSales(qc: QueryClient, includeMoney = false) {
  ;[...salesKeys, ...(includeMoney ? moneyKeys : [])].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

export const useDocumentSettings = () =>
  useQuery({ queryKey: ['document-settings'], queryFn: () => http.get<DocumentSettings>('/document-settings'), staleTime: Infinity })

// ---------- Pelanggan ----------
export const useCustomers = (q = '', includeInactive = false) =>
  useQuery({
    queryKey: ['customers', q, includeInactive],
    queryFn: () => http.get<CustomerListItem[]>('/customers', { q, includeInactive }),
    placeholderData: (p) => p,
  })

export const useCustomer = (id: number | undefined) =>
  useQuery({ queryKey: ['customer', id], queryFn: () => http.get<CustomerDetail>(`/customers/${id}`), enabled: !!id })

export const useFollowUps = () =>
  useQuery({ queryKey: ['follow-ups'], queryFn: () => http.get<CustomerActivity[]>('/customers/follow-ups') })

export function useCustomerMutations() {
  const qc = useQueryClient()
  const done = () => invalidateSales(qc)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: CustomerInput }) =>
        id ? http.put<Customer>(`/customers/${id}`, input) : http.post<Customer>('/customers', input),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/customers/${id}`), onSuccess: done }),
    addActivity: useMutation({
      mutationFn: ({ customerId, input }: { customerId: number; input: CustomerActivityInput }) =>
        http.post<CustomerActivity>(`/customers/${customerId}/activities`, input),
      onSuccess: done,
    }),
    setDone: useMutation({
      mutationFn: ({ id, done: isDone }: { id: number; done: boolean }) => http.post(`/customers/activities/${id}/done?done=${isDone}`),
      onSuccess: done,
    }),
    removeActivity: useMutation({ mutationFn: (id: number) => http.del(`/customers/activities/${id}`), onSuccess: done }),
  }
}

// ---------- Sebut harga ----------
export const useQuotations = (f: SalesFilter) =>
  useQuery({
    queryKey: ['quotations', f],
    queryFn: () => http.get<Paged<QuotationListItem>>('/quotations', { ...f }),
    placeholderData: (p) => p,
  })

export const useQuotation = (id: number | undefined) =>
  useQuery({ queryKey: ['quotation', id], queryFn: () => http.get<Quotation>(`/quotations/${id}`), enabled: !!id })

export function useQuotationMutations() {
  const qc = useQueryClient()
  const done = () => invalidateSales(qc)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: QuotationInput }) =>
        id ? http.put<Quotation>(`/quotations/${id}`, input) : http.post<Quotation>('/quotations', input),
      onSuccess: done,
    }),
    setStatus: useMutation({
      mutationFn: ({ id, status }: { id: number; status: QuotationStatus }) => http.post<Quotation>(`/quotations/${id}/status`, { status }),
      onSuccess: done,
    }),
    convert: useMutation({ mutationFn: (id: number) => http.post<Invoice>(`/quotations/${id}/convert`), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/quotations/${id}`), onSuccess: done }),
  }
}

// ---------- Invois ----------
export const useInvoices = (f: SalesFilter) =>
  useQuery({
    queryKey: ['invoices', f],
    queryFn: () => http.get<Paged<InvoiceListItem>>('/invoices', { ...f }),
    placeholderData: (p) => p,
  })

export const useInvoice = (id: number | undefined) =>
  useQuery({ queryKey: ['invoice', id], queryFn: () => http.get<Invoice>(`/invoices/${id}`), enabled: !!id })

export function useInvoiceMutations() {
  const qc = useQueryClient()
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: InvoiceInput }) =>
        id ? http.put<Invoice>(`/invoices/${id}`, input) : http.post<Invoice>('/invoices', input),
      onSuccess: () => invalidateSales(qc, true),
    }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/invoices/${id}/cancel`, { reason }),
      onSuccess: () => invalidateSales(qc),
    }),
  }
}

// ---------- Resit ----------
export const useReceipts = (f: SalesFilter) =>
  useQuery({
    queryKey: ['receipts', f],
    queryFn: () => http.get<Paged<PaymentListItem>>('/receipts', { ...f }),
    placeholderData: (p) => p,
  })

export const useReceipt = (id: number | undefined) =>
  useQuery({ queryKey: ['receipt', id], queryFn: () => http.get<Receipt>(`/receipts/${id}`), enabled: !!id })

export function useReceiptMutations() {
  const qc = useQueryClient()
  const done = () => invalidateSales(qc, true)
  return {
    create: useMutation({ mutationFn: (input: PaymentInput) => http.post<Receipt>('/receipts', input), onSuccess: done }),
    void: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/receipts/${id}/void`, { reason }),
      onSuccess: done,
    }),
  }
}

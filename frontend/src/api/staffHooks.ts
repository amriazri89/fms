import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { http, upload } from './client'
import type {
  Claim, ClaimInput, Employee, EmployeeInput, ListResult, PaymentMethod, ProfitLossStatement, SalesReport, StaffSummary,
  UtilityBill, UtilityInput, UtilityPayInput, Wage, WageInput,
} from './types'

type Q = Record<string, string | number | boolean | undefined | null>

const staffKeys = ['employees', 'wages', 'wage', 'utilities', 'claims', 'staff-summary', 'statement']
// Bayaran gaji / bil / tuntutan menjana Duit Keluar, jadi data kewangan juga dimuat semula
const moneyKeys = ['transactions', 'transaction', 'dashboard', 'report', 'balances']

export function invalidateStaff(qc: QueryClient) {
  ;[...staffKeys, ...moneyKeys].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

const useList = <T,>(key: string, path: string, q: Q = {}, enabled = true) =>
  useQuery({ queryKey: [key, q], queryFn: () => http.get<T>(path, q), placeholderData: (p) => p, enabled })

// ---------- Pekerja ----------
export const useEmployees = (includeInactive = false) => useList<Employee[]>('employees', '/employees', { includeInactive })

export function useEmployeeMutations() {
  const qc = useQueryClient()
  const done = () => invalidateStaff(qc)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: EmployeeInput }) =>
        id ? http.put<Employee>(`/employees/${id}`, input) : http.post<Employee>('/employees', input),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/employees/${id}`), onSuccess: done }),
  }
}

// ---------- Gaji ----------
export const useWages = (q: Q) => useList<ListResult<Wage>>('wages', '/wages', q)
export const useWage = (id: number | undefined) =>
  useQuery({ queryKey: ['wage', id], queryFn: () => http.get<Wage>(`/wages/${id}`), enabled: !!id })

export function useWageMutations() {
  const qc = useQueryClient()
  const done = () => invalidateStaff(qc)
  return {
    pay: useMutation({ mutationFn: (input: WageInput) => http.post<Wage>('/wages', input), onSuccess: done }),
    void: useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/wages/${id}/void`, { reason }), onSuccess: done }),
  }
}

// ---------- Bil utiliti ----------
export const useUtilities = (q: Q) => useList<ListResult<UtilityBill>>('utilities', '/utilities', q)

export function useUtilityMutations() {
  const qc = useQueryClient()
  const done = () => invalidateStaff(qc)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: UtilityInput }) =>
        id ? http.put<UtilityBill>(`/utilities/${id}`, input) : http.post<UtilityBill>('/utilities', input),
      onSuccess: done,
    }),
    pay: useMutation({ mutationFn: ({ id, input }: { id: number; input: UtilityPayInput }) => http.post<UtilityBill>(`/utilities/${id}/pay`, input), onSuccess: done }),
    unpay: useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/utilities/${id}/unpay`, { reason }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/utilities/${id}`), onSuccess: done }),
  }
}

// ---------- Tuntutan ----------
export const useClaims = (q: Q) => useList<ListResult<Claim>>('claims', '/claims', q)

export function useClaimMutations() {
  const qc = useQueryClient()
  const done = () => invalidateStaff(qc)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: ClaimInput }) => (id ? http.put<Claim>(`/claims/${id}`, input) : http.post<Claim>('/claims', input)),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/claims/${id}`), onSuccess: done }),
    uploadReceipt: useMutation({ mutationFn: ({ id, file }: { id: number; file: File }) => upload<Claim>(`/claims/${id}/receipt`, file), onSuccess: done }),
    review: useMutation({
      mutationFn: ({ id, approve, remark }: { id: number; approve: boolean; remark: string | null }) => http.post<Claim>(`/claims/${id}/review`, { approve, remark }),
      onSuccess: done,
    }),
    pay: useMutation({
      mutationFn: ({ id, paidDate, accountId, method }: { id: number; paidDate: string; accountId: number; method: PaymentMethod }) =>
        http.post<Claim>(`/claims/${id}/pay`, { paidDate, accountId, method }),
      onSuccess: done,
    }),
    unpay: useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/claims/${id}/unpay`, { reason }), onSuccess: done }),
  }
}

// ---------- Penyata & laporan ----------
export const useProfitLossStatement = (from: string, to: string, businessUnitId?: number) =>
  useQuery({
    queryKey: ['statement', 'pnl', from, to, businessUnitId],
    queryFn: () => http.get<ProfitLossStatement>('/statements/profit-loss', { from, to, businessUnitId }),
    placeholderData: (p) => p,
  })

export const useSalesReport = (from: string, to: string, groupBy: string, businessUnitId?: number) =>
  useQuery({
    queryKey: ['statement', 'sales', from, to, groupBy, businessUnitId],
    queryFn: () => http.get<SalesReport>('/statements/sales', { from, to, groupBy, businessUnitId }),
    placeholderData: (p) => p,
  })

export const useStaffSummary = () => useQuery({ queryKey: ['staff-summary'], queryFn: () => http.get<StaffSummary>('/statements/staff-summary') })

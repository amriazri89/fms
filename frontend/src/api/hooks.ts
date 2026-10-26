import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from './client'
import type {
  Account,
  AccountBalance,
  AuditLog,
  BusinessUnit,
  CashflowReport,
  Category,
  CategoryReport,
  CategoryType,
  Dashboard,
  FamilyMember,
  MonthlyReport,
  PagedTransactions,
  ProfitReport,
  Transaction,
  TransactionFilter,
  TransactionInput,
  User,
  UserRole,
} from './types'

// Kunci cache ditakrif di satu tempat
export const keys = {
  businessUnits: (all = false) => ['business-units', all] as const,
  accounts: (all = false) => ['accounts', all] as const,
  categories: (all = false) => ['categories', all] as const,
  familyMembers: (all = false) => ['family-members', all] as const,
  users: ['users'] as const,
  transactions: (f: TransactionFilter) => ['transactions', f] as const,
  transaction: (id: number) => ['transaction', id] as const,
  dashboard: (f: object) => ['dashboard', f] as const,
  report: (name: string, f: object) => ['report', name, f] as const,
  balances: ['balances'] as const,
  audit: ['audit'] as const,
}

// ---------- Master data ----------
export const useBusinessUnits = (includeInactive = false) =>
  useQuery({ queryKey: keys.businessUnits(includeInactive), queryFn: () => http.get<BusinessUnit[]>('/business-units', { includeInactive }), staleTime: 5 * 60_000 })

export const useAccounts = (includeInactive = false) =>
  useQuery({ queryKey: keys.accounts(includeInactive), queryFn: () => http.get<Account[]>('/accounts', { includeInactive }), staleTime: 5 * 60_000 })

export const useCategories = (includeInactive = false) =>
  useQuery({ queryKey: keys.categories(includeInactive), queryFn: () => http.get<Category[]>('/categories', { includeInactive }), staleTime: 5 * 60_000 })

export const useFamilyMembers = (includeInactive = false) =>
  useQuery({ queryKey: keys.familyMembers(includeInactive), queryFn: () => http.get<FamilyMember[]>('/family-members', { includeInactive }), staleTime: 5 * 60_000 })

/** Simpan / padam untuk mana-mana senarai master data. */
export function useMasterMutation<TInput>(resource: string, cacheKey: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [cacheKey] })
  const save = useMutation({
    mutationFn: ({ id, input }: { id?: number; input: TInput }) =>
      id ? http.put(`/${resource}/${id}`, input) : http.post(`/${resource}`, input),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: number) => http.del(`/${resource}/${id}`), onSuccess: invalidate })
  return { save, remove }
}

// ---------- Users ----------
export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: () => http.get<User[]>('/users') })

export function useUserMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.users })
  return {
    create: useMutation({
      mutationFn: (i: { username: string; fullName: string; role: UserRole; password: string }) => http.post<User>('/users', i),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...i }: { id: number; fullName: string; role: UserRole; isActive: boolean }) => http.put<User>(`/users/${id}`, i),
      onSuccess: invalidate,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) => http.post(`/users/${id}/reset-password`, { newPassword }),
    }),
  }
}

// ---------- Transactions ----------
export const useTransactions = (f: TransactionFilter) =>
  useQuery({
    queryKey: keys.transactions(f),
    queryFn: () => http.get<PagedTransactions>('/transactions', { ...f }),
    placeholderData: (prev) => prev,
  })

export const useTransaction = (id: number | undefined) =>
  useQuery({ queryKey: keys.transaction(id ?? 0), queryFn: () => http.get<Transaction>(`/transactions/${id}`), enabled: !!id })

export function useTransactionMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['transaction'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['report'] })
    qc.invalidateQueries({ queryKey: keys.balances })
  }
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: TransactionInput }) =>
        id ? http.put<Transaction>(`/transactions/${id}`, input) : http.post<Transaction>('/transactions', input),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/transactions/${id}`), onSuccess: invalidate }),
  }
}

// ---------- Dashboard & reports ----------
type PeriodFilter = { from: string; to: string }

export const useDashboard = (f: PeriodFilter & { businessUnitId?: number }) =>
  useQuery({ queryKey: keys.dashboard(f), queryFn: () => http.get<Dashboard>('/dashboard', f), placeholderData: (p) => p })

export const useCashflow = (f: PeriodFilter & { accountId?: number }) =>
  useQuery({ queryKey: keys.report('cashflow', f), queryFn: () => http.get<CashflowReport>('/reports/cashflow', f) })

export const useProfitReport = (f: PeriodFilter) =>
  useQuery({ queryKey: keys.report('profit', f), queryFn: () => http.get<ProfitReport>('/reports/profit-by-business', f) })

export const useCategoryReport = (f: PeriodFilter & { type: CategoryType; businessUnitId?: number }) =>
  useQuery({ queryKey: keys.report('category', f), queryFn: () => http.get<CategoryReport>('/reports/by-category', f) })

export const useMonthlyReport = (f: { year: number; businessUnitId?: number }) =>
  useQuery({ queryKey: keys.report('monthly', f), queryFn: () => http.get<MonthlyReport>('/reports/monthly', f) })

export const useBalances = (enabled = true) =>
  useQuery({ queryKey: keys.balances, queryFn: () => http.get<AccountBalance[]>('/accounts/balances'), enabled })

export const useAuditLogs = () => useQuery({ queryKey: keys.audit, queryFn: () => http.get<AuditLog[]>('/audit-logs', { take: 300 }) })

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { http } from './client'
import type { PalmBatch, PalmBatchInput, PalmChargeType, PalmOwner, PalmPayout, PalmPayoutInput, PalmSummary } from './types'

// Bayaran kilang / pemilik mengubah baki akaun → muat semula data kewangan juga
const invalidatePalm = (qc: QueryClient) =>
  Promise.all(
    ['palm-batches', 'palm-batch', 'palm-owners', 'transactions', 'transaction', 'dashboard', 'report', 'balances'].map((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    ),
  )

export const usePalmSummary = (f: { status?: string; ownerId?: number } = {}) =>
  useQuery({ queryKey: ['palm-batches', f], queryFn: () => http.get<PalmSummary>('/palm/batches', { ...f }), placeholderData: (p) => p })

export const usePalmBatch = (id: number | undefined) =>
  useQuery({ queryKey: ['palm-batch', id], queryFn: () => http.get<PalmBatch>(`/palm/batches/${id}`), enabled: !!id })

export const usePalmOwners = (includeInactive = false) =>
  useQuery({ queryKey: ['palm-owners', includeInactive], queryFn: () => http.get<PalmOwner[]>('/palm/owners', { includeInactive }) })

export const usePalmChargeTypes = (includeInactive = false) =>
  useQuery({ queryKey: ['palm-charge-types', includeInactive], queryFn: () => http.get<PalmChargeType[]>('/palm/charge-types', { includeInactive }) })

export function usePalmMutations() {
  const qc = useQueryClient()
  const done = () => invalidatePalm(qc)
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number; input: PalmBatchInput }) =>
        id ? http.put<PalmBatch>(`/palm/batches/${id}`, input) : http.post<PalmBatch>('/palm/batches', input),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => http.del(`/palm/batches/${id}`), onSuccess: done }),
    post: useMutation({ mutationFn: (id: number) => http.post<PalmBatch>(`/palm/batches/${id}/post`, {}), onSuccess: done }),
    reopen: useMutation({ mutationFn: (id: number) => http.post<PalmBatch>(`/palm/batches/${id}/reopen`, {}), onSuccess: done }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/palm/batches/${id}/cancel`, { reason }),
      onSuccess: done,
    }),
    pay: useMutation({ mutationFn: (input: PalmPayoutInput) => http.post<PalmPayout>('/palm/payouts', input), onSuccess: done }),
    voidPayout: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) => http.post(`/palm/payouts/${id}/void`, { reason }),
      onSuccess: done,
    }),
  }
}

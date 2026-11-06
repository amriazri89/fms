import type { ChargeMethod, PalmBatchStatus } from '../api/types'

// Mesti sama dengan backend: Domain/PalmEntities.cs (ChargeMethod, PalmBatchStatus)
export const chargeMethods: { value: ChargeMethod; label: string; unit: string }[] = [
  { value: 'PerTonne', label: 'RM per tan', unit: 'RM/tan' },
  { value: 'Fixed', label: 'Amaun tetap', unit: 'RM' },
  { value: 'Percent', label: 'Peratus', unit: '%' },
]

export const chargeMethodUnit = (m: ChargeMethod) => chargeMethods.find((x) => x.value === m)?.unit ?? ''

export const palmStatus: Record<PalmBatchStatus, { label: string; tone: 'neutral' | 'income' | 'expense' | 'gold' }> = {
  Draft: { label: 'Draf', tone: 'gold' },
  Posted: { label: 'Disahkan', tone: 'income' },
  Cancelled: { label: 'Dibatalkan', tone: 'expense' },
}

export const formatKg = (kg: number) => `${new Intl.NumberFormat('ms-MY', { maximumFractionDigits: 2 }).format(kg)} kg`

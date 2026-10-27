import type { Account, MoneyChannel } from '../api/types'

// Label Tunai / Bank pada rekod duit. Mesti sama dengan backend: Domain/Enums.cs (MoneyChannel)
export const channels: { value: MoneyChannel; label: string }[] = [
  { value: 'Cash', label: 'Tunai' },
  { value: 'Bank', label: 'Bank' },
]

export const channelLabel = (c: MoneyChannel | null | undefined) => channels.find((x) => x.value === c)?.label ?? ''

/**
 * Akaun milik satu perniagaan (satu akaun bagi setiap perniagaan).
 * Jika perniagaan ada tepat satu akaun aktif, ia dipilih sendiri dan medan akaun tidak perlu dipapar.
 */
export const accountForBusiness = (accounts: Account[], businessUnitId: number | null): Account | undefined => {
  if (!businessUnitId) return undefined
  const own = accounts.filter((a) => a.isActive && a.businessUnitId === businessUnitId)
  return own.length === 1 ? own[0] : undefined
}

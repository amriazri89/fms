import type { Category, ClaimStatus, EmploymentType, UtilityType } from '../api/types'
import type { Tone } from './sales'

export const employmentTypes: { value: EmploymentType; label: string; rateLabel: string }[] = [
  { value: 'Monthly', label: 'Gaji bulanan', rateLabel: 'Gaji sebulan (RM)' },
  { value: 'Daily', label: 'Upah harian', rateLabel: 'Kadar sehari (RM)' },
]

export const utilityTypes: { value: UtilityType; label: string; hint: string; match: RegExp }[] = [
  { value: 'Electricity', label: 'Elektrik', hint: 'TNB', match: /elektrik|utiliti/i },
  { value: 'Water', label: 'Air', hint: 'Ranhill SAJ / Air Selangor', match: /air|utiliti/i },
  { value: 'Internet', label: 'Internet', hint: 'Unifi / Maxis', match: /internet|utiliti/i },
  { value: 'Phone', label: 'Telefon', hint: 'Bil telefon', match: /telefon|utiliti/i },
  { value: 'Rent', label: 'Sewa premis', hint: 'Sewa kedai / tanah', match: /sewa/i },
  { value: 'Gas', label: 'Gas', hint: 'Tong gas LPG', match: /gas|utiliti/i },
  { value: 'Other', label: 'Lain-lain', hint: '', match: /utiliti/i },
]
export const utilityLabel = (t: UtilityType) => utilityTypes.find((x) => x.value === t)?.label ?? t

export const claimStatusView: Record<ClaimStatus, { label: string; tone: Tone }> = {
  Pending: { label: 'Menunggu kelulusan', tone: 'gold' },
  Approved: { label: 'Diluluskan, belum dibayar', tone: 'gold' },
  Rejected: { label: 'Ditolak', tone: 'expense' },
  Paid: { label: 'Sudah dibayar', tone: 'income' },
}

/** Kategori belanja yang boleh dipilih untuk perniagaan ini (kategori umum + kategori perniagaan). */
export const expenseCategoriesFor = (categories: Category[], businessUnitId: number | '' | null | undefined) =>
  categories.filter((c) => c.type === 'Expense' && c.isActive && (c.businessUnitId === null || c.businessUnitId === businessUnitId))

/** Pilih kategori lalai: kategori perniagaan yang sepadan dahulu, kemudian kategori umum. */
export function pickCategory(cats: Category[], match: RegExp, businessUnitId: number | '' | null | undefined): number | '' {
  const own = cats.find((c) => c.businessUnitId === businessUnitId && match.test(c.name))
  const global = cats.find((c) => c.businessUnitId === null && match.test(c.name))
  return own?.id ?? global?.id ?? ''
}

const bulan = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember']
/** "2026-10" → "Oktober 2026" */
export const formatPeriod = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${bulan[m - 1]} ${y}`
}
export const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

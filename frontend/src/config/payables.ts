import type { PayableKind, PayableListItem, PayableStatus } from '../api/types'
import type { Tone } from './sales'

export const payableKinds: { value: PayableKind; label: string; help: string }[] = [
  { value: 'Bill', label: 'Bil pembekal', help: 'Barang atau servis diambil dahulu, bayar kemudian. Dikira belanja bila dibayar.' },
  { value: 'Loan', label: 'Pinjaman', help: 'Pinjam duit dari bank atau orang. Bayar balik pokok bukan belanja; faedah dikira belanja.' },
]
export const payableKindLabel = (k: PayableKind) => payableKinds.find((x) => x.value === k)?.label ?? k

const payableStatus: Record<PayableStatus, { label: string; tone: Tone }> = {
  Unpaid: { label: 'Belum bayar', tone: 'gold' },
  PartiallyPaid: { label: 'Bayar sebahagian', tone: 'gold' },
  Paid: { label: 'Lunas', tone: 'income' },
  Cancelled: { label: 'Batal', tone: 'neutral' },
}

export const payableStatusView = (p: Pick<PayableListItem, 'status' | 'isOverdue'>) =>
  p.isOverdue ? { label: 'Lewat bayar', tone: 'expense' as Tone } : payableStatus[p.status]

/** "Lewat 5 hari", "Hari ini", "Lagi 3 hari" */
export function dueText(p: Pick<PayableListItem, 'daysToDue' | 'status'>) {
  if (p.status === 'Paid' || p.status === 'Cancelled') return null
  if (p.daysToDue < 0) return `Lewat ${-p.daysToDue} hari`
  if (p.daysToDue === 0) return 'Akhir hari ini'
  return `Lagi ${p.daysToDue} hari`
}

export const payableFilters = [
  { key: 'unpaid', label: 'Belum lunas' },
  { key: 'overdue', label: 'Lewat bayar' },
  { key: 'paid', label: 'Lunas' },
  { key: 'cancelled', label: 'Batal' },
  { key: '', label: 'Semua' },
]

export const kindFilters = [
  { key: '', label: 'Semua jenis' },
  { key: 'Bill', label: 'Bil pembekal' },
  { key: 'Loan', label: 'Pinjaman' },
]

/** Hari bayaran lalai untuk bil baru. */
export const defaultBillTermDays = 30

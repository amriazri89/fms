import type { CustomerActivityType, InvoiceListItem, InvoiceStatus, PaymentMethod, QuotationListItem, QuotationStatus } from '../api/types'

export type Tone = 'income' | 'expense' | 'neutral' | 'gold'

export const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'Cash', label: 'Tunai' },
  { value: 'BankTransfer', label: 'Pindahan bank' },
  { value: 'DuitNow', label: 'DuitNow / QR' },
  { value: 'Cheque', label: 'Cek' },
  { value: 'Card', label: 'Kad' },
  { value: 'Other', label: 'Lain-lain' },
]
export const paymentMethodLabel = (m: PaymentMethod) => paymentMethods.find((x) => x.value === m)?.label ?? m

export const activityTypes: { value: CustomerActivityType; label: string; icon: string }[] = [
  { value: 'Note', label: 'Catatan', icon: '✎' },
  { value: 'Call', label: 'Panggilan', icon: '☎' },
  { value: 'WhatsApp', label: 'WhatsApp', icon: '✉' },
  { value: 'Visit', label: 'Lawatan', icon: '⌂' },
  { value: 'Email', label: 'E-mel', icon: '@' },
  { value: 'Meeting', label: 'Mesyuarat', icon: '◎' },
]
export const activityLabel = (t: CustomerActivityType) => activityTypes.find((x) => x.value === t)?.label ?? t

const quotationStatus: Record<QuotationStatus, { label: string; tone: Tone }> = {
  Draft: { label: 'Draf', tone: 'neutral' },
  Sent: { label: 'Dihantar', tone: 'gold' },
  Accepted: { label: 'Diterima', tone: 'income' },
  Rejected: { label: 'Ditolak', tone: 'expense' },
  Converted: { label: 'Sudah jadi invois', tone: 'income' },
}

export const quotationStatusView = (q: Pick<QuotationListItem, 'status' | 'isExpired'>) =>
  q.isExpired ? { label: 'Tamat tempoh', tone: 'expense' as Tone } : quotationStatus[q.status]

/** Status yang pengguna boleh pilih secara manual (Converted hanya melalui "Tukar ke invois"). */
export const manualQuotationStatuses: { value: QuotationStatus; label: string }[] = [
  { value: 'Draft', label: 'Draf' },
  { value: 'Sent', label: 'Dihantar' },
  { value: 'Accepted', label: 'Diterima' },
  { value: 'Rejected', label: 'Ditolak' },
]

const invoiceStatus: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  Unpaid: { label: 'Belum bayar', tone: 'gold' },
  PartiallyPaid: { label: 'Bayar sebahagian', tone: 'gold' },
  Paid: { label: 'Lunas', tone: 'income' },
  Cancelled: { label: 'Batal', tone: 'neutral' },
}

export const invoiceStatusView = (i: Pick<InvoiceListItem, 'status' | 'isOverdue'>) =>
  i.isOverdue ? { label: 'Tertunggak', tone: 'expense' as Tone } : invoiceStatus[i.status]

export const quotationFilters = [
  { key: '', label: 'Semua' },
  { key: 'open', label: 'Terbuka' },
  { key: 'accepted', label: 'Diterima' },
  { key: 'converted', label: 'Jadi invois' },
  { key: 'rejected', label: 'Ditolak' },
  { key: 'expired', label: 'Tamat tempoh' },
]

export const invoiceFilters = [
  { key: '', label: 'Semua' },
  { key: 'unpaid', label: 'Belum lunas' },
  { key: 'overdue', label: 'Tertunggak' },
  { key: 'paid', label: 'Lunas' },
  { key: 'cancelled', label: 'Batal' },
]

export const receiptFilters = [
  { key: '', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'voided', label: 'Dibatalkan' },
]

export const docTitles = {
  quotation: 'SEBUT HARGA',
  invoice: 'INVOIS',
  receipt: 'RESIT RASMI',
} as const

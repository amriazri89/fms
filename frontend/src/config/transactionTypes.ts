import type { TransactionType, UserRole } from '../api/types'

export type FieldRule = 'hidden' | 'optional' | 'required'

export interface TransactionTypeConfig {
  type: TransactionType
  label: string
  shortLabel: string
  help: string
  /** +1 duit masuk, -1 duit keluar, 0 pergerakan dalaman */
  sign: 1 | -1 | 0
  tone: 'income' | 'expense' | 'neutral'
  icon: string
  allowedRoles: UserRole[]
  fields: {
    business: FieldRule
    toBusiness: FieldRule
    toAccount: FieldRule
    category: FieldRule
    familyMember: FieldRule
    party: FieldRule
  }
  labels: {
    business?: string
    account: string
    toAccount?: string
    toBusiness?: string
    party?: string
  }
}

// Peraturan medan ini mesti sama dengan backend: Domain/TransactionRules.cs
export const transactionTypes: TransactionTypeConfig[] = [
  {
    type: 'Income',
    label: 'Duit Masuk',
    shortLabel: 'Masuk',
    help: 'Hasil jualan atau pendapatan perniagaan.',
    sign: 1,
    tone: 'income',
    icon: '+',
    allowedRoles: ['Manager', 'Clerk'],
    fields: { business: 'required', toBusiness: 'hidden', toAccount: 'hidden', category: 'required', familyMember: 'hidden', party: 'optional' },
    labels: { business: 'Perniagaan', account: 'Duit masuk ke', party: 'Pelanggan' },
  },
  {
    type: 'Expense',
    label: 'Duit Keluar',
    shortLabel: 'Keluar',
    help: 'Belanja untuk perniagaan seperti baja, upah, stok.',
    sign: -1,
    tone: 'expense',
    icon: '−',
    allowedRoles: ['Manager', 'Clerk'],
    fields: { business: 'required', toBusiness: 'hidden', toAccount: 'hidden', category: 'required', familyMember: 'hidden', party: 'optional' },
    labels: { business: 'Perniagaan', account: 'Bayar guna', party: 'Pembekal' },
  },
  {
    type: 'Transfer',
    label: 'Pindah Duit',
    shortLabel: 'Pindah',
    help: 'Duit berpindah tempat, contoh keluarkan dari bank ke tunai. Bukan untung atau rugi.',
    sign: 0,
    tone: 'neutral',
    icon: '⇄',
    allowedRoles: ['Manager', 'Clerk'],
    fields: { business: 'hidden', toBusiness: 'hidden', toAccount: 'required', category: 'hidden', familyMember: 'hidden', party: 'hidden' },
    labels: { account: 'Dari akaun', toAccount: 'Ke akaun' },
  },
  {
    type: 'OwnerWithdrawal',
    label: 'Ambilan Keluarga',
    shortLabel: 'Ambilan',
    help: 'Ahli keluarga ambil duit perniagaan untuk kegunaan sendiri. Tidak dikira sebagai belanja perniagaan.',
    sign: -1,
    tone: 'neutral',
    icon: '↗',
    allowedRoles: ['Manager', 'Clerk'],
    fields: { business: 'required', toBusiness: 'hidden', toAccount: 'hidden', category: 'hidden', familyMember: 'required', party: 'hidden' },
    labels: { business: 'Duit perniagaan', account: 'Diambil dari' },
  },
  {
    type: 'OwnerCapital',
    label: 'Modal Masuk',
    shortLabel: 'Modal',
    help: 'Ahli keluarga masukkan duit sendiri ke dalam perniagaan. Tidak dikira sebagai pendapatan.',
    sign: 1,
    tone: 'neutral',
    icon: '↙',
    allowedRoles: ['Manager', 'Clerk'],
    fields: { business: 'required', toBusiness: 'hidden', toAccount: 'hidden', category: 'hidden', familyMember: 'required', party: 'hidden' },
    labels: { business: 'Untuk perniagaan', account: 'Masuk ke' },
  },
  {
    type: 'InternalLoan',
    label: 'Pinjaman Antara Perniagaan',
    shortLabel: 'Pinjaman',
    help: 'Satu perniagaan pinjam duit dari perniagaan lain. Untuk bayar balik, rekod pinjaman sebaliknya.',
    sign: 0,
    tone: 'neutral',
    icon: '↔',
    allowedRoles: ['Manager', 'Clerk'],
    fields: { business: 'required', toBusiness: 'required', toAccount: 'required', category: 'hidden', familyMember: 'hidden', party: 'hidden' },
    labels: { business: 'Perniagaan pemberi', toBusiness: 'Perniagaan peminjam', account: 'Dari akaun', toAccount: 'Ke akaun' },
  },
  // Dua jenis di bawah dijana oleh menu "Hutang kita" sahaja (allowedRoles kosong = tidak boleh rekod terus)
  {
    type: 'LoanIn',
    label: 'Pinjaman Diterima',
    shortLabel: 'Pinjam',
    help: 'Duit pinjaman dari bank atau orang luar masuk ke akaun. Bukan pendapatan.',
    sign: 1,
    tone: 'neutral',
    icon: '⬇',
    allowedRoles: [],
    fields: { business: 'required', toBusiness: 'hidden', toAccount: 'hidden', category: 'hidden', familyMember: 'hidden', party: 'optional' },
    labels: { business: 'Untuk perniagaan', account: 'Masuk ke', party: 'Pemberi pinjaman' },
  },
  {
    type: 'LoanRepayment',
    label: 'Bayar Balik Pinjaman',
    shortLabel: 'Bayar pinjaman',
    help: 'Bayar balik pokok pinjaman. Bukan belanja (faedah direkod berasingan sebagai Duit Keluar).',
    sign: -1,
    tone: 'neutral',
    icon: '⬆',
    allowedRoles: [],
    fields: { business: 'required', toBusiness: 'hidden', toAccount: 'hidden', category: 'hidden', familyMember: 'hidden', party: 'optional' },
    labels: { business: 'Perniagaan', account: 'Bayar guna', party: 'Pemberi pinjaman' },
  },
]

export const typeConfig = (t: TransactionType): TransactionTypeConfig =>
  transactionTypes.find((x) => x.type === t) ?? transactionTypes[0]

export const typesForRole = (role: UserRole) => transactionTypes.filter((t) => t.allowedRoles.includes(role))

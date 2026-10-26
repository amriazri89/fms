import type { Transaction } from '../api/types'
import { typeConfig } from '../config/transactionTypes'
import { formatDate } from '../lib/format'
import { Money, cx } from './ui'

/** Huraian satu baris rekod dalam bahasa mudah. */
export function describe(t: Transaction): string {
  switch (t.type) {
    case 'Transfer':
      return `${t.accountName} → ${t.toAccountName ?? '?'}`
    case 'InternalLoan':
      return `${t.toBusinessUnitName ?? '?'} pinjam dari ${t.businessUnitName ?? '?'}`
    case 'OwnerWithdrawal':
      return `${t.familyMemberName ?? '?'} ambil dari ${t.businessUnitName ?? '?'}`
    case 'OwnerCapital':
      return `${t.familyMemberName ?? '?'} masukkan modal ke ${t.businessUnitName ?? '?'}`
    default:
      return [t.businessUnitName, t.categoryName].filter(Boolean).join(' · ')
  }
}

export function TransactionRow({ t, onClick }: { t: Transaction; onClick?: () => void }) {
  const cfg = typeConfig(t.type)
  const tone = cfg.tone === 'income' ? 'income' : cfg.tone === 'expense' ? 'expense' : 'plain'
  const iconBg = cfg.tone === 'income' ? 'bg-brand-50 text-brand-700' : cfg.tone === 'expense' ? 'bg-red-50 text-expense' : 'bg-gray-100 text-gray-600'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition enabled:hover:bg-gray-50"
    >
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold', iconBg)}>{cfg.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{describe(t)}</span>
        <span className="block truncate text-xs text-muted">
          {formatDate(t.date)} · {cfg.shortLabel}
          {t.type !== 'Transfer' && ` · ${t.accountName}`}
          {t.description && ` · ${t.description}`}
        </span>
      </span>
      <Money value={cfg.sign === 0 ? t.amount : cfg.sign * t.amount} signed={cfg.sign !== 0} tone={tone} className="shrink-0 text-sm font-bold" />
    </button>
  )
}

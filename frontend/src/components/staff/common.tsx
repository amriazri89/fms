import type { ReactNode } from 'react'
import { useAccounts } from '../../api/hooks'
import type { PaymentMethod } from '../../api/types'
import { paymentMethods } from '../../config/sales'
import { Field, Money, Select, cx } from '../ui'

/** Satu baris senarai: tajuk + lencana, baris kecil, jumlah di kanan. */
export function ListRow({ title, badges, sub, amount, amountClass, right, onClick, muted }: {
  title: ReactNode
  badges?: ReactNode
  sub?: ReactNode
  amount?: number
  amountClass?: string
  right?: ReactNode
  onClick?: () => void
  muted?: boolean
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className={cx('flex items-center gap-3 rounded-xl px-2 py-3 transition', onClick && 'cursor-pointer hover:bg-gray-50', muted && 'opacity-60')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          {badges}
        </div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      <div className="shrink-0 text-right">
        {amount !== undefined && <Money value={amount} className={cx('block text-sm font-bold', amountClass)} />}
        {right}
      </div>
    </div>
  )
}

export function TotalBar({ count, total, label, extra }: { count: number; total: number; label: string; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
      <span className="text-muted">{count} {label}</span>
      <span className="flex items-center gap-3">{extra}<span>Jumlah <Money value={total} className="font-bold text-ink" /></span></span>
    </div>
  )
}

/** Ralat medan dari API → { medan: mesej pertama }. */
export function fieldErrors(err: unknown): Record<string, string> {
  const fe = (err as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors
  return fe ? Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])) : {}
}

export const moneyInput = (v: string) => v.replace(/[^\d.]/g, '')

/** Pilihan akaun bayar + kaedah bayaran (dipakai oleh gaji, bil utiliti, tuntutan). */
export function PayFields({ accountId, onAccount, method, onMethod, accountError }: {
  accountId: number | ''
  onAccount: (v: number | '') => void
  method: PaymentMethod
  onMethod: (m: PaymentMethod) => void
  accountError?: string
}) {
  const { data: accounts = [] } = useAccounts()
  return (
    <>
      <Field label="Bayar guna akaun" required error={accountError}>
        <Select value={accountId} onChange={(e) => onAccount(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— Pilih akaun —</option>
          {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <Field label="Kaedah bayaran">
        <Select value={method} onChange={(e) => onMethod(e.target.value as PaymentMethod)}>
          {paymentMethods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
      </Field>
    </>
  )
}

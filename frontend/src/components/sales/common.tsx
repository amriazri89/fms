import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { InvoiceListItem, PaymentListItem, QuotationListItem } from '../../api/types'
import { invoiceStatusView, paymentMethodLabel, quotationStatusView, type Tone } from '../../config/sales'
import { formatDate, formatRM } from '../../lib/format'
import { Badge, Money, cx } from '../ui'

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <Badge tone={tone}>{label}</Badge>
}

function Row({ to, title, sub, right, badge }: { to: string; title: ReactNode; sub: ReactNode; right: ReactNode; badge?: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-gray-50">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          {badge}
        </span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <span className="shrink-0 text-right">{right}</span>
    </Link>
  )
}

export function QuotationRow({ q, showCustomer = true }: { q: QuotationListItem; showCustomer?: boolean }) {
  const s = quotationStatusView(q)
  return (
    <Row
      to={`/sebut-harga/${q.id}`}
      title={showCustomer ? q.customerName : q.number}
      badge={<StatusBadge {...s} />}
      sub={[showCustomer && q.number, formatDate(q.date), q.subject, q.businessUnitName].filter(Boolean).join(' · ')}
      right={<Money value={q.total} className="text-sm font-bold" />}
    />
  )
}

export function InvoiceRow({ i, showCustomer = true }: { i: InvoiceListItem; showCustomer?: boolean }) {
  const s = invoiceStatusView(i)
  return (
    <Row
      to={`/invois/${i.id}`}
      title={showCustomer ? i.customerName : i.number}
      badge={<StatusBadge {...s} />}
      sub={[showCustomer && i.number, formatDate(i.date), `Akhir ${formatDate(i.dueDate)}`, i.businessUnitName].filter(Boolean).join(' · ')}
      right={
        <>
          <Money value={i.total} className="block text-sm font-bold" />
          {i.balance > 0 && i.status !== 'Cancelled' && (
            <span className={cx('block text-xs', i.isOverdue ? 'text-expense' : 'text-muted')}>Baki {formatRM(i.balance)}</span>
          )}
        </>
      }
    />
  )
}

export function ReceiptRow({ p, showCustomer = true }: { p: PaymentListItem; showCustomer?: boolean }) {
  return (
    <Row
      to={`/resit/${p.id}`}
      title={showCustomer ? p.receivedFrom : p.number}
      badge={p.isVoided ? <StatusBadge label="Batal" tone="neutral" /> : undefined}
      sub={[showCustomer && p.number, formatDate(p.date), paymentMethodLabel(p.method), p.invoiceNumber, p.accountName].filter(Boolean).join(' · ')}
      right={<Money value={p.amount} tone={p.isVoided ? 'plain' : 'income'} className={cx('text-sm font-bold', p.isVoided && 'line-through opacity-60')} />}
    />
  )
}

export function ChipFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={
            'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ' +
            (value === o.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-muted hover:text-ink')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

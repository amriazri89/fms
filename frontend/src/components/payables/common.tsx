import { Link } from 'react-router-dom'
import type { PayableListItem, PayablePayment } from '../../api/types'
import { dueText, payableKindLabel, payableStatusView } from '../../config/payables'
import { paymentMethodLabel } from '../../config/sales'
import { formatDate, formatRM } from '../../lib/format'
import { StatusBadge } from '../sales/common'
import { Badge, Money, cx } from '../ui'

export function PayableRow({ p, showSupplier = true }: { p: PayableListItem; showSupplier?: boolean }) {
  const s = payableStatusView(p)
  const due = dueText(p)
  const open = p.status === 'Unpaid' || p.status === 'PartiallyPaid'
  return (
    <Link to={`/hutang/${p.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-gray-50">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{showSupplier ? p.supplierName : p.description}</span>
          <StatusBadge {...s} />
          {p.kind === 'Loan' && <Badge>{payableKindLabel(p.kind)}</Badge>}
        </span>
        <span className="block truncate text-xs text-muted">
          {[p.number, showSupplier && p.description, `Akhir ${formatDate(p.dueDate)}`, p.businessUnitName].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Money value={open ? p.balance : p.amount} className={cx('block text-sm font-bold', p.status === 'Cancelled' && 'line-through opacity-60')} />
        {open && (
          <span className={cx('block text-xs', p.isOverdue ? 'font-semibold text-expense' : p.daysToDue <= 7 ? 'text-gold-600' : 'text-muted')}>
            {due}
          </span>
        )}
        {open && p.amountPaid > 0 && <span className="block text-[11px] text-muted">dari {formatRM(p.amount)}</span>}
      </span>
    </Link>
  )
}

export function PayablePaymentRow({ x, showPayable = false }: { x: PayablePayment; showPayable?: boolean }) {
  return (
    <Link
      to={`/cetak-baucar/${x.id}`}
      className={cx('flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-gray-50', x.isVoided && 'opacity-50')}
    >
      <span className="min-w-0">
        <span className="block truncate">
          <b>{x.number}</b> · {formatDate(x.date)} · {paymentMethodLabel(x.method)} · {x.accountName}
          {x.isVoided && <span className="ml-2 text-xs text-expense">(batal)</span>}
        </span>
        {(showPayable || x.interestAmount > 0) && (
          <span className="block truncate text-xs text-muted">
            {[showPayable && x.payableNumber, x.interestAmount > 0 && `Pokok ${formatRM(x.amount)} + faedah ${formatRM(x.interestAmount)}`].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      <Money value={x.amount + x.interestAmount} tone={x.isVoided ? 'plain' : 'expense'} className={cx('shrink-0 font-bold', x.isVoided && 'line-through')} />
    </Link>
  )
}

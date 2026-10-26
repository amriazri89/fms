import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePayable, usePayableMutations } from '../../api/payableHooks'
import type { PayablePayment } from '../../api/types'
import { Icon } from '../../components/Icon'
import { PayablePaymentForm } from '../../components/payables/PayablePaymentForm'
import { ReasonModal } from '../../components/ReasonModal'
import { StatusBadge } from '../../components/sales/common'
import { ActionLink, ViewHeader } from '../../components/ViewParts'
import { Badge, Button, Card, ErrorBox, Modal, Money, Spinner, cx } from '../../components/ui'
import { dueText, payableKindLabel, payableStatusView } from '../../config/payables'
import { paymentMethodLabel } from '../../config/sales'
import { formatDate, formatRM } from '../../lib/format'

export default function PayableViewPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { data: p, isLoading, error } = usePayable(id)
  const m = usePayableMutations()
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [voiding, setVoiding] = useState<PayablePayment | null>(null)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!p) return null

  const s = payableStatusView(p)
  const isLoan = p.kind === 'Loan'
  const cancelled = p.status === 'Cancelled'
  const active = p.payments.filter((x) => !x.isVoided)
  const editable = !cancelled && active.length === 0
  const due = dueText(p)

  const facts: [string, React.ReactNode][] = [
    [isLoan ? 'Pemberi pinjaman' : 'Pembekal', <Link to={`/pembekal/${p.supplierId}`} className="font-semibold text-brand-700 hover:underline">{p.supplierName}</Link>],
    ['Perniagaan', p.businessUnitName],
    [isLoan ? 'Tarikh pinjam' : 'Tarikh bil', formatDate(p.date)],
    [isLoan ? 'Tarikh tamat' : 'Akhir bayar', <>{formatDate(p.dueDate)} {due && <span className={cx('ml-1 text-xs', p.isOverdue ? 'font-semibold text-expense' : 'text-muted')}>({due})</span>}</>],
  ]
  if (p.supplierReference) facts.push([isLoan ? 'No. akaun pinjaman' : 'No. bil pembekal', p.supplierReference])
  if (!isLoan && p.categoryName) facts.push(['Kategori belanja', p.categoryName])
  if (isLoan && p.installmentAmount) facts.push(['Ansuran bulanan', formatRM(p.installmentAmount)])
  if (isLoan) facts.push(['Duit pinjaman', p.receivedAccountName ? `Masuk ke ${p.receivedAccountName}` : 'Diterima sebelum guna sistem'])
  if (p.notes) facts.push(['Catatan', <span className="whitespace-pre-line">{p.notes}</span>])
  if (cancelled && p.cancelReason) facts.push(['Sebab batal', p.cancelReason])

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <ViewHeader
        back="/hutang"
        backLabel="Hutang kita"
        number={p.number}
        badge={<><StatusBadge {...s} /> <Badge>{payableKindLabel(p.kind)}</Badge></>}
        sub={<>{p.description}</>}
        actions={
          <>
            {!cancelled && p.balance > 0 && (
              <Button onClick={() => setPaying(true)}>
                <Icon name="wallet" className="h-4 w-4" /> {isLoan ? 'Bayar ansuran' : 'Bayar bil'}
              </Button>
            )}
            {editable && <ActionLink to={`/hutang/${p.id}/ubah`} icon="edit">Ubah</ActionLink>}
          </>
        }
      />

      <div className={cx('grid gap-3', isLoan && p.interestPaid > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
        {[
          { label: isLoan ? 'Jumlah pinjaman' : 'Jumlah bil', value: p.amount, cls: 'text-ink' },
          { label: isLoan ? 'Pokok dibayar' : 'Dibayar', value: p.amountPaid, cls: 'text-income' },
          { label: 'Baki', value: p.balance, cls: p.balance > 0 ? (p.isOverdue ? 'text-expense' : 'text-gold-600') : 'text-ink' },
          ...(isLoan && p.interestPaid > 0 ? [{ label: 'Faedah dibayar', value: p.interestPaid, cls: 'text-expense' }] : []),
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{x.label}</div>
            <Money value={x.value} className={cx('mt-1 block text-base font-extrabold sm:text-xl', x.cls)} />
          </div>
        ))}
      </div>

      {p.amount > 0 && !cancelled && (
        <div className="h-2 overflow-hidden rounded-full bg-gray-100" aria-label="Kemajuan bayaran">
          <div className="h-full rounded-full bg-income" style={{ width: `${Math.min(100, (p.amountPaid / p.amount) * 100)}%` }} />
        </div>
      )}

      <Card title="Maklumat">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1.5 sm:block sm:border-0 sm:py-0">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium text-ink sm:text-left">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Bayaran (baucar)">
        {p.payments.length === 0 ? (
          <p className="text-sm text-muted">Belum ada bayaran.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {p.payments.map((x) => (
              <li key={x.id} className={cx('flex flex-wrap items-center gap-3 py-2.5 text-sm', x.isVoided && 'opacity-50')}>
                <span className="min-w-0 flex-1">
                  <span className="block"><b>{x.number}</b> · {formatDate(x.date)} · {paymentMethodLabel(x.method)} · {x.accountName}</span>
                  <span className="block text-xs text-muted">
                    {x.interestAmount > 0 ? `Pokok ${formatRM(x.amount)} + faedah ${formatRM(x.interestAmount)}` : x.reference ?? ''}
                    {x.isVoided && <span className="text-expense"> · Batal: {x.voidReason}</span>}
                  </span>
                </span>
                <Money value={x.amount + x.interestAmount} tone={x.isVoided ? 'plain' : 'expense'} className={cx('font-bold', x.isVoided && 'line-through')} />
                <span className="flex gap-3">
                  <Link to={`/cetak-baucar/${x.id}`} className="font-semibold text-brand-600 hover:underline">Baucar</Link>
                  {!x.isVoided && <button onClick={() => setVoiding(x)} className="font-semibold text-expense hover:underline">Batal</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!cancelled && (
          <div className="mt-3 border-t border-line pt-3 text-right">
            <button
              onClick={() => (active.length ? alert('Batalkan bayaran dahulu sebelum membatalkan hutang ini.') : setCancelling(true))}
              className="text-sm font-semibold text-expense hover:underline"
            >
              Batalkan hutang
            </button>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted">
        {isLoan
          ? 'Bayar balik pokok tidak dikira belanja (hanya mengurangkan baki pinjaman). Faedah dikira belanja.'
          : 'Setiap bayaran bil direkod sebagai Duit Keluar dan dikira belanja pada tarikh bayar.'}
        {' '}Rekod duit yang dijana dikunci; batalkan bayaran untuk membetulkan.
      </p>

      <Modal open={paying} title={isLoan ? 'Bayar ansuran pinjaman' : 'Bayar bil'} onClose={() => setPaying(false)}>
        {paying && <PayablePaymentForm payable={p} onSaved={(v) => navigate(`/cetak-baucar/${v.payment.id}`)} onCancel={() => setPaying(false)} />}
      </Modal>
      <ReasonModal
        open={cancelling}
        title={`Batalkan ${p.number}`}
        confirmLabel="Batalkan hutang"
        busy={m.cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) => m.cancel.mutateAsync({ id: p.id, reason }).then(() => undefined)}
      />
      <ReasonModal
        open={!!voiding}
        title={`Batalkan bayaran ${voiding?.number ?? ''}`}
        confirmLabel="Batalkan bayaran"
        busy={m.voidPayment.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={(reason) => m.voidPayment.mutateAsync({ id: voiding!.id, reason }).then(() => undefined)}
      />
    </div>
  )
}

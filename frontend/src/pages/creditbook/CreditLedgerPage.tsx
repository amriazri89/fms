import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCreditBookMutations, useCreditLedger } from '../../api/creditBookHooks'
import type { CreditLedgerLine } from '../../api/types'
import { CreditEntryForm, CreditPaymentForm } from '../../components/creditbook/CreditForms'
import { Icon } from '../../components/Icon'
import { ReasonModal } from '../../components/ReasonModal'
import { ActionLink } from '../../components/ViewParts'
import { Badge, Button, Card, Empty, ErrorBox, Modal, Money, Spinner, cx } from '../../components/ui'
import { paymentMethodLabel } from '../../config/sales'
import { formatDate, formatRM } from '../../lib/format'
import { creditReminderMessage } from '../../lib/salesMessages'
import { waLink } from '../../lib/whatsapp'

/** Lejar buku hutang seorang pelanggan dalam satu perniagaan. */
export default function CreditLedgerPage() {
  const params = useParams()
  const customerId = Number(params.customerId)
  const businessUnitId = Number(params.businessUnitId)
  const { data, isLoading, error } = useCreditLedger(customerId, businessUnitId)
  const { voidEntry } = useCreditBookMutations()

  const [adding, setAdding] = useState(false)
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState<CreditLedgerLine | null>(null)
  const [paidReceipt, setPaidReceipt] = useState<{ id: number; number: string } | null>(null)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  // Terbaru di atas; baki dikira oleh server ikut tarikh
  const lines = [...data.lines].reverse()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/buku-hutang" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Buku hutang
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{data.customerName}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {[data.businessUnitName, data.phone, data.oldestUnpaidDate && `Hutang sejak ${formatDate(data.oldestUnpaidDate)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Icon name="plus" className="h-4 w-4" /> Tambah hutang
          </Button>
          {data.balance > 0 && (
            <Button onClick={() => { setPaidReceipt(null); setPaying(true) }}>
              <Icon name="receipt" className="h-4 w-4" /> Terima bayaran
            </Button>
          )}
          {data.balance > 0 && (
            <ActionLink to={waLink(data.phone, creditReminderMessage(data))} icon="chat" external>Ingatkan</ActionLink>
          )}
          <ActionLink to={`/pelanggan/${data.customerId}`} icon="users">Pelanggan</ActionLink>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Jumlah ambil', value: data.totalTaken, cls: 'text-ink' },
          { label: 'Sudah bayar', value: data.totalPaid, cls: 'text-income' },
          { label: 'Baki hutang', value: data.balance, cls: data.balance > 0 ? 'text-expense' : 'text-ink' },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{x.label}</div>
            <Money value={x.value} className={cx('mt-1 block text-base font-extrabold sm:text-xl', x.cls)} />
          </div>
        ))}
      </div>

      {paidReceipt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm">
          <span>Bayaran disimpan. Resit <b>{paidReceipt.number}</b> dijana.</span>
          <span className="flex gap-3">
            <Link to={`/resit/${paidReceipt.id}`} className="font-semibold text-brand-700 hover:underline">Lihat resit</Link>
            <Link to={`/cetak/resit/${paidReceipt.id}`} className="font-semibold text-brand-700 hover:underline">Cetak</Link>
          </span>
        </div>
      )}

      <Card title="Rekod">
        {lines.length === 0 ? (
          <Empty>Belum ada rekod.</Empty>
        ) : (
          <ul className="-mx-2 divide-y divide-line/60">
            {lines.map((l) => (
              <li key={`${l.kind}-${l.id}`} className={cx('flex items-start gap-3 px-2 py-3', l.isVoided && 'opacity-50')}>
                <span
                  className={cx(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    l.kind === 'Taken' ? 'bg-red-50 text-expense' : 'bg-green-50 text-income',
                  )}
                >
                  <Icon name={l.kind === 'Taken' ? 'book' : 'receipt'} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cx('text-sm font-semibold text-ink', l.isVoided && 'line-through')}>{l.description}</span>
                    {l.isVoided && <Badge tone="expense">Dibatalkan</Badge>}
                  </span>
                  <span className="block text-xs text-muted">
                    {[
                      formatDate(l.date),
                      l.kind === 'Paid' && l.method && paymentMethodLabel(l.method),
                      l.createdBy,
                    ].filter(Boolean).join(' · ')}
                    {l.receiptNumber && (
                      <> · <Link to={`/resit/${l.id}`} className="font-semibold text-brand-700 hover:underline">{l.receiptNumber}</Link></>
                    )}
                  </span>
                  {l.isVoided && l.voidReason && <span className="block text-xs text-expense">Sebab: {l.voidReason}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={cx('block text-sm font-bold tabular-nums', l.kind === 'Taken' ? 'text-expense' : 'text-income')}>
                    {l.kind === 'Taken' ? '+' : '−'}{formatRM(l.amount)}
                  </span>
                  {l.balance !== null && <span className="block text-xs text-muted">Baki {formatRM(l.balance)}</span>}
                  {l.kind === 'Taken' && !l.isVoided && (
                    <button onClick={() => setVoiding(l)} className="mt-1 text-xs font-semibold text-muted hover:text-expense hover:underline">
                      Batal
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted">
        Hutang belum dikira jualan. Setiap bayaran menjana resit dan rekod Duit Masuk (dikira jualan pada tarikh bayar).
        Untuk batal bayaran, buka resit itu dan pilih Batal.
      </p>

      <Modal open={adding} title="Tambah hutang" onClose={() => setAdding(false)}>
        {adding && (
          <CreditEntryForm
            customerId={data.customerId}
            businessUnitId={data.businessUnitId}
            onCancel={() => setAdding(false)}
            onSaved={() => setAdding(false)}
          />
        )}
      </Modal>

      <Modal open={paying} title="Terima bayaran hutang" onClose={() => setPaying(false)}>
        {paying && (
          <CreditPaymentForm
            ledger={data}
            onCancel={() => setPaying(false)}
            onSaved={(r) => {
              setPaying(false)
              setPaidReceipt({ id: r.id, number: r.number })
            }}
          />
        )}
      </Modal>

      <ReasonModal
        open={!!voiding}
        title={voiding ? `Batal hutang ${formatRM(voiding.amount)}?` : ''}
        confirmLabel="Batal rekod hutang"
        busy={voidEntry.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={async (reason) => {
          if (voiding) await voidEntry.mutateAsync({ id: voiding.id, reason })
        }}
      />
    </div>
  )
}

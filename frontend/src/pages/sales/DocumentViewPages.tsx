import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDocumentSettings, useInvoice, useInvoiceMutations, useQuotation, useQuotationMutations, useReceipt, useReceiptMutations } from '../../api/salesHooks'
import { useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/Icon'
import { StatusBadge } from '../../components/sales/common'
import { PaymentForm } from '../../components/sales/PaymentForm'
import { PrintableDocument, type PrintableProps } from '../../components/sales/PrintableDocument'
import { ReasonModal } from '../../components/ReasonModal'
import { ActionLink, ViewHeader } from '../../components/ViewParts'
import { Button, Card, ErrorBox, Modal, Money, Spinner, cx } from '../../components/ui'
import { invoiceStatusView, manualQuotationStatuses, paymentMethodLabel, quotationStatusView } from '../../config/sales'
import { formatDate, formatRM } from '../../lib/format'
import { invoiceMessage, quotationMessage, receiptMessage } from '../../lib/salesMessages'
import { waLink } from '../../lib/whatsapp'

// ---------------------------------------------------------------- shared

function Preview(props: PrintableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <PrintableDocument {...props} />
    </div>
  )
}

// ---------------------------------------------------------------- sebut harga

export function QuotationViewPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const { data: q, isLoading, error } = useQuotation(id)
  const { data: settings } = useDocumentSettings()
  const { setStatus, convert, remove } = useQuotationMutations()
  const [actionError, setActionError] = useState<unknown>(null)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!q) return null

  const converted = q.status === 'Converted'
  const s = quotationStatusView(q)

  const doConvert = async () => {
    if (!window.confirm(`Tukar ${q.number} kepada invois? Item dan harga akan disalin.`)) return
    setActionError(null)
    try {
      const inv = await convert.mutateAsync(q.id)
      navigate(`/invois/${inv.id}`)
    } catch (e) {
      setActionError(e)
    }
  }

  const doDelete = async () => {
    if (!window.confirm(`Padam ${q.number}?`)) return
    try {
      await remove.mutateAsync(q.id)
      navigate('/sebut-harga', { replace: true })
    } catch (e) {
      setActionError(e)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ViewHeader
        back="/sebut-harga"
        backLabel="Semua sebut harga"
        number={q.number}
        badge={<StatusBadge {...s} />}
        sub={<><Link to={`/pelanggan/${q.customerId}`} className="font-semibold text-ink hover:underline">{q.buyer.name}</Link> · {formatDate(q.date)} · sah hingga {formatDate(q.validUntil)} · <Money value={q.total} className="font-semibold text-ink" /></>}
        actions={
          <>
            <ActionLink to={`/cetak/sebut-harga/${q.id}`} icon="printer">Cetak / PDF</ActionLink>
            <ActionLink to={waLink(q.buyer.phone, quotationMessage(q))} icon="chat" external>WhatsApp</ActionLink>
            {!converted && <ActionLink to={`/sebut-harga/${q.id}/ubah`} icon="edit">Ubah</ActionLink>}
            {!converted && (
              <Button onClick={doConvert} disabled={convert.isPending}>
                <Icon name="convert" className="h-4 w-4" /> Tukar ke invois
              </Button>
            )}
            {converted && q.invoiceId && <ActionLink to={`/invois/${q.invoiceId}`} icon="file" primary>Lihat invois {q.invoiceNumber}</ActionLink>}
          </>
        }
      />

      {!converted && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-muted">Status:</span>
            {manualQuotationStatuses.map((st) => (
              <button
                key={st.value}
                onClick={() => setStatus.mutate({ id: q.id, status: st.value })}
                disabled={setStatus.isPending}
                className={cx('rounded-full border px-3 py-1 font-semibold transition', q.status === st.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-muted hover:text-ink')}
              >
                {st.label}
              </button>
            ))}
            {q.isExpired && <span className="text-xs text-expense">Tarikh sah telah lepas — ubah tarikh jika masih ditawarkan.</span>}
            {hasRole('Manager', 'Clerk') && (
              <button onClick={doDelete} className="ml-auto text-sm font-semibold text-expense hover:underline">Padam</button>
            )}
          </div>
        </Card>
      )}

      {!!actionError && <ErrorBox error={actionError} />}
      <Preview kind="quotation" doc={q} taxLabel={settings?.taxLabel ?? 'SST'} />
    </div>
  )
}

// ---------------------------------------------------------------- invois

export function InvoiceViewPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const { data: inv, isLoading, error } = useInvoice(id)
  const { data: settings } = useDocumentSettings()
  const { cancel } = useInvoiceMutations()
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!inv) return null

  const s = invoiceStatusView(inv)
  const cancelled = inv.status === 'Cancelled'
  const activePayments = inv.payments.filter((p) => !p.isVoided)
  const editable = !cancelled && activePayments.length === 0

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ViewHeader
        back="/invois"
        backLabel="Semua invois"
        number={inv.number}
        badge={<StatusBadge {...s} />}
        sub={<><Link to={`/pelanggan/${inv.customerId}`} className="font-semibold text-ink hover:underline">{inv.buyer.name}</Link> · {formatDate(inv.date)} · akhir bayaran {formatDate(inv.dueDate)}</>}
        actions={
          <>
            {!cancelled && inv.balance > 0 && (
              <Button onClick={() => setPaying(true)}>
                <Icon name="receipt" className="h-4 w-4" /> Terima bayaran
              </Button>
            )}
            <ActionLink to={`/cetak/invois/${inv.id}`} icon="printer">Cetak / PDF</ActionLink>
            <ActionLink to={waLink(inv.buyer.phone, invoiceMessage(inv))} icon="chat" external>WhatsApp</ActionLink>
            {editable && <ActionLink to={`/invois/${inv.id}/ubah`} icon="edit">Ubah</ActionLink>}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Jumlah', value: inv.total, cls: 'text-ink' },
          { label: 'Dibayar', value: inv.amountPaid, cls: 'text-income' },
          { label: 'Baki', value: inv.balance, cls: inv.balance > 0 ? (inv.isOverdue ? 'text-expense' : 'text-gold-600') : 'text-ink' },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{x.label}</div>
            <Money value={x.value} className={cx('mt-1 block text-base font-extrabold sm:text-xl', x.cls)} />
          </div>
        ))}
      </div>

      <Card
        title="Bayaran diterima"
        action={inv.quotationId ? <Link to={`/sebut-harga/${inv.quotationId}`} className="text-sm font-semibold text-brand-600 hover:underline">Dari {inv.quotationNumber}</Link> : undefined}
      >
        {inv.payments.length === 0 ? (
          <p className="text-sm text-muted">Belum ada bayaran.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {inv.payments.map((p) => (
              <li key={p.id}>
                <Link to={`/resit/${p.id}`} className={cx('flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-gray-50', p.isVoided && 'opacity-50')}>
                  <span>
                    <b>{p.number}</b> · {formatDate(p.date)} · {paymentMethodLabel(p.method)} · {p.accountName}
                    {p.isVoided && <span className="ml-2 text-xs text-expense">(batal)</span>}
                  </span>
                  <Money value={p.amount} tone={p.isVoided ? 'plain' : 'income'} className={cx('font-bold', p.isVoided && 'line-through')} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!cancelled && hasRole('Manager', 'Clerk') && (
          <div className="mt-3 border-t border-line pt-3 text-right">
            <button
              onClick={() => (activePayments.length ? alert('Batalkan resit dahulu sebelum membatalkan invois.') : setCancelling(true))}
              className="text-sm font-semibold text-expense hover:underline"
            >
              Batalkan invois
            </button>
          </div>
        )}
      </Card>

      <Preview kind="invoice" doc={inv} taxLabel={settings?.taxLabel ?? 'SST'} />

      <Modal open={paying} title="Terima bayaran" onClose={() => setPaying(false)}>
        {paying && <PaymentForm invoice={inv} onSaved={(r) => navigate(`/resit/${r.id}`)} onCancel={() => setPaying(false)} />}
      </Modal>
      <ReasonModal
        open={cancelling}
        title={`Batalkan ${inv.number}`}
        confirmLabel="Batalkan invois"
        busy={cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) => cancel.mutateAsync({ id: inv.id, reason }).then(() => undefined)}
      />
    </div>
  )
}

// ---------------------------------------------------------------- resit

export function ReceiptViewPage() {
  const id = Number(useParams().id)
  const { hasRole } = useAuth()
  const { data: r, isLoading, error } = useReceipt(id)
  const { data: settings } = useDocumentSettings()
  const m = useReceiptMutations()
  const [voiding, setVoiding] = useState(false)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!r) return null

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ViewHeader
        back={r.invoiceId ? `/invois/${r.invoiceId}` : '/resit'}
        backLabel={r.invoiceId ? `Invois ${r.invoiceNumber}` : 'Semua resit'}
        number={r.number}
        badge={r.isVoided ? <StatusBadge label="Batal" tone="expense" /> : <StatusBadge label="Diterima" tone="income" />}
        sub={<>{r.receivedFrom} · {formatDate(r.date)} · {paymentMethodLabel(r.method)} · {formatRM(r.amount)} ke {r.accountName}</>}
        actions={
          <>
            <ActionLink to={`/cetak/resit/${r.id}`} icon="printer" primary>Cetak A4 / PDF</ActionLink>
            <ActionLink to={`/cetak/resit/${r.id}?format=thermal`} icon="receipt">Resit kecil 80mm</ActionLink>
            {!r.isVoided && <ActionLink to={waLink(r.buyer.phone, receiptMessage(r))} icon="chat" external>WhatsApp</ActionLink>}
          </>
        }
      />

      {!r.isVoided && hasRole('Manager', 'Clerk') && (
        <div className="text-right">
          <button onClick={() => setVoiding(true)} className="text-sm font-semibold text-expense hover:underline">
            Batalkan resit
          </button>
          <p className="text-xs text-muted">Rekod duit masuk berkaitan akan dibuang dan baki invois dikira semula.</p>
        </div>
      )}

      <Preview kind="receipt" doc={r} taxLabel={settings?.taxLabel ?? 'SST'} />

      <ReasonModal
        open={voiding}
        title={`Batalkan ${r.number}`}
        confirmLabel="Batalkan resit"
        busy={m.void.isPending}
        onClose={() => setVoiding(false)}
        onConfirm={(reason) => m.void.mutateAsync({ id: r.id, reason }).then(() => undefined)}
      />
    </div>
  )
}

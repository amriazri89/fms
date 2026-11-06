import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccounts } from '../../api/hooks'
import { usePalmBatch, usePalmMutations } from '../../api/palmHooks'
import type { PalmBatch, PalmOwnerShare, PaymentMethod } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/Icon'
import { ReasonModal } from '../../components/ReasonModal'
import { StatusBadge } from '../../components/sales/common'
import { PayFields, fieldErrors } from '../../components/staff/common'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, Money, Spinner, cx } from '../../components/ui'
import { accountForBusiness, channelLabel } from '../../config/channels'
import { chargeMethodUnit, formatKg, palmStatus } from '../../config/palm'
import { paymentMethodLabel } from '../../config/sales'
import { formatDate, formatRM, today } from '../../lib/format'
import { ownerTickets, palmSlipMessage } from '../../lib/palmMessages'
import { waLink } from '../../lib/whatsapp'

/** Butiran bayaran kilang: sahkan, bayar setiap pemilik, slip. */
export default function PalmBatchPage() {
  const id = Number(useParams().id) || undefined
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const isManager = hasRole('Manager')
  const { data: b, isLoading, error } = usePalmBatch(id)
  const m = usePalmMutations()

  const [paying, setPaying] = useState<PalmOwnerShare | null>(null)
  const [voiding, setVoiding] = useState<PalmOwnerShare | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!b) return null

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e)
    }
  }
  const anyPaid = b.owners.some((o) => o.payout)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/sawit" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Agihan sawit
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{b.millName}</h1>
            <StatusBadge {...palmStatus[b.status]} />
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {[b.number, formatDate(b.date), b.businessUnitName, `${b.accountName} (${channelLabel(b.channel)})`, b.reference].filter(Boolean).join(' · ')}
          </p>
          {b.status === 'Cancelled' && b.cancelReason && <p className="text-sm text-expense">Dibatalkan: {b.cancelReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {b.status === 'Draft' && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/sawit/${b.id}/ubah`)}><Icon name="edit" className="h-4 w-4" /> Ubah</Button>
              <Button disabled={m.post.isPending || b.difference !== 0 || b.tickets.length === 0} onClick={() => run(() => m.post.mutateAsync(b.id))}>
                <Icon name="check" className="h-4 w-4" /> {m.post.isPending ? 'Mengesahkan…' : 'Sahkan'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.confirm(`Padam draf ${b.number}?`) && run(async () => { await m.remove.mutateAsync(b.id); navigate('/sawit') })}
              >
                <Icon name="trash" className="h-4 w-4" />
              </Button>
            </>
          )}
          {b.status === 'Posted' && isManager && !anyPaid && (
            <Button variant="secondary" disabled={m.reopen.isPending} onClick={() => run(() => m.reopen.mutateAsync(b.id))}>Buka semula untuk ubah</Button>
          )}
          {b.status !== 'Cancelled' && isManager && !anyPaid && (
            <Button variant="secondary" onClick={() => setCancelling(true)}>Batal</Button>
          )}
        </div>
      </div>

      {b.status === 'Draft' && b.difference !== 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-expense">
          Jumlah tiket ({formatRM(b.totalGross)}) belum sama dengan amaun kilang ({formatRM(b.amountReceived)}). Beza {formatRM(b.difference)}. Ubah tiket dahulu sebelum sahkan.
        </div>
      )}
      {b.status === 'Draft' && b.difference === 0 && (
        <div className="rounded-xl bg-gold-50 px-3 py-2 text-sm text-gold-600">Draf — belum direkod ke akaun. Tekan Sahkan bila semua tiket betul.</div>
      )}
      {!!actionError && <ErrorBox error={actionError} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Diterima dari kilang" value={b.amountReceived} />
        <Stat label="Caj (pendapatan)" value={b.totalCharges} cls="text-income" />
        <Stat label="Bahagian pemilik" value={b.totalNet} />
        <Stat label="Belum dibayar" value={b.status === 'Posted' ? b.unpaidToOwners : 0} cls={b.unpaidToOwners > 0 ? 'text-expense' : 'text-ink'} />
      </div>

      {b.chargeTotals.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {b.chargeTotals.map((c) => (
            <Badge key={c.chargeTypeId}>{c.name}: {formatRM(c.amount)}</Badge>
          ))}
          {b.totalWeightKg > 0 && <Badge>{formatKg(b.totalWeightKg)}</Badge>}
        </div>
      )}

      <Card title={`Pemilik (${b.owners.length})`}>
        <ul className="-mx-2 divide-y divide-line/60">
          {b.owners.map((o) => (
            <li key={o.ownerId} className="px-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === o.ownerId ? null : o.ownerId)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{o.ownerName}</span>
                    {b.status === 'Posted' && (o.payout ? <Badge tone="income">Sudah dibayar</Badge> : <Badge tone="gold">Belum dibayar</Badge>)}
                  </span>
                  <span className="block text-xs text-muted">
                    {o.ticketCount} tiket{o.weightKg > 0 ? ` · ${formatKg(o.weightKg)}` : ''} · Kilang {formatRM(o.gross)} · Caj −{formatRM(o.charges)}
                    {o.payout && ` · ${o.payout.number} · ${formatDate(o.payout.date)} · ${paymentMethodLabel(o.payout.method)}`}
                  </span>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Money value={o.net} className="text-base font-bold" />
                  <div className="flex flex-wrap justify-end gap-3 text-xs font-semibold">
                    {b.status === 'Posted' && !o.payout && o.net > 0 && (
                      <button className="text-brand-700 hover:underline" onClick={() => setPaying(o)}>Bayar</button>
                    )}
                    <Link to={`/cetak-sawit/${b.id}/${o.ownerId}`} className="text-brand-700 hover:underline">Slip</Link>
                    <a href={waLink(o.phone, palmSlipMessage(b, o))} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">WhatsApp</a>
                    {o.payout && isManager && (
                      <button className="text-muted hover:text-expense hover:underline" onClick={() => setVoiding(o)}>Batal bayaran</button>
                    )}
                  </div>
                </div>
              </div>
              {open === o.ownerId && <TicketTable batch={b} ownerId={o.ownerId} />}
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-muted">
        Bila disahkan: caj direkod sebagai Duit Masuk (pendapatan), dan bahagian pemilik direkod sebagai duit pemilik (bukan pendapatan).
        Bayaran kepada pemilik bukan belanja. Untuk ubah selepas disahkan, batalkan semua bayaran pemilik dahulu, kemudian Buka semula.
      </p>

      <Modal open={!!paying} title={`Bayar ${paying?.ownerName ?? ''}`} onClose={() => setPaying(null)}>
        {paying && <PayOwnerForm batch={b} share={paying} onDone={() => setPaying(null)} />}
      </Modal>
      <ReasonModal
        open={!!voiding}
        title={`Batal bayaran ${voiding?.payout?.number ?? ''}`}
        confirmLabel="Batal bayaran"
        busy={m.voidPayout.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={(reason) => m.voidPayout.mutateAsync({ id: voiding!.payout!.id, reason }).then(() => undefined)}
      />
      <ReasonModal
        open={cancelling}
        title={`Batal ${b.number}?`}
        confirmLabel="Batal bayaran kilang"
        busy={m.cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) => m.cancel.mutateAsync({ id: b.id, reason }).then(() => undefined)}
      />
    </div>
  )
}

function Stat({ label, value, cls = 'text-ink' }: { label: string; value: number; cls?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <Money value={value} className={cx('mt-1 block text-base font-extrabold sm:text-xl', cls)} />
    </div>
  )
}

function TicketTable({ batch, ownerId }: { batch: PalmBatch; ownerId: number }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl bg-gray-50 p-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th className="p-1">Tiket</th>
            <th className="p-1">Tarikh</th>
            <th className="p-1 text-right">Berat</th>
            <th className="p-1 text-right">Kilang</th>
            <th className="p-1">Caj</th>
            <th className="p-1 text-right">Bersih</th>
          </tr>
        </thead>
        <tbody>
          {ownerTickets(batch, ownerId).map((t) => (
            <tr key={t.id} className="border-t border-line/60 align-top">
              <td className="p-1">{t.ticketNo ?? '-'}</td>
              <td className="p-1">{formatDate(t.date)}</td>
              <td className="p-1 text-right">{t.weightKg > 0 ? formatKg(t.weightKg) : '-'}</td>
              <td className="p-1 text-right">{formatRM(t.gross)}{t.pricePerTonne != null && <span className="block text-muted">@ {formatRM(t.pricePerTonne)}/tan</span>}</td>
              <td className="p-1">
                {t.charges.map((c) => (
                  <span key={c.chargeTypeId} className="block">{c.name} ({c.rate} {chargeMethodUnit(c.method)}) −{formatRM(c.amount)}</span>
                ))}
              </td>
              <td className="p-1 text-right font-semibold">{formatRM(t.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PayOwnerForm({ batch, share, onDone }: { batch: PalmBatch; share: PalmOwnerShare; onDone: () => void }) {
  const { pay } = usePalmMutations()
  const { data: accounts = [] } = useAccounts()
  const [date, setDate] = useState(today())
  const [accountChosen, setAccountId] = useState<number | ''>('')
  // Lalai: akaun yang menerima duit kilang, atau akaun perniagaan itu
  const accountId = accountChosen || batch.accountId || accountForBusiness(accounts, batch.businessUnitId)?.id || ''
  const [method, setMethod] = useState<PaymentMethod>('BankTransfer')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!accountId) return setErrors({ accountId: 'Pilih akaun.' })
    try {
      await pay.mutateAsync({ batchId: batch.id, ownerId: share.ownerId, date, accountId: Number(accountId), method, reference: reference.trim() || null })
      onDone()
    } catch (ex) {
      setErrors(fieldErrors(ex))
      setFormError(ex)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-sm">
        <div className="font-semibold text-brand-700">{share.ownerName}</div>
        <div className="text-muted">
          {share.ticketCount} tiket · Kilang {formatRM(share.gross)} − caj {formatRM(share.charges)} = <b className="text-ink">{formatRM(share.net)}</b>
        </div>
        {share.bankInfo && <div className="mt-1 text-xs text-muted">Bank: {share.bankInfo}</div>}
      </div>
      <Field label="Tarikh bayar" required error={errors.date}>
        <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <PayFields accountId={accountId} onAccount={setAccountId} method={method} onMethod={setMethod} accountError={errors.accountId} />
      <Field label="No. rujukan" hint="Contoh: no. transaksi bank">
        <Input value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="Pilihan" />
      </Field>
      {errors.ownerId && <p className="text-sm text-expense">{errors.ownerId}</p>}
      {!!formError && <ErrorBox error={formError} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>Batal</Button>
        <Button type="submit" disabled={pay.isPending}>{pay.isPending ? 'Menyimpan…' : `Bayar ${formatRM(share.net)}`}</Button>
      </div>
    </form>
  )
}

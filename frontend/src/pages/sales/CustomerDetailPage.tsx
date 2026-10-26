import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCustomer, useCustomerMutations } from '../../api/salesHooks'
import type { CustomerActivityType } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/Icon'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { InvoiceRow, QuotationRow, ReceiptRow } from '../../components/sales/common'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Money, Segmented, Spinner, Textarea, cx } from '../../components/ui'
import { activityLabel, activityTypes } from '../../config/sales'
import { formatDate, today } from '../../lib/format'
import { waLink } from '../../lib/whatsapp'

type Tab = 'invoices' | 'quotations' | 'receipts'

export default function CustomerDetailPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const { data, isLoading, error } = useCustomer(id)
  const { addActivity, setDone, removeActivity, remove } = useCustomerMutations()
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<Tab>('invoices')

  const [type, setType] = useState<CustomerActivityType>('Call')
  const [note, setNote] = useState('')
  const [actDate, setActDate] = useState(today())
  const [followUp, setFollowUp] = useState('')
  const [actError, setActError] = useState<unknown>(null)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!data) return null
  const c = data.customer

  const submitActivity = async (e: FormEvent) => {
    e.preventDefault()
    setActError(null)
    if (!note.trim()) return
    try {
      await addActivity.mutateAsync({ customerId: id, input: { date: actDate, type, note: note.trim(), followUpDate: followUp || null } })
      setNote('')
      setFollowUp('')
    } catch (err) {
      setActError(err)
    }
  }

  const doDelete = async () => {
    if (!window.confirm(`Padam ${c.name}? Jika pelanggan ini ada dokumen, ia hanya akan dinyahaktifkan.`)) return
    await remove.mutateAsync(id)
    navigate('/pelanggan')
  }

  const t = today()

  return (
    <div className="space-y-4">
      <Link to="/pelanggan" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Semua pelanggan
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">
            {c.name} {c.tag && <Badge>{c.tag}</Badge>} {!c.isActive && <Badge tone="expense">Tidak aktif</Badge>}
          </h1>
          {c.contactPerson && <p className="text-sm text-muted">u.p. {c.contactPerson}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone && (
            <>
              <a href={`tel:${c.phone}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold hover:bg-brand-50">
                <Icon name="phone" className="h-4 w-4" /> Telefon
              </a>
              <a href={waLink(c.phone, `Assalamualaikum ${c.contactPerson || c.name}, `)} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold hover:bg-brand-50">
                <Icon name="chat" className="h-4 w-4" /> WhatsApp
              </a>
            </>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Icon name="edit" className="h-4 w-4" /> Ubah
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Jumlah invois', value: data.totalInvoiced, cls: 'text-ink' },
          { label: 'Telah dibayar', value: data.totalPaid, cls: 'text-income' },
          { label: 'Belum dibayar', value: data.outstanding, cls: data.outstanding > 0 ? 'text-expense' : 'text-ink' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.label}</div>
            <Money value={s.value} className={cx('mt-1 block text-base font-extrabold sm:text-xl', s.cls)} />
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Link to={`/sebut-harga/baru?pelanggan=${id}`} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold hover:bg-brand-50">
          <Icon name="quote" className="h-4 w-4" /> Sebut harga baru
        </Link>
        <Link to={`/invois/baru?pelanggan=${id}`} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold hover:bg-brand-50">
          <Icon name="file" className="h-4 w-4" /> Invois baru
        </Link>
        <Link to={`/resit/baru?pelanggan=${id}`} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700">
          <Icon name="receipt" className="h-4 w-4" /> Terima bayaran
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <div className="mb-3">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { key: 'invoices', label: `Invois (${data.invoices.length})` },
                  { key: 'quotations', label: `Sebut harga (${data.quotations.length})` },
                  { key: 'receipts', label: `Resit (${data.payments.length})` },
                ]}
              />
            </div>
            <div className="-mx-2 divide-y divide-line/60">
              {tab === 'invoices' && (data.invoices.length ? data.invoices.map((i) => <InvoiceRow key={i.id} i={i} showCustomer={false} />) : <Empty>Tiada invois.</Empty>)}
              {tab === 'quotations' && (data.quotations.length ? data.quotations.map((q) => <QuotationRow key={q.id} q={q} showCustomer={false} />) : <Empty>Tiada sebut harga.</Empty>)}
              {tab === 'receipts' && (data.payments.length ? data.payments.map((p) => <ReceiptRow key={p.id} p={p} showCustomer={false} />) : <Empty>Tiada resit.</Empty>)}
            </div>
          </Card>

          <Card title="Maklumat">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Telefon</dt><dd>{c.phone || '—'}</dd>
              <dt className="text-muted">E-mel</dt><dd className="break-all">{c.email || '—'}</dd>
              <dt className="text-muted">Alamat</dt><dd className="whitespace-pre-line">{c.address || '—'}</dd>
              <dt className="text-muted">No. SSM</dt><dd>{c.registrationNo || '—'}</dd>
              {c.notes && (<><dt className="text-muted">Catatan</dt><dd className="whitespace-pre-line">{c.notes}</dd></>)}
              <dt className="text-muted">Didaftar</dt><dd>{formatDate(c.createdAt)}</dd>
            </dl>
            {hasRole('Manager', 'Clerk') && (
              <button onClick={doDelete} className="mt-4 text-sm font-semibold text-expense hover:underline">Padam pelanggan</button>
            )}
          </Card>
        </div>

        <Card title="Aktiviti & susulan" className="lg:col-span-2">
          <form onSubmit={submitActivity} className="mb-4 space-y-3 rounded-xl bg-gray-50 p-3">
            <div className="flex flex-wrap gap-1">
              {activityTypes.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setType(a.value)}
                  className={cx('rounded-full px-3 py-1 text-xs font-semibold', type === a.value ? 'bg-brand-600 text-white' : 'bg-white text-muted hover:text-ink')}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Apa yang dibincang?" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tarikh">
                <Input type="date" value={actDate} onChange={(e) => setActDate(e.target.value)} />
              </Field>
              <Field label="Susulan pada (pilihan)">
                <Input type="date" value={followUp} min={actDate} onChange={(e) => setFollowUp(e.target.value)} />
              </Field>
            </div>
            {!!actError && <ErrorBox error={actError} />}
            <Button type="submit" disabled={!note.trim() || addActivity.isPending} className="w-full">Simpan catatan</Button>
          </form>

          {data.activities.length === 0 ? (
            <Empty>Belum ada catatan.</Empty>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-line pl-4">
              {data.activities.map((a) => {
                const pending = a.followUpDate && !a.followUpDone
                return (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                    <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                      <span><b className="text-ink">{activityLabel(a.type)}</b> · {formatDate(a.date)} · {a.createdBy}</span>
                      <button onClick={() => window.confirm('Padam catatan ini?') && removeActivity.mutate(a.id)} className="text-muted hover:text-expense" aria-label="Padam">
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{a.note}</p>
                    {a.followUpDate && (
                      <label className={cx('mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold',
                        a.followUpDone ? 'bg-gray-100 text-muted line-through' : a.followUpDate < t ? 'bg-red-50 text-expense' : 'bg-gold-50 text-gold-600')}>
                        <input type="checkbox" className="accent-brand-600" checked={a.followUpDone} onChange={(e) => setDone.mutate({ id: a.id, done: e.target.checked })} />
                        Susulan {formatDate(a.followUpDate)}{pending && a.followUpDate < t ? ' (lewat)' : ''}
                      </label>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
      </div>

      <CustomerFormModal open={editing} existing={c} onClose={() => setEditing(false)} />
    </div>
  )
}

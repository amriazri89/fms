import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSupplier, useSupplierMutations } from '../../api/payableHooks'
import { Icon } from '../../components/Icon'
import { PayablePaymentRow, PayableRow } from '../../components/payables/common'
import { SupplierFormModal } from '../../components/payables/SupplierFormModal'
import { ActionLink } from '../../components/ViewParts'
import { Badge, Button, Card, ErrorBox, Money, Spinner, cx } from '../../components/ui'
import { formatRM } from '../../lib/format'
import { waLink } from '../../lib/whatsapp'

export default function SupplierDetailPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { data, isLoading, error } = useSupplier(id)
  const { remove } = useSupplierMutations()
  const [editing, setEditing] = useState(false)
  const [actionError, setActionError] = useState<unknown>(null)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!data) return null
  const s = data.supplier
  const open = data.payables.filter((p) => p.status === 'Unpaid' || p.status === 'PartiallyPaid')
  const others = data.payables.filter((p) => !(p.status === 'Unpaid' || p.status === 'PartiallyPaid'))

  const doDelete = async () => {
    const msg = data.payables.length
      ? `${s.name} ada rekod hutang, jadi ia akan dinyahaktifkan (tidak dipadam). Teruskan?`
      : `Padam ${s.name}?`
    if (!window.confirm(msg)) return
    try {
      await remove.mutateAsync(s.id)
      navigate('/pembekal', { replace: true })
    } catch (e) {
      setActionError(e)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/pembekal" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Semua pembekal
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">
            {s.name} {s.tag && <Badge>{s.tag}</Badge>} {!s.isActive && <Badge tone="expense">Tidak aktif</Badge>}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{[s.contactPerson, s.phone, s.email].filter(Boolean).join(' · ') || 'Tiada maklumat hubungan'}</p>
          {s.address && <p className="text-sm text-muted">{s.address}</p>}
          {s.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink">{s.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionLink to={`/hutang/baru?pembekal=${s.id}`} icon="plus" primary>Rekod hutang</ActionLink>
          {s.phone && <ActionLink to={waLink(s.phone, '')} icon="chat" external>WhatsApp</ActionLink>}
          <Button variant="secondary" onClick={() => setEditing(true)}><Icon name="edit" className="h-4 w-4" /> Ubah</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Jumlah hutang', value: data.totalAmount, cls: 'text-ink' },
          { label: 'Sudah dibayar', value: data.totalPaid, cls: 'text-income' },
          { label: 'Baki', value: data.outstanding, cls: data.outstanding > 0 ? 'text-expense' : 'text-ink' },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{x.label}</div>
            <Money value={x.value} className={cx('mt-1 block text-base font-extrabold sm:text-xl', x.cls)} />
          </div>
        ))}
      </div>

      <Card title={`Belum lunas (${open.length})`}>
        {open.length === 0 ? <p className="text-sm text-muted">Tiada hutang tertunggak dengan {s.name}.</p> : (
          <div className="-mx-2 divide-y divide-line/60">{open.map((p) => <PayableRow key={p.id} p={p} showSupplier={false} />)}</div>
        )}
      </Card>

      {data.payments.length > 0 && (
        <Card title="Sejarah bayaran" action={<span className="text-sm text-muted">{formatRM(data.payments.filter((x) => !x.isVoided).reduce((a, x) => a + x.amount + x.interestAmount, 0))}</span>}>
          <div className="-mx-2 divide-y divide-line/60">{data.payments.map((x) => <PayablePaymentRow key={x.id} x={x} showPayable />)}</div>
        </Card>
      )}

      {others.length > 0 && (
        <Card title="Lunas / batal">
          <div className="-mx-2 divide-y divide-line/60">{others.map((p) => <PayableRow key={p.id} p={p} showSupplier={false} />)}</div>
        </Card>
      )}

      {!!actionError && <ErrorBox error={actionError} />}
      <div className="text-right">
        <button onClick={doDelete} className="text-sm font-semibold text-expense hover:underline">
          {data.payables.length ? 'Nyahaktif pembekal' : 'Padam pembekal'}
        </button>
      </div>

      <SupplierFormModal open={editing} existing={s} onClose={() => setEditing(false)} />
    </div>
  )
}

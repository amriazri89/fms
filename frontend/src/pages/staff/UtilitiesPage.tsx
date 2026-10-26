import { useState, type FormEvent } from 'react'
import { useBusinessUnits, useCategories } from '../../api/hooks'
import { useUtilities, useUtilityMutations } from '../../api/staffHooks'
import type { PaymentMethod, UtilityBill, UtilityType } from '../../api/types'
import { Icon } from '../../components/Icon'
import { ReasonModal } from '../../components/ReasonModal'
import { ChipFilter, StatusBadge } from '../../components/sales/common'
import { ListRow, PayFields, TotalBar, fieldErrors, moneyInput } from '../../components/staff/common'
import { Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui'
import { paymentMethodLabel } from '../../config/sales'
import { expenseCategoriesFor, formatPeriod, pickCategory, thisMonth, utilityLabel, utilityTypes } from '../../config/staff'
import { parseNum } from '../../lib/documentMath'
import { addDays, formatDate, today } from '../../lib/format'

const filters = [
  { key: 'unpaid', label: 'Belum bayar' },
  { key: 'overdue', label: 'Lewat' },
  { key: 'paid', label: 'Sudah bayar' },
  { key: '', label: 'Semua' },
]

/** Manage Utility Expenses: elektrik, air, internet, sewa premis ... */
export default function UtilitiesPage() {
  const [status, setStatus] = useState('unpaid')
  const { data, isLoading, error } = useUtilities({ status: status || undefined })
  const [editing, setEditing] = useState<UtilityBill | 'new' | null>(null)
  const [paying, setPaying] = useState<UtilityBill | null>(null)
  const [unpaying, setUnpaying] = useState<UtilityBill | null>(null)
  const m = useUtilityMutations()

  return (
    <div className="space-y-4">
      <PageHeader title="Bil utiliti" subtitle="Elektrik, air, internet, telefon dan sewa premis. Bil dikira belanja pada hari dibayar."
        actions={<Button onClick={() => setEditing('new')}><Icon name="plus" className="h-4 w-4" /> Rekod bil</Button>} />
      <ChipFilter value={status} onChange={setStatus} options={filters} />
      {data && <TotalBar count={data.count} total={data.total} label="bil" />}
      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data?.items.length === 0 && <Empty>{status === 'unpaid' ? 'Semua bil sudah dibayar. 👍' : 'Tiada bil.'}</Empty>}
        <div className="-mx-2 divide-y divide-line/60">
          {data?.items.map((u) => (
            <ListRow
              key={u.id}
              onClick={u.status === 'Unpaid' ? () => setEditing(u) : undefined}
              title={`${utilityLabel(u.type)}${u.provider ? ` · ${u.provider}` : ''}`}
              badges={<StatusBadge {...(u.status === 'Paid' ? { label: 'Sudah bayar', tone: 'income' as const } : u.isOverdue ? { label: 'Lewat', tone: 'expense' as const } : { label: 'Belum bayar', tone: 'gold' as const })} />}
              sub={[u.number, `Untuk ${formatPeriod(u.periodMonth)}`, u.businessUnitName,
                u.status === 'Paid' ? `Dibayar ${formatDate(u.paidDate!)} · ${u.paidAccountName}` : `Akhir ${formatDate(u.dueDate)}`].join(' · ')}
              amount={u.amount}
              right={
                u.status === 'Unpaid'
                  ? <button onClick={(e) => { e.stopPropagation(); setPaying(u) }} className="text-xs font-semibold text-brand-600 hover:underline">Bayar</button>
                  : <button onClick={() => setUnpaying(u)} className="text-xs font-semibold text-expense hover:underline">Batal bayaran</button>
              }
            />
          ))}
        </div>
      </Card>
      <Modal open={!!editing} title={editing === 'new' ? 'Rekod bil utiliti' : 'Ubah bil utiliti'} onClose={() => setEditing(null)}>
        {editing && <UtilityForm existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!paying} title={`Bayar ${paying?.number ?? ''}`} onClose={() => setPaying(null)}>
        {paying && <PayUtilityForm bill={paying} onDone={() => setPaying(null)} />}
      </Modal>
      <ReasonModal
        open={!!unpaying}
        title={`Batal bayaran ${unpaying?.number ?? ''}`}
        confirmLabel="Batal bayaran"
        busy={m.unpay.isPending}
        onClose={() => setUnpaying(null)}
        onConfirm={(reason) => m.unpay.mutateAsync({ id: unpaying!.id, reason }).then(() => undefined)}
      />
    </div>
  )
}

function UtilityForm({ existing, onDone }: { existing?: UtilityBill; onDone: () => void }) {
  const { save, remove } = useUtilityMutations()
  const { data: units = [] } = useBusinessUnits()
  const { data: categories = [] } = useCategories()
  const [type, setType] = useState<UtilityType>(existing?.type ?? 'Electricity')
  const [provider, setProvider] = useState(existing?.provider ?? '')
  const [accountNo, setAccountNo] = useState(existing?.accountNo ?? '')
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>(existing?.businessUnitId ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(existing?.categoryId ?? '')
  const [billDate, setBillDate] = useState(existing?.billDate ?? today())
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today(), 21))
  const [periodMonth, setPeriodMonth] = useState(existing?.periodMonth ?? thisMonth())
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [paidNow, setPaidNow] = useState(false)
  const [accountId, setAccountId] = useState<number | ''>('')
  const [method, setMethod] = useState<PaymentMethod>('BankTransfer')
  const [error, setError] = useState<unknown>(null)
  const errs = fieldErrors(error)

  const cats = expenseCategoriesFor(categories, businessUnitId)
  const typeCfg = utilityTypes.find((t) => t.value === type)!
  const effectiveCategory = categoryId || pickCategory(cats, typeCfg.match, businessUnitId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          type, provider: provider.trim() || null, accountNo: accountNo.trim() || null, businessUnitId: Number(businessUnitId), categoryId: Number(effectiveCategory),
          billDate, dueDate, periodMonth, amount: parseNum(amount), notes: notes.trim() || null,
          payNow: !existing && paidNow ? { paidDate: billDate > today() ? today() : billDate, accountId: Number(accountId), method, reference: null } : null,
        },
      })
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  const del = async () => {
    if (!existing || !window.confirm(`Padam bil ${existing.number}?`)) return
    try {
      await remove.mutateAsync(existing.id)
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Jenis bil" required>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {utilityTypes.map((t) => (
            <button key={t.value} type="button" onClick={() => { setType(t.value); setCategoryId('') }}
              className={cx('min-h-[44px] rounded-xl border px-2 text-sm font-semibold', type === t.value ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-line bg-white')}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Syarikat / pembekal" hint={typeCfg.hint}><Input value={provider} maxLength={100} onChange={(e) => setProvider(e.target.value)} /></Field>
        <Field label="No. akaun bil"><Input value={accountNo} maxLength={50} onChange={(e) => setAccountNo(e.target.value)} /></Field>
        <Field label="Perniagaan" required error={errs.businessUnitId}>
          <Select value={businessUnitId} onChange={(e) => { setBusinessUnitId(e.target.value ? Number(e.target.value) : ''); setCategoryId('') }}>
            <option value="">— Pilih —</option>
            {units.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Kategori belanja" required error={errs.categoryId}>
          <Select value={effectiveCategory} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Pilih —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Jumlah bil (RM)" required error={errs.amount}>
          <Input inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(moneyInput(e.target.value))} className="font-bold tabular-nums" />
        </Field>
        <Field label="Bil untuk bulan" required error={errs.periodMonth}><Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} /></Field>
        <Field label="Tarikh bil" required error={errs.billDate}><Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></Field>
        <Field label="Tarikh akhir bayar" required error={errs.dueDate}><Input type="date" value={dueDate} min={billDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
      {!existing && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} /> Bil ini sudah dibayar
          </label>
          {paidNow && <div className="grid gap-4 sm:grid-cols-2"><PayFields accountId={accountId} onAccount={setAccountId} method={method} onMethod={setMethod} accountError={errs.accountId} /></div>}
        </div>
      )}
      <Field label="Catatan"><Textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></Field>
      {!!error && <ErrorBox error={error} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {existing ? <Button type="button" variant="ghost" className="text-expense" onClick={del}>Padam</Button> : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onDone}>Batal</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </form>
  )
}

function PayUtilityForm({ bill, onDone }: { bill: UtilityBill; onDone: () => void }) {
  const { pay } = useUtilityMutations()
  const [paidDate, setPaidDate] = useState(today())
  const [accountId, setAccountId] = useState<number | ''>('')
  const [method, setMethod] = useState<PaymentMethod>('BankTransfer')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<unknown>(null)
  const errs = fieldErrors(error)
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await pay.mutateAsync({ id: bill.id, input: { paidDate, accountId: Number(accountId), method, reference: reference.trim() || null } })
          onDone()
        } catch (err) {
          setError(err)
        }
      }}
    >
      <div className="rounded-xl bg-gold-50 p-3 text-sm">
        <b>{utilityLabel(bill.type)}{bill.provider ? ` · ${bill.provider}` : ''}</b> untuk {formatPeriod(bill.periodMonth)} · {bill.businessUnitName}
        <div className="text-lg font-extrabold">RM{bill.amount.toFixed(2)}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PayFields accountId={accountId} onAccount={setAccountId} method={method} onMethod={setMethod} accountError={errs.accountId} />
        <Field label="Tarikh bayar" required error={errs.paidDate}><Input type="date" value={paidDate} max={today()} onChange={(e) => setPaidDate(e.target.value)} /></Field>
        <Field label="No. rujukan"><Input value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="Pilihan" /></Field>
      </div>
      <p className="text-xs text-muted">Rekod Duit Keluar ({paymentMethodLabel(method)}) akan dicipta dan dikira sebagai belanja.</p>
      {!!error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Batal</Button>
        <Button type="submit" disabled={pay.isPending}>Simpan bayaran</Button>
      </div>
    </form>
  )
}

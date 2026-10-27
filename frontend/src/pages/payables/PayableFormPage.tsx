import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAccounts, useBusinessUnits, useCategories } from '../../api/hooks'
import { usePayable, usePayableMutations, useSuppliers } from '../../api/payableHooks'
import type { MoneyChannel, PayableKind } from '../../api/types'
import { ChannelPicker } from '../../components/ChannelPicker'
import { Icon } from '../../components/Icon'
import { SupplierFormModal } from '../../components/payables/SupplierFormModal'
import { Button, Card, ErrorBox, Field, Input, Select, Spinner, Textarea, cx } from '../../components/ui'
import { defaultBillTermDays, payableKinds } from '../../config/payables'
import { parseNum } from '../../lib/documentMath'
import { addDays, today } from '../../lib/format'
import { accountForBusiness } from '../../config/channels'

export default function PayableFormPage() {
  const params = useParams()
  const id = params.id ? Number(params.id) : undefined
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const existing = usePayable(id)
  const { data: suppliers = [] } = useSuppliers()
  const { data: units = [] } = useBusinessUnits()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { save } = usePayableMutations()

  const [kind, setKind] = useState<PayableKind>(search.get('jenis') === 'pinjaman' ? 'Loan' : 'Bill')
  const [supplierId, setSupplierId] = useState<number | ''>(Number(search.get('pembekal')) || '')
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [date, setDate] = useState(today())
  const [dueDate, setDueDate] = useState(addDays(today(), defaultBillTermDays))
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [installment, setInstallment] = useState('')
  const [notes, setNotes] = useState('')
  const [moneyIn, setMoneyIn] = useState(true)
  const [receivedChannel, setReceivedChannel] = useState<MoneyChannel | null>('Bank')
  const [receivedAccountChosen, setReceivedAccountId] = useState<number | ''>('')
  // Satu akaun bagi setiap perniagaan: dipilih sendiri, masih boleh ditukar
  const receivedAccountId = receivedAccountChosen || accountForBusiness(accounts, businessUnitId || null)?.id || ''
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)
  const [addingSupplier, setAddingSupplier] = useState(false)

  const p = existing.data
  useEffect(() => {
    if (!p) return
    setKind(p.kind)
    setSupplierId(p.supplierId)
    setBusinessUnitId(p.businessUnitId)
    setCategoryId(p.categoryId ?? '')
    setDate(p.date)
    setDueDate(p.dueDate)
    setDescription(p.description)
    setReference(p.supplierReference ?? '')
    setAmount(String(p.amount))
    setInstallment(p.installmentAmount ? String(p.installmentAmount) : '')
    setNotes(p.notes ?? '')
    setMoneyIn(!!p.receivedAccountId)
    setReceivedAccountId(p.receivedAccountId ?? '')
    setReceivedChannel(p.receivedChannel ?? 'Bank')
  }, [p])

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'Expense' && c.isActive && (c.businessUnitId === null || c.businessUnitId === businessUnitId)),
    [categories, businessUnitId],
  )

  if (id && existing.isLoading) return <Spinner />
  if (id && existing.error) return <ErrorBox error={existing.error} />
  const locked = !!p && (p.status === 'Cancelled' || p.payments.some((x) => !x.isVoided))

  const isLoan = kind === 'Loan'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const err: Record<string, string> = {}
    const amt = parseNum(amount)
    if (!supplierId) err.supplierId = 'Pilih pembekal / pemiutang.'
    if (!businessUnitId) err.businessUnitId = 'Pilih perniagaan.'
    if (!isLoan && !categoryId) err.categoryId = 'Pilih kategori belanja.'
    if (!description.trim()) err.description = 'Nyatakan perkara.'
    if (amt <= 0) err.amount = 'Masukkan jumlah.'
    if (dueDate < date) err.dueDate = 'Mesti sama atau selepas tarikh hutang.'
    if (isLoan && moneyIn && !receivedAccountId) err.receivedAccountId = 'Pilih akaun yang menerima duit.'
    if (isLoan && moneyIn && !receivedChannel) err.receivedChannel = 'Pilih Tunai atau Bank.'
    setErrors(err)
    if (Object.keys(err).length) return

    try {
      const saved = await save.mutateAsync({
        id,
        input: {
          kind,
          supplierId: Number(supplierId),
          businessUnitId: Number(businessUnitId),
          categoryId: isLoan ? null : Number(categoryId),
          date,
          dueDate,
          description: description.trim(),
          supplierReference: reference.trim() || null,
          amount: amt,
          installmentAmount: isLoan && installment ? parseNum(installment) : null,
          notes: notes.trim() || null,
          receivedAccountId: isLoan && moneyIn ? Number(receivedAccountId) : null,
          receivedChannel: isLoan && moneyIn ? receivedChannel : null,
        },
      })
      navigate(`/hutang/${saved.id}`, { replace: true })
    } catch (ex) {
      if (ex instanceof ApiError) setErrors(Object.fromEntries(Object.entries(ex.fieldErrors).map(([k, v]) => [k, v[0]])))
      setFormError(ex)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to={id ? `/hutang/${id}` : '/hutang'} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Kembali
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">{id ? `Ubah ${p?.number ?? ''}` : 'Rekod hutang'}</h1>

      {locked ? (
        <ErrorBox error={new Error('Hutang ini sudah ada bayaran atau telah dibatalkan. Batalkan bayaran dahulu jika perlu ubah.')} />
      ) : (
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Jenis hutang">
              <div className="grid grid-cols-2 gap-2">
                {payableKinds.map((k) => (
                  <button type="button" key={k.value} disabled={!!id} onClick={() => setKind(k.value)}
                    className={cx('rounded-xl border p-3 text-left transition disabled:cursor-not-allowed',
                      kind === k.value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line bg-white hover:bg-gray-50', !!id && kind !== k.value && 'opacity-40')}>
                    <span className="block text-sm font-bold text-ink">{k.label}</span>
                    <span className="block text-xs text-muted">{k.help}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={isLoan ? 'Pemberi pinjaman' : 'Pembekal'} required error={errors.supplierId}>
              <div className="flex gap-2">
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')} className="flex-1">
                  <option value="">— Pilih —</option>
                  {suppliers.filter((s) => s.isActive || s.id === supplierId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Button type="button" variant="secondary" onClick={() => setAddingSupplier(true)} title="Tambah pembekal"><Icon name="plus" className="h-4 w-4" /></Button>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Perniagaan" required error={errors.businessUnitId}>
                <Select value={businessUnitId} onChange={(e) => { setBusinessUnitId(e.target.value ? Number(e.target.value) : ''); setCategoryId('') }}>
                  <option value="">— Pilih —</option>
                  {units.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
              {!isLoan && (
                <Field label="Kategori belanja" required error={errors.categoryId} hint="Digunakan bila bil dibayar">
                  <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">{businessUnitId ? '— Pilih —' : '— Pilih perniagaan dahulu —'}</option>
                    {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              )}
            </div>

            <Field label="Perkara" required error={errors.description}>
              <Input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)}
                placeholder={isLoan ? 'Contoh: Pinjaman modal kebun' : 'Contoh: Baja NPK 30 beg'} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={isLoan ? 'Jumlah pinjaman (RM)' : 'Jumlah bil (RM)'} required error={errors.amount}>
                <Input inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} className="text-xl font-bold tabular-nums" />
              </Field>
              <Field label={isLoan ? 'No. akaun pinjaman' : 'No. bil / invois pembekal'}>
                <Input value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="Pilihan" />
              </Field>
              <Field label={isLoan ? 'Tarikh pinjam' : 'Tarikh bil'} required error={errors.date}>
                <Input type="date" value={date} onChange={(e) => {
                  setDate(e.target.value)
                  if (!isLoan && !id) setDueDate(addDays(e.target.value, defaultBillTermDays))
                }} />
              </Field>
              <Field label={isLoan ? 'Tarikh tamat pinjaman' : 'Tarikh akhir bayar'} required error={errors.dueDate}>
                <Input type="date" value={dueDate} min={date} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              {isLoan && (
                <Field label="Ansuran bulanan (RM)" hint="Untuk rujukan & nilai lalai semasa bayar">
                  <Input inputMode="decimal" value={installment} placeholder="Pilihan" onChange={(e) => setInstallment(e.target.value.replace(/[^\d.,]/g, ''))} />
                </Field>
              )}
            </div>

            {isLoan && (
              <div className="space-y-3 rounded-xl border border-line p-3">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-600" checked={moneyIn} onChange={(e) => setMoneyIn(e.target.checked)} />
                  <span>
                    <b className="text-ink">Duit pinjaman masuk ke akaun perniagaan</b>
                    <span className="block text-muted">Rekod “Pinjaman diterima” akan dibuat (menambah baki akaun, bukan pendapatan). Nyahtanda jika pinjaman ini diambil sebelum mula guna sistem.</span>
                  </span>
                </label>
                {moneyIn && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Masuk ke akaun" required error={errors.receivedAccountId}>
                      <Select value={receivedAccountId} onChange={(e) => setReceivedAccountId(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">— Pilih akaun —</option>
                        {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Tunai / Bank" required error={errors.receivedChannel}>
                      <ChannelPicker value={receivedChannel} onChange={setReceivedChannel} />
                    </Field>
                  </div>
                )}
              </div>
            )}

            <Field label="Catatan">
              <Textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            {!isLoan && (
              <p className="rounded-xl bg-gray-50 p-3 text-xs text-muted">
                Bil ini <b>belum</b> dikira sebagai belanja. Ia dikira belanja pada hari anda rekod bayaran.
              </p>
            )}

            {!!formError && <ErrorBox error={formError} />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Batal</Button>
              <Button type="submit" disabled={save.isPending} className="sm:min-w-[140px]">{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </form>
        </Card>
      )}

      <SupplierFormModal open={addingSupplier} onClose={() => setAddingSupplier(false)} onSaved={(s) => setSupplierId(s.id)} />
    </div>
  )
}

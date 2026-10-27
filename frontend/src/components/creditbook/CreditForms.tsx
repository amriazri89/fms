import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useCreditBook, useCreditBookMutations } from '../../api/creditBookHooks'
import { useAccounts, useBusinessUnits, useCategories } from '../../api/hooks'
import { useCustomers } from '../../api/salesHooks'
import type { CreditLedger, PaymentMethod, Receipt } from '../../api/types'
import { paymentMethods } from '../../config/sales'
import { parseNum } from '../../lib/documentMath'
import { formatRM, today } from '../../lib/format'
import { CustomerFormModal } from '../sales/CustomerFormModal'
import { Button, ErrorBox, Field, Input, Select, cx } from '../ui'
import { accountForBusiness } from '../../config/channels'

const LAST_UNIT_KEY = 'fms.creditBook.lastUnit'
const readLastUnit = () => {
  try {
    return Number(localStorage.getItem(LAST_UNIT_KEY)) || null
  } catch {
    return null
  }
}
const saveLastUnit = (id: number) => {
  try {
    localStorage.setItem(LAST_UNIT_KEY, String(id))
  } catch {
    /* storage tidak tersedia */
  }
}

const fieldErrors = (ex: unknown) =>
  ex instanceof ApiError ? Object.fromEntries(Object.entries(ex.fieldErrors).map(([k, v]) => [k, v[0]])) : {}

/**
 * Pelanggan ambil barang → rekod hutang dalam buku 555.
 * Jika customerId / businessUnitId diberi (dari lejar), medan itu tidak dipapar.
 */
export function CreditEntryForm({
  customerId: fixedCustomerId,
  businessUnitId: fixedBusinessUnitId,
  onSaved,
  onCancel,
}: {
  customerId?: number
  businessUnitId?: number
  onSaved: (ledger: CreditLedger) => void
  onCancel: () => void
}) {
  const { data: units = [] } = useBusinessUnits()
  const { data: customers = [] } = useCustomers()
  const { addEntry } = useCreditBookMutations()

  const [customerId, setCustomerId] = useState<number | ''>(fixedCustomerId ?? '')
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>(fixedBusinessUnitId ?? '')
  const { data: book } = useCreditBook({ includeSettled: true })
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)

  // Perniagaan lalai (tidak di-hardcode): pilihan terakhir pengguna, atau perniagaan yang paling banyak
  // digunakan dalam buku hutang (biasanya Kedai Runcit), atau satu-satunya perniagaan. Masih boleh ditukar.
  const defaultUnitId = useMemo(() => {
    const active = new Set(units.map((u) => u.id))
    const last = readLastUnit()
    if (last && active.has(last)) return last
    const counts = new Map<number, number>()
    for (const r of book?.rows ?? []) if (active.has(r.businessUnitId)) counts.set(r.businessUnitId, (counts.get(r.businessUnitId) ?? 0) + 1)
    const mostUsed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return mostUsed ?? (units.length === 1 ? units[0].id : '')
  }, [units, book])
  useEffect(() => {
    if (!fixedBusinessUnitId && businessUnitId === '' && defaultUnitId) setBusinessUnitId(defaultUnitId)
  }, [fixedBusinessUnitId, businessUnitId, defaultUnitId])
  const effectiveUnitId = businessUnitId || defaultUnitId

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const err: Record<string, string> = {}
    const amt = parseNum(amount)
    if (!customerId) err.customerId = 'Pilih pelanggan.'
    if (!effectiveUnitId) err.businessUnitId = 'Pilih perniagaan.'
    if (!description.trim()) err.description = 'Tulis barang yang diambil.'
    if (amt <= 0) err.amount = 'Masukkan jumlah.'
    setErrors(err)
    if (Object.keys(err).length) return

    try {
      const ledger = await addEntry.mutateAsync({
        customerId: Number(customerId),
        businessUnitId: Number(effectiveUnitId),
        date,
        description: description.trim(),
        amount: amt,
      })
      saveLastUnit(Number(effectiveUnitId))
      onSaved(ledger)
    } catch (ex) {
      setErrors(fieldErrors(ex))
      setFormError(ex)
    }
  }

  return (
    <>
    <form onSubmit={submit} className="space-y-4">
      {!fixedCustomerId && (
        <Field label="Pelanggan" required error={errors.customerId}>
          <div className="flex gap-2">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Pilih pelanggan —</option>
              {customers.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button type="button" variant="secondary" onClick={() => setCreatingCustomer(true)} className="shrink-0">Baru</Button>
          </div>
        </Field>
      )}

      {!fixedBusinessUnitId && units.length > 1 && (
        <Field label="Perniagaan" required error={errors.businessUnitId}>
          <Select value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Pilih —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Barang diambil" required error={errors.description}>
        <Input
          value={description}
          maxLength={300}
          autoFocus={!!fixedCustomerId}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Contoh: Beras 10kg, minyak masak 2kg"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jumlah (RM)" required error={errors.amount}>
          <Input
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            className="text-xl font-bold tabular-nums"
          />
        </Field>
        <Field label="Tarikh" required error={errors.date}>
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <p className="text-xs text-muted">Hutang belum dikira jualan. Jualan direkod bila pelanggan bayar.</p>

      {!!formError && <ErrorBox error={formError} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={addEntry.isPending} className="sm:min-w-[160px]">{addEntry.isPending ? 'Menyimpan…' : 'Simpan hutang'}</Button>
      </div>
    </form>

    {/* Di luar <form>: modal pelanggan ada borangnya sendiri (borang bersarang tidak sah) */}
    <CustomerFormModal open={creatingCustomer} onClose={() => setCreatingCustomer(false)} onSaved={(c) => setCustomerId(c.id)} />
    </>
  )
}

/** Pelanggan bayar hutang → resit (RS-…) + Duit Masuk. */
export function CreditPaymentForm({
  ledger,
  onSaved,
  onCancel,
}: {
  ledger: CreditLedger
  onSaved: (r: Receipt) => void
  onCancel: () => void
}) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { pay } = useCreditBookMutations()

  const [amount, setAmount] = useState(String(ledger.balance))
  const [date, setDate] = useState(today())
  const [accountChosen, setAccountId] = useState<number | ''>('')
  // Satu akaun bagi setiap perniagaan: dipilih sendiri, masih boleh ditukar
  const accountId = accountChosen || accountForBusiness(accounts, ledger.businessUnitId)?.id || ''
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'Income' && c.isActive && (c.businessUnitId === null || c.businessUnitId === ledger.businessUnitId)),
    [categories, ledger.businessUnitId],
  )
  const effectiveCategoryId = categoryId || incomeCategories[0]?.id || ''

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const err: Record<string, string> = {}
    const amt = parseNum(amount)
    if (amt <= 0) err.amount = 'Masukkan jumlah.'
    else if (amt > ledger.balance + 0.001) err.amount = `Melebihi baki hutang (${formatRM(ledger.balance)}).`
    if (!accountId) err.accountId = 'Pilih akaun.'
    if (!effectiveCategoryId) err.categoryId = 'Pilih kategori.'
    setErrors(err)
    if (Object.keys(err).length) return

    try {
      const r = await pay.mutateAsync({
        customerId: ledger.customerId,
        businessUnitId: ledger.businessUnitId,
        date,
        accountId: Number(accountId),
        categoryId: Number(effectiveCategoryId),
        method,
        amount: amt,
        reference: reference.trim() || null,
      })
      onSaved(r)
    } catch (ex) {
      setErrors(fieldErrors(ex))
      setFormError(ex)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-sm">
        <div className="font-semibold text-brand-700">{ledger.customerName} · {ledger.businessUnitName}</div>
        <div className="text-muted">Baki hutang <b className="text-ink">{formatRM(ledger.balance)}</b></div>
      </div>

      <Field label="Jumlah dibayar (RM)" required error={errors.amount}>
        <Input
          inputMode="decimal"
          autoFocus
          value={amount}
          placeholder="0.00"
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          className="text-2xl font-bold tabular-nums"
        />
      </Field>

      <Field label="Kaedah bayaran">
        <div className="grid grid-cols-3 gap-2">
          {paymentMethods.map((m) => (
            <button
              type="button"
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={cx(
                'min-h-[44px] rounded-xl border px-2 text-sm font-semibold transition',
                method === m.value ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-line bg-white text-ink hover:bg-gray-50',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Duit masuk ke" required error={errors.accountId}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Pilih akaun —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Kategori jualan" required error={errors.categoryId}>
          <Select value={effectiveCategoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
            {incomeCategories.length === 0 && <option value="">— Tiada kategori pendapatan —</option>}
            {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tarikh" required error={errors.date}>
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="No. rujukan" hint="Contoh: no. transaksi bank">
          <Input value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="Pilihan" />
        </Field>
      </div>

      {!!formError && <ErrorBox error={formError} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={pay.isPending} className="sm:min-w-[160px]">{pay.isPending ? 'Menyimpan…' : 'Simpan & jana resit'}</Button>
      </div>
    </form>
  )
}

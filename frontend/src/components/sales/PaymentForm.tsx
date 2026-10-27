import { useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useAccounts, useBusinessUnits, useCategories } from '../../api/hooks'
import { useCustomers, useReceiptMutations } from '../../api/salesHooks'
import type { Invoice, PaymentMethod, Receipt } from '../../api/types'
import { paymentMethods } from '../../config/sales'
import { parseNum } from '../../lib/documentMath'
import { formatRM, today } from '../../lib/format'
import { Button, ErrorBox, Field, Input, Select, cx } from '../ui'
import { accountForBusiness } from '../../config/channels'

/**
 * Terima bayaran → resit. Jika ada invois, perniagaan & pelanggan diambil dari invois
 * dan jumlah lalai = baki invois.
 */
export function PaymentForm({
  invoice,
  defaultCustomerId,
  onSaved,
  onCancel,
}: {
  invoice?: Invoice
  defaultCustomerId?: number
  onSaved: (r: Receipt) => void
  onCancel: () => void
}) {
  const { data: units = [] } = useBusinessUnits()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: customers = [] } = useCustomers()
  const { create } = useReceiptMutations()

  const [amount, setAmount] = useState(invoice ? String(invoice.balance) : '')
  const [date, setDate] = useState(today())
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>(invoice?.businessUnitId ?? '')
  const [customerId, setCustomerId] = useState<number | ''>(invoice?.customerId ?? defaultCustomerId ?? '')
  const [receivedFrom, setReceivedFrom] = useState('')
  const [accountChosen, setAccountId] = useState<number | ''>('')
  // Satu akaun bagi setiap perniagaan: dipilih sendiri, masih boleh ditukar
  const accountId = accountChosen || accountForBusiness(accounts, businessUnitId || null)?.id || ''
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'Income' && (c.businessUnitId === null || c.businessUnitId === businessUnitId)),
    [categories, businessUnitId],
  )
  const effectiveCategoryId = categoryId || incomeCategories[0]?.id || ''

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const err: Record<string, string> = {}
    const amt = parseNum(amount)
    if (amt <= 0) err.amount = 'Masukkan jumlah.'
    if (invoice && amt > invoice.balance + 0.001) err.amount = `Melebihi baki invois (${formatRM(invoice.balance)}).`
    if (!businessUnitId) err.businessUnitId = 'Pilih perniagaan.'
    if (!customerId && !receivedFrom.trim()) err.receivedFrom = 'Pilih pelanggan atau tulis nama pembayar.'
    if (!accountId) err.accountId = 'Pilih akaun.'
    if (!effectiveCategoryId) err.categoryId = 'Pilih kategori.'
    setErrors(err)
    if (Object.keys(err).length) return

    try {
      const r = await create.mutateAsync({
        date,
        businessUnitId: Number(businessUnitId),
        customerId: customerId ? Number(customerId) : null,
        receivedFrom: receivedFrom.trim() || null,
        invoiceId: invoice?.id ?? null,
        accountId: Number(accountId),
        categoryId: Number(effectiveCategoryId),
        method,
        amount: amt,
        reference: reference.trim() || null,
        description: description.trim() || null,
      })
      onSaved(r)
    } catch (ex) {
      if (ex instanceof ApiError) setErrors(Object.fromEntries(Object.entries(ex.fieldErrors).map(([k, v]) => [k, v[0]])))
      setFormError(ex)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {invoice && (
        <div className="rounded-xl bg-brand-50 p-3 text-sm">
          <div className="font-semibold text-brand-700">{invoice.number} · {invoice.buyer.name}</div>
          <div className="text-muted">Jumlah {formatRM(invoice.total)} · Dibayar {formatRM(invoice.amountPaid)} · <b className="text-ink">Baki {formatRM(invoice.balance)}</b></div>
        </div>
      )}

      <Field label="Jumlah diterima (RM)" required error={errors.amount}>
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

      {!invoice && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Perniagaan" required error={errors.businessUnitId}>
            <Select value={businessUnitId} onChange={(e) => { setBusinessUnitId(e.target.value ? Number(e.target.value) : ''); setCategoryId('') }}>
              <option value="">— Pilih —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Pelanggan" error={errors.customerId}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Pelanggan tunai / lain —</option>
              {customers.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {!customerId && (
            <Field label="Diterima daripada" required error={errors.receivedFrom}>
              <Input value={receivedFrom} maxLength={150} onChange={(e) => setReceivedFrom(e.target.value)} placeholder="Nama pembayar" />
            </Field>
          )}
          <Field label="Bagi / catatan">
            <Input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Contoh: Deposit tempahan" />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Duit masuk ke" required error={errors.accountId}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Pilih akaun —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Kategori" required error={errors.categoryId}>
          <Select value={effectiveCategoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
            {incomeCategories.length === 0 && <option value="">— Pilih perniagaan dahulu —</option>}
            {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tarikh" required error={errors.date}>
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="No. rujukan" hint="Contoh: no. transaksi bank / cek">
          <Input value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="Pilihan" />
        </Field>
      </div>

      {!!formError && <ErrorBox error={formError} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={create.isPending} className="sm:min-w-[160px]">{create.isPending ? 'Menyimpan…' : 'Simpan & jana resit'}</Button>
      </div>
    </form>
  )
}

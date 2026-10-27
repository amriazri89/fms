import { useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useAccounts, useCategories } from '../../api/hooks'
import { usePayableMutations } from '../../api/payableHooks'
import type { Payable, PaymentMethod, PaymentVoucher } from '../../api/types'
import { paymentMethods } from '../../config/sales'
import { parseNum } from '../../lib/documentMath'
import { formatRM, today } from '../../lib/format'
import { Button, ErrorBox, Field, Input, Select, cx } from '../ui'
import { accountForBusiness } from '../../config/channels'

/**
 * Bayar hutang → baucar bayaran.
 * Bil: bayaran = Duit Keluar (belanja). Pinjaman: pokok = Bayar Balik Pinjaman (bukan belanja),
 * faedah = Duit Keluar (belanja).
 */
export function PayablePaymentForm({ payable, onSaved, onCancel }: {
  payable: Payable
  onSaved: (v: PaymentVoucher) => void
  onCancel: () => void
}) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { pay } = usePayableMutations()
  const isLoan = payable.kind === 'Loan'

  const defaultPrincipal = isLoan && payable.installmentAmount ? Math.min(payable.installmentAmount, payable.balance) : payable.balance
  const [amount, setAmount] = useState(String(defaultPrincipal))
  const [interest, setInterest] = useState('')
  const [date, setDate] = useState(today())
  const [accountChosen, setAccountId] = useState<number | ''>('')
  // Satu akaun bagi setiap perniagaan: dipilih sendiri, masih boleh ditukar
  const accountId = accountChosen || accountForBusiness(accounts, payable.businessUnitId)?.id || ''
  const [method, setMethod] = useState<PaymentMethod>(isLoan ? 'BankTransfer' : 'Cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'Expense' && c.isActive && (c.businessUnitId === null || c.businessUnitId === payable.businessUnitId)),
    [categories, payable.businessUnitId],
  )
  const [interestCategoryId, setInterestCategoryId] = useState<number | ''>('')
  const effectiveInterestCat =
    interestCategoryId || expenseCategories.find((c) => /faedah|caj/i.test(c.name))?.id || expenseCategories[0]?.id || ''

  const principal = parseNum(amount)
  const interestAmt = isLoan ? parseNum(interest) : 0
  const total = principal + interestAmt

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const err: Record<string, string> = {}
    if (principal < 0) err.amount = 'Jumlah tidak sah.'
    if (principal > payable.balance + 0.001) err.amount = `Melebihi baki hutang (${formatRM(payable.balance)}).`
    if (total <= 0) err.amount = 'Masukkan jumlah bayaran.'
    if (!accountId) err.accountId = 'Pilih akaun.'
    if (interestAmt > 0 && !effectiveInterestCat) err.interestCategoryId = 'Pilih kategori belanja.'
    setErrors(err)
    if (Object.keys(err).length) return

    try {
      const v = await pay.mutateAsync({
        id: payable.id,
        input: {
          date,
          amount: principal,
          interestAmount: interestAmt,
          interestCategoryId: interestAmt > 0 ? Number(effectiveInterestCat) : null,
          accountId: Number(accountId),
          method,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        },
      })
      onSaved(v)
    } catch (ex) {
      if (ex instanceof ApiError) setErrors(Object.fromEntries(Object.entries(ex.fieldErrors).map(([k, v]) => [k, v[0]])))
      setFormError(ex)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl bg-gold-50 p-3 text-sm">
        <div className="font-semibold text-ink">{payable.number} · {payable.supplierName}</div>
        <div className="text-muted">
          Jumlah {formatRM(payable.amount)} · Dibayar {formatRM(payable.amountPaid)} · <b className="text-ink">Baki {formatRM(payable.balance)}</b>
        </div>
      </div>

      <div className={cx('grid gap-4', isLoan && 'sm:grid-cols-2')}>
        <Field label={isLoan ? 'Bayar pokok (RM)' : 'Jumlah dibayar (RM)'} required error={errors.amount}
          hint={isLoan ? 'Mengurangkan baki pinjaman. Tidak dikira belanja.' : 'Dikira sebagai belanja perniagaan.'}>
          <Input inputMode="decimal" autoFocus value={amount} placeholder="0.00"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} className="text-2xl font-bold tabular-nums" />
        </Field>
        {isLoan && (
          <Field label="Faedah / caj (RM)" error={errors.interestAmount} hint="Dikira sebagai belanja. Kosongkan jika tiada.">
            <Input inputMode="decimal" value={interest} placeholder="0.00"
              onChange={(e) => setInterest(e.target.value.replace(/[^\d.,]/g, ''))} className="text-2xl font-bold tabular-nums" />
          </Field>
        )}
      </div>

      {isLoan && interestAmt > 0 && (
        <Field label="Kategori faedah" required error={errors.interestCategoryId}>
          <Select value={effectiveInterestCat} onChange={(e) => setInterestCategoryId(e.target.value ? Number(e.target.value) : '')}>
            {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Kaedah bayaran">
        <div className="grid grid-cols-3 gap-2">
          {paymentMethods.map((m) => (
            <button type="button" key={m.value} onClick={() => setMethod(m.value)}
              className={cx('min-h-[44px] rounded-xl border px-2 text-sm font-semibold transition',
                method === m.value ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-line bg-white text-ink hover:bg-gray-50')}>
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bayar guna akaun" required error={errors.accountId}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Pilih akaun —</option>
            {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Tarikh bayar" required error={errors.date}>
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="No. rujukan" hint="No. transaksi bank / cek">
          <Input value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="Pilihan" />
        </Field>
        <Field label="Catatan">
          <Input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Pilihan" />
        </Field>
      </div>

      {total > 0 && (
        <p className="rounded-xl bg-gray-50 p-3 text-sm text-muted">
          Duit keluar dari akaun: <b className="text-ink">{formatRM(total)}</b>
          {isLoan && interestAmt > 0 && <> (pokok {formatRM(principal)} + faedah {formatRM(interestAmt)})</>}
          {' · '}Baki selepas bayar: <b className="text-ink">{formatRM(Math.max(0, payable.balance - principal))}</b>
        </p>
      )}

      {!!formError && <ErrorBox error={formError} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={pay.isPending} className="sm:min-w-[160px]">{pay.isPending ? 'Menyimpan…' : 'Simpan & jana baucar'}</Button>
      </div>
    </form>
  )
}

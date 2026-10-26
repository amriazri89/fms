import { useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAccounts, useBusinessUnits, useCategories, useFamilyMembers, useTransactionMutations } from '../api/hooks'
import type { Transaction, TransactionInput, TransactionType } from '../api/types'
import { typeConfig } from '../config/transactionTypes'
import { today } from '../lib/format'
import { Button, ErrorBox, Field, Input, Select } from './ui'

const emptyInput = (type: TransactionType): TransactionInput => ({
  date: today(),
  type,
  amount: 0,
  businessUnitId: null,
  toBusinessUnitId: null,
  accountId: 0,
  toAccountId: null,
  categoryId: null,
  familyMemberId: null,
  party: null,
  reference: null,
  description: null,
})

const fromTransaction = (t: Transaction): TransactionInput => ({
  date: t.date,
  type: t.type,
  amount: t.amount,
  businessUnitId: t.businessUnitId,
  toBusinessUnitId: t.toBusinessUnitId,
  accountId: t.accountId,
  toAccountId: t.toAccountId,
  categoryId: t.categoryId,
  familyMemberId: t.familyMemberId,
  party: t.party,
  reference: t.reference,
  description: t.description,
})

const num = (v: string) => (v === '' ? null : Number(v))

export function TransactionForm({
  type,
  existing,
  onSaved,
  onCancel,
}: {
  type: TransactionType
  existing?: Transaction
  onSaved: (t: Transaction, again: boolean) => void
  onCancel?: () => void
}) {
  const cfg = typeConfig(existing?.type ?? type)
  const { data: units = [] } = useBusinessUnits()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: members = [] } = useFamilyMembers()
  const { save } = useTransactionMutations()

  const [form, setForm] = useState<TransactionInput>(() => (existing ? fromTransaction(existing) : emptyInput(type)))
  const [amountText, setAmountText] = useState(existing ? String(existing.amount) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)

  const set = <K extends keyof TransactionInput>(k: K, v: TransactionInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const categoryType = cfg.type === 'Income' ? 'Income' : 'Expense'
  const availableCategories = useMemo(
    () =>
      categories.filter(
        (c) => c.type === categoryType && (c.businessUnitId === null || c.businessUnitId === form.businessUnitId),
      ),
    [categories, categoryType, form.businessUnitId],
  )

  // Akaun yang sesuai dengan perniagaan dipaparkan dahulu
  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => Number(b.businessUnitId === form.businessUnitId) - Number(a.businessUnitId === form.businessUnitId)),
    [accounts, form.businessUnitId],
  )

  const validate = () => {
    const e: Record<string, string> = {}
    const amount = Number(amountText.replace(/,/g, ''))
    if (!amount || amount <= 0) e.amount = 'Masukkan jumlah.'
    if (!form.date) e.date = 'Pilih tarikh.'
    if (!form.accountId) e.accountId = 'Pilih akaun.'
    if (cfg.fields.business === 'required' && !form.businessUnitId) e.businessUnitId = 'Pilih perniagaan.'
    if (cfg.fields.toBusiness === 'required') {
      if (!form.toBusinessUnitId) e.toBusinessUnitId = 'Pilih perniagaan.'
      else if (form.toBusinessUnitId === form.businessUnitId) e.toBusinessUnitId = 'Mesti berbeza dengan perniagaan pemberi.'
    }
    if (cfg.fields.toAccount === 'required') {
      if (!form.toAccountId) e.toAccountId = 'Pilih akaun.'
      else if (cfg.type === 'Transfer' && form.toAccountId === form.accountId) e.toAccountId = 'Mesti berbeza dengan akaun asal.'
    }
    if (cfg.fields.category === 'required' && !form.categoryId) e.categoryId = 'Pilih kategori.'
    if (cfg.fields.familyMember === 'required' && !form.familyMemberId) e.familyMemberId = 'Pilih ahli keluarga.'
    setErrors(e)
    return { ok: Object.keys(e).length === 0, amount }
  }

  const submit = async (again: boolean, ev?: FormEvent) => {
    ev?.preventDefault()
    setFormError(null)
    const { ok, amount } = validate()
    if (!ok) return
    try {
      const saved = await save.mutateAsync({ id: existing?.id, input: { ...form, type: cfg.type, amount } })
      onSaved(saved, again)
      if (again) {
        setForm((f) => ({ ...emptyInput(cfg.type), date: f.date, businessUnitId: f.businessUnitId, accountId: f.accountId }))
        setAmountText('')
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])))
      }
      setFormError(err)
    }
  }

  return (
    <form onSubmit={(e) => submit(false, e)} className="space-y-4">
      <Field label="Jumlah (RM)" required error={errors.amount}>
        <Input
          inputMode="decimal"
          autoFocus={!existing}
          placeholder="0.00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))}
          className="text-2xl font-bold tabular-nums"
        />
      </Field>

      {cfg.fields.business !== 'hidden' && (
        <Field label={cfg.labels.business ?? 'Perniagaan'} required={cfg.fields.business === 'required'} error={errors.businessUnitId}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {units.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => setForm((f) => ({ ...f, businessUnitId: u.id, categoryId: null }))}
                className={
                  'min-h-[44px] rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ' +
                  (form.businessUnitId === u.id ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-line bg-white text-ink hover:bg-gray-50')
                }
              >
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: u.color ?? '#999' }} />
                {u.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {cfg.fields.toBusiness !== 'hidden' && (
        <Field label={cfg.labels.toBusiness ?? 'Ke perniagaan'} required error={errors.toBusinessUnitId}>
          <Select value={form.toBusinessUnitId ?? ''} onChange={(e) => set('toBusinessUnitId', num(e.target.value))}>
            <option value="">— Pilih —</option>
            {units.filter((u) => u.id !== form.businessUnitId).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {cfg.fields.category !== 'hidden' && (
        <Field label="Kategori" required error={errors.categoryId} hint={!form.businessUnitId ? 'Pilih perniagaan dahulu untuk lihat kategori khusus.' : undefined}>
          <Select value={form.categoryId ?? ''} onChange={(e) => set('categoryId', num(e.target.value))}>
            <option value="">— Pilih kategori —</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {cfg.fields.familyMember !== 'hidden' && (
        <Field label="Ahli keluarga" required error={errors.familyMemberId}>
          <Select value={form.familyMemberId ?? ''} onChange={(e) => set('familyMemberId', num(e.target.value))}>
            <option value="">— Pilih —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.relationship ? ` (${m.relationship})` : ''}</option>
            ))}
          </Select>
        </Field>
      )}

      <div className={cfg.fields.toAccount !== 'hidden' ? 'grid gap-4 sm:grid-cols-2' : ''}>
        <Field label={cfg.labels.account} required error={errors.accountId}>
          <Select value={form.accountId || ''} onChange={(e) => set('accountId', Number(e.target.value))}>
            <option value="">— Pilih akaun —</option>
            {sortedAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        {cfg.fields.toAccount !== 'hidden' && (
          <Field label={cfg.labels.toAccount ?? 'Ke akaun'} required error={errors.toAccountId}>
            <Select value={form.toAccountId ?? ''} onChange={(e) => set('toAccountId', num(e.target.value))}>
              <option value="">— Pilih akaun —</option>
              {sortedAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarikh" required error={errors.date}>
          <Input type="date" value={form.date} max={today()} onChange={(e) => set('date', e.target.value)} />
        </Field>
        {cfg.fields.party !== 'hidden' && (
          <Field label={cfg.labels.party ?? 'Pihak'}>
            <Input value={form.party ?? ''} maxLength={150} onChange={(e) => set('party', e.target.value || null)} placeholder="Pilihan" />
          </Field>
        )}
      </div>

      <Field label="Catatan">
        <Input value={form.description ?? ''} maxLength={500} onChange={(e) => set('description', e.target.value || null)} placeholder="Contoh: 500 biji nenas" />
      </Field>

      <Field label="No. rujukan / resit">
        <Input value={form.reference ?? ''} maxLength={50} onChange={(e) => set('reference', e.target.value || null)} placeholder="Pilihan" />
      </Field>

      {!!formError && <ErrorBox error={formError} />}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Batal
          </Button>
        )}
        {!existing && (
          <Button type="button" variant="secondary" disabled={save.isPending} onClick={() => submit(true)}>
            Simpan & tambah lagi
          </Button>
        )}
        <Button type="submit" disabled={save.isPending} className="sm:min-w-[140px]">
          {save.isPending ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </div>
    </form>
  )
}

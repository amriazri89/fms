import { useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useAccounts, useBusinessUnits, useCategories } from '../../api/hooks'
import { useCustomers, useDocumentSettings, useInvoiceMutations, useQuotationMutations } from '../../api/salesHooks'
import type { DocumentLineInput, Invoice, PaymentMethod, Quotation } from '../../api/types'
import { paymentMethods } from '../../config/sales'
import { documentTotals, lineAmount, parseNum } from '../../lib/documentMath'
import { addDays, formatAmount, formatRM, today } from '../../lib/format'
import { Icon } from '../Icon'
import { Button, Card, ErrorBox, Field, Input, Select, Textarea, cx } from '../ui'
import { CustomerFormModal } from './CustomerFormModal'

interface LineState {
  key: number
  description: string
  quantity: string
  unit: string
  unitPrice: string
}

let lineKey = 1
const newLine = (l?: Partial<DocumentLineInput>): LineState => ({
  key: lineKey++,
  description: l?.description ?? '',
  quantity: l?.quantity != null ? String(l.quantity) : '1',
  unit: l?.unit ?? '',
  unitPrice: l?.unitPrice != null ? String(l.unitPrice) : '',
})

type Props =
  | { kind: 'quotation'; existing?: Quotation; defaultCustomerId?: number; onSaved: (id: number) => void; onCancel: () => void }
  | { kind: 'invoice'; existing?: Invoice; defaultCustomerId?: number; onSaved: (id: number) => void; onCancel: () => void }

/** Borang sebut harga / invois — item, diskaun, cukai dan jumlah dikira semasa menaip. */
export function DocumentEditor(props: Props) {
  const { kind, existing, defaultCustomerId, onSaved, onCancel } = props
  const { data: settings } = useDocumentSettings()
  const { data: units = [] } = useBusinessUnits()
  const { data: customers = [] } = useCustomers()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const quotationM = useQuotationMutations()
  const invoiceM = useInvoiceMutations()
  const saving = quotationM.save.isPending || invoiceM.save.isPending

  const days = kind === 'quotation' ? settings?.quotationValidDays ?? 14 : settings?.paymentTermDays ?? 30
  const initialDate = existing?.date ?? today()

  const [businessUnitId, setBusinessUnitId] = useState<number | ''>(existing?.businessUnitId ?? '')
  const [customerId, setCustomerId] = useState<number | ''>(existing?.customerId ?? defaultCustomerId ?? '')
  const [date, setDate] = useState(initialDate)
  const [secondDate, setSecondDate] = useState<string | null>(
    existing ? (props.kind === 'quotation' ? props.existing!.validUntil : props.existing!.dueDate) : null,
  )
  const [subject, setSubject] = useState(existing?.subject ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [terms, setTerms] = useState<string | null>(existing ? existing.terms ?? '' : null)
  const [discount, setDiscount] = useState(existing?.discountAmount ? String(existing.discountAmount) : '')
  const [taxRate, setTaxRate] = useState<string | null>(existing ? String(existing.taxRate) : null)
  const [lines, setLines] = useState<LineState[]>(() => (existing ? existing.items.map((i) => newLine(i)) : [newLine()]))

  // Jualan tunai (invois baru sahaja)
  const [payNow, setPayNow] = useState(false)
  const [payAccountId, setPayAccountId] = useState<number | ''>('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Cash')
  const [payReference, setPayReference] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)

  // Nilai lalai dari tetapan (sebelum pengguna ubah)
  const effectiveSecondDate = secondDate ?? addDays(date, days)
  const effectiveTerms = terms ?? (kind === 'quotation' ? settings?.defaultQuotationTerms : settings?.defaultInvoiceTerms) ?? ''
  const effectiveTaxRate = taxRate ?? String(settings?.defaultTaxRate ?? 0)
  const taxLabel = settings?.taxLabel ?? 'SST'

  const parsed = lines.map((l) => ({ quantity: parseNum(l.quantity), unitPrice: parseNum(l.unitPrice) }))
  const totals = documentTotals(parsed, parseNum(discount), parseNum(effectiveTaxRate))

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'Income' && (c.businessUnitId === null || c.businessUnitId === businessUnitId)),
    [categories, businessUnitId],
  )

  const updateLine = (key: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))
  const moveLine = (key: number, dir: -1 | 1) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key)
      const j = i + dir
      if (j < 0 || j >= ls.length) return ls
      const copy = [...ls]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const validate = () => {
    const e: Record<string, string> = {}
    if (!businessUnitId) e.businessUnitId = 'Pilih perniagaan.'
    if (!customerId) e.customerId = 'Pilih pelanggan.'
    if (!date) e.date = 'Pilih tarikh.'
    if (effectiveSecondDate < date) e.secondDate = 'Mesti sama atau selepas tarikh dokumen.'
    lines.forEach((l, i) => {
      if (!l.description.trim()) e[`items[${i}].description`] = 'Perkara diperlukan.'
      if (parseNum(l.quantity) <= 0) e[`items[${i}].quantity`] = 'Kuantiti > 0.'
      if (parseNum(l.unitPrice) < 0) e[`items[${i}].unitPrice`] = 'Harga tidak sah.'
    })
    if (payNow && !payAccountId) e.payAccountId = 'Pilih akaun duit masuk.'
    if (payNow && incomeCategories.length === 0) e.payAccountId = 'Tiada kategori pendapatan untuk perniagaan ini.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setFormError(null)
    if (!validate()) return

    const base = {
      businessUnitId: Number(businessUnitId),
      customerId: Number(customerId),
      date,
      subject: subject.trim() || null,
      notes: notes.trim() || null,
      terms: effectiveTerms.trim() || null,
      discountAmount: parseNum(discount),
      taxRate: parseNum(effectiveTaxRate),
      items: lines.map((l) => ({
        description: l.description.trim(),
        quantity: parseNum(l.quantity),
        unit: l.unit.trim() || null,
        unitPrice: parseNum(l.unitPrice),
      })),
    }

    try {
      if (kind === 'quotation') {
        const q = await quotationM.save.mutateAsync({ id: existing?.id, input: { ...base, validUntil: effectiveSecondDate } })
        onSaved(q.id)
      } else {
        const inv = await invoiceM.save.mutateAsync({
          id: existing?.id,
          input: {
            ...base,
            dueDate: effectiveSecondDate,
            payNow:
              payNow && !existing
                ? { accountId: Number(payAccountId), categoryId: incomeCategories[0].id, method: payMethod, reference: payReference.trim() || null }
                : null,
          },
        })
        onSaved(inv.id)
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const fe = Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]]))
        if (fe.validUntil || fe.dueDate) fe.secondDate = fe.validUntil ?? fe.dueDate
        setErrors(fe)
      }
      setFormError(err)
    }
  }

  const activeCustomers = customers.filter((c) => c.isActive || c.id === existing?.customerId)

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pelanggan" required error={errors.customerId}>
            <div className="flex gap-2">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')} className="flex-1">
                <option value="">— Pilih pelanggan —</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Button type="button" variant="secondary" onClick={() => setNewCustomerOpen(true)} className="shrink-0 px-3" title="Pelanggan baru">
                <Icon name="plus" className="h-4 w-4" />
                <span className="hidden sm:inline">Baru</span>
              </Button>
            </div>
          </Field>
          <Field label="Perniagaan" required error={errors.businessUnitId} hint="Nama & alamat perniagaan ini dicetak pada dokumen.">
            <Select value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Pilih perniagaan —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tarikh" required error={errors.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={kind === 'quotation' ? 'Sah sehingga' : 'Tarikh akhir bayaran'} required error={errors.secondDate}>
            <Input type="date" value={effectiveSecondDate} min={date} onChange={(e) => setSecondDate(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Perkara / tajuk">
            <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="Contoh: Bekalan nenas bulan Oktober" />
          </Field>
        </div>
      </Card>

      <Card title="Item">
        {errors.items && <p className="mb-2 text-xs font-medium text-expense">{errors.items}</p>}
        <div className="hidden grid-cols-[1fr,90px,80px,110px,100px,72px] gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
          <span>Perkara</span>
          <span className="text-right">Kuantiti</span>
          <span>Unit</span>
          <span className="text-right">Harga (RM)</span>
          <span className="text-right">Jumlah</span>
          <span />
        </div>
        <div className="space-y-3 md:space-y-2">
          {lines.map((l, i) => {
            const err = (f: string) => errors[`items[${i}].${f}`]
            return (
              <div key={l.key} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr,90px,80px,110px,100px,72px] md:items-start md:border-0 md:p-0">
                <div className="col-span-2 md:col-span-1">
                  <Input
                    value={l.description}
                    maxLength={300}
                    placeholder={`Item ${i + 1}`}
                    aria-label="Perkara"
                    onChange={(e) => updateLine(l.key, { description: e.target.value })}
                    className={cx(err('description') && 'border-expense')}
                  />
                </div>
                <Input
                  inputMode="decimal"
                  value={l.quantity}
                  aria-label="Kuantiti"
                  onChange={(e) => updateLine(l.key, { quantity: e.target.value.replace(/[^\d.,]/g, '') })}
                  className={cx('text-right tabular-nums', err('quantity') && 'border-expense')}
                />
                <Input value={l.unit} maxLength={20} placeholder="unit" aria-label="Unit" onChange={(e) => updateLine(l.key, { unit: e.target.value })} />
                <Input
                  inputMode="decimal"
                  value={l.unitPrice}
                  placeholder="0.00"
                  aria-label="Harga seunit"
                  onChange={(e) => updateLine(l.key, { unitPrice: e.target.value.replace(/[^\d.,]/g, '') })}
                  className={cx('text-right tabular-nums', err('unitPrice') && 'border-expense')}
                />
                <div className="flex min-h-[44px] items-center justify-end text-sm font-semibold tabular-nums text-ink">
                  {formatAmount(lineAmount(parseNum(l.quantity), parseNum(l.unitPrice)))}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
                  <button type="button" onClick={() => moveLine(l.key, -1)} disabled={i === 0} className="rounded-lg p-2 text-muted hover:bg-gray-100 disabled:opacity-30" aria-label="Naik">
                    ↑
                  </button>
                  <button type="button" onClick={() => removeLine(l.key)} disabled={lines.length === 1} className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-expense disabled:opacity-30" aria-label="Buang item">
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])} className="mt-3">
          <Icon name="plus" className="h-4 w-4" /> Tambah item
        </Button>

        <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Diskaun (RM)" error={errors.discountAmount}>
              <Input inputMode="decimal" value={discount} placeholder="0.00" onChange={(e) => setDiscount(e.target.value.replace(/[^\d.,]/g, ''))} className="text-right" />
            </Field>
            <Field label={`${taxLabel} (%)`} error={errors.taxRate}>
              <Input inputMode="decimal" value={effectiveTaxRate} onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ''))} className="text-right" />
            </Field>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Jumlah kecil</dt><dd className="tabular-nums">{formatRM(totals.subtotal)}</dd></div>
            {totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Diskaun</dt><dd className="tabular-nums">{formatRM(-totals.discount)}</dd></div>}
            {totals.tax > 0 && <div className="flex justify-between"><dt className="text-muted">{taxLabel}</dt><dd className="tabular-nums">{formatRM(totals.tax)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-lg font-extrabold"><dt>Jumlah</dt><dd className="tabular-nums">{formatRM(totals.total)}</dd></div>
          </dl>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catatan untuk pelanggan">
            <Textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label="Terma & syarat">
            <Textarea value={effectiveTerms} maxLength={2000} onChange={(e) => setTerms(e.target.value)} />
          </Field>
        </div>
      </Card>

      {kind === 'invoice' && !existing && (
        <Card>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-600" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
            <span>
              <span className="block font-semibold text-ink">Pelanggan sudah bayar penuh sekarang</span>
              <span className="block text-sm text-muted">Resit dijana terus dan duit masuk direkod. Sesuai untuk jualan tunai.</span>
            </span>
          </label>
          {payNow && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Duit masuk ke" required error={errors.payAccountId}>
                <Select value={payAccountId} onChange={(e) => setPayAccountId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— Pilih akaun —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <Field label="Kaedah bayaran">
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                  {paymentMethods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="No. rujukan">
                <Input value={payReference} maxLength={50} onChange={(e) => setPayReference(e.target.value)} placeholder="Pilihan" />
              </Field>
            </div>
          )}
        </Card>
      )}

      {!!formError && <ErrorBox error={formError} />}

      <div className="sticky bottom-20 z-10 flex flex-col-reverse gap-2 rounded-2xl bg-[#F5F7F6]/95 py-2 backdrop-blur sm:flex-row sm:justify-end lg:bottom-0">
        <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={saving} className="sm:min-w-[180px]">
          {saving ? 'Menyimpan…' : existing ? 'Simpan perubahan' : kind === 'quotation' ? 'Simpan sebut harga' : payNow ? 'Simpan & jana resit' : 'Simpan invois'}
        </Button>
      </div>

      <CustomerFormModal open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} onSaved={(c) => setCustomerId(c.id)} />
    </form>
  )
}

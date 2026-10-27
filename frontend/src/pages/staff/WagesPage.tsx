import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAccounts, useBusinessUnits, useCategories } from '../../api/hooks'
import { useEmployees, useWageMutations, useWages } from '../../api/staffHooks'
import type { Employee, PaymentMethod, Wage } from '../../api/types'
import { Icon } from '../../components/Icon'
import { ReasonModal } from '../../components/ReasonModal'
import { ListRow, PayFields, TotalBar, fieldErrors, moneyInput } from '../../components/staff/common'
import { Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { paymentMethodLabel } from '../../config/sales'
import { expenseCategoriesFor, formatPeriod, pickCategory, thisMonth } from '../../config/staff'
import { parseNum } from '../../lib/documentMath'
import { formatDate, formatRM, today } from '../../lib/format'
import { accountForBusiness } from '../../config/channels'

/** Manage Employee Wages: bayar gaji → Duit Keluar + slip gaji. */
export default function WagesPage() {
  const [month, setMonth] = useState(thisMonth())
  const [wholeYear, setWholeYear] = useState(false)
  const { data, isLoading, error } = useWages(wholeYear ? { year: Number(month.slice(0, 4)) } : { month })
  const { data: employees = [] } = useEmployees()
  const [paying, setPaying] = useState<Employee | 'new' | null>(null)
  const [voiding, setVoiding] = useState<Wage | null>(null)
  const m = useWageMutations()
  const paid = new Set(data?.items.map((w) => w.employeeId))
  const notPaid = wholeYear ? [] : employees.filter((e) => !paid.has(e.id))

  return (
    <div className="space-y-4">
      <PageHeader title="Gaji pekerja" subtitle="Bayar gaji dan cetak slip gaji. Setiap bayaran direkod sebagai Duit Keluar."
        actions={<Button onClick={() => setPaying('new')}><Icon name="plus" className="h-4 w-4" /> Bayar gaji</Button>} />
      <div className="flex flex-wrap items-center gap-3">
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="max-w-[220px]" />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={wholeYear} onChange={(e) => setWholeYear(e.target.checked)} /> Sepanjang tahun {month.slice(0, 4)}
        </label>
      </div>
      {data && <TotalBar count={data.count} total={data.total} label="bayaran gaji" />}
      {notPaid.length > 0 && (
        <div className="rounded-xl border border-gold-500/30 bg-gold-50 p-3 text-sm">
          <b>Belum dibayar untuk {formatPeriod(month)}:</b>{' '}
          {notPaid.map((e, i) => (
            <span key={e.id}>{i > 0 && ', '}<button className="font-semibold text-brand-700 underline" onClick={() => setPaying(e)}>{e.name}</button></span>
          ))}
        </div>
      )}
      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data?.items.length === 0 && <Empty>Tiada rekod gaji untuk tempoh ini.</Empty>}
        <div className="-mx-2 divide-y divide-line/60">
          {data?.items.map((w) => (
            <ListRow
              key={w.id}
              title={w.employeeName}
              badges={<span className="text-xs text-muted">{w.number}</span>}
              sub={[formatPeriod(w.periodMonth), `Dibayar ${formatDate(w.payDate)}`, `${paymentMethodLabel(w.method)} · ${w.accountName}`, w.daysWorked ? `${w.daysWorked} hari` : null].filter(Boolean).join(' · ')}
              amount={w.netPay}
              amountClass="text-expense"
              right={
                <span className="flex justify-end gap-3 text-xs font-semibold">
                  <Link to={`/cetak-slip/${w.id}`} className="text-brand-600 hover:underline">Slip gaji</Link>
                  <button onClick={() => setVoiding(w)} className="text-expense hover:underline">Batal</button>
                </span>
              }
            />
          ))}
        </div>
      </Card>
      <Modal open={!!paying} title="Bayar gaji" onClose={() => setPaying(null)}>
        {paying && <WageForm employees={employees} employee={paying === 'new' ? undefined : paying} defaultMonth={month} onDone={() => setPaying(null)} />}
      </Modal>
      <ReasonModal
        open={!!voiding}
        title={`Batalkan gaji ${voiding?.number ?? ''}`}
        confirmLabel="Batalkan rekod gaji"
        busy={m.void.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={(reason) => m.void.mutateAsync({ id: voiding!.id, reason }).then(() => undefined)}
      />
    </div>
  )
}

function WageForm({ employees, employee, defaultMonth, onDone }: { employees: Employee[]; employee?: Employee; defaultMonth: string; onDone: () => void }) {
  const { pay } = useWageMutations()
  const { data: units = [] } = useBusinessUnits()
  const { data: categories = [] } = useCategories()
  const [employeeId, setEmployeeId] = useState<number | ''>(employee?.id ?? '')
  const emp = useMemo(() => employees.find((e) => e.id === employeeId), [employees, employeeId])
  const [periodMonth, setPeriodMonth] = useState(defaultMonth)
  const [days, setDays] = useState('')
  const [basic, setBasic] = useState(employee?.employmentType === 'Monthly' ? String(employee.basicRate) : '')
  const [allowance, setAllowance] = useState('')
  const [overtime, setOvertime] = useState('')
  const [deduction, setDeduction] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>(employee?.businessUnitId ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [accountChosen, setAccountId] = useState<number | ''>('')
  const { data: accounts = [] } = useAccounts()
  // Satu akaun bagi setiap perniagaan: dipilih sendiri, masih boleh ditukar
  const accountId = accountChosen || accountForBusiness(accounts, businessUnitId || null)?.id || ''
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<unknown>(null)
  const errs = fieldErrors(error)

  const cats = expenseCategoriesFor(categories, businessUnitId)
  const effectiveCategory = categoryId || pickCategory(cats, /gaji|upah pekerja/i, businessUnitId)
  const net = parseNum(basic) + parseNum(allowance) + parseNum(overtime) - parseNum(deduction)

  const pickEmployee = (id: number | '') => {
    setEmployeeId(id)
    const e = employees.find((x) => x.id === id)
    if (!e) return
    setBusinessUnitId(e.businessUnitId ?? '')
    setCategoryId('')
    setBasic(e.employmentType === 'Monthly' ? String(e.basicRate) : days ? (parseNum(days) * e.basicRate).toFixed(2) : '')
  }
  const changeDays = (v: string) => {
    setDays(v)
    if (emp?.employmentType === 'Daily') setBasic(v ? (parseNum(v) * emp.basicRate).toFixed(2) : '')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await pay.mutateAsync({
        employeeId: Number(employeeId), periodMonth, daysWorked: days ? parseNum(days) : null, basicPay: parseNum(basic), allowance: parseNum(allowance),
        overtime: parseNum(overtime), deduction: parseNum(deduction), payDate, businessUnitId: Number(businessUnitId), accountId: Number(accountId),
        categoryId: Number(effectiveCategory), method, notes: notes.trim() || null,
      })
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pekerja" required error={errs.employeeId}>
          <Select value={employeeId} onChange={(e) => pickEmployee(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Pilih pekerja —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Gaji untuk bulan" required error={errs.periodMonth}><Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} /></Field>
      </div>
      {emp && <p className="text-xs text-muted">{emp.employmentType === 'Daily' ? `Kadar sehari ${formatRM(emp.basicRate)}. Gaji pokok = hari bekerja × kadar.` : `Gaji bulanan ${formatRM(emp.basicRate)}.`}</p>}
      <div className="grid grid-cols-2 gap-4">
        {emp?.employmentType === 'Daily' && <Field label="Hari bekerja" error={errs.daysWorked}><Input inputMode="decimal" value={days} onChange={(e) => changeDays(moneyInput(e.target.value))} /></Field>}
        <Field label="Gaji pokok (RM)" required error={errs.basicPay}><Input inputMode="decimal" value={basic} placeholder="0.00" onChange={(e) => setBasic(moneyInput(e.target.value))} /></Field>
        <Field label="Elaun (RM)"><Input inputMode="decimal" value={allowance} placeholder="0.00" onChange={(e) => setAllowance(moneyInput(e.target.value))} /></Field>
        <Field label="Kerja lebih masa (RM)"><Input inputMode="decimal" value={overtime} placeholder="0.00" onChange={(e) => setOvertime(moneyInput(e.target.value))} /></Field>
        <Field label="Potongan (RM)" hint="Contoh: pendahuluan gaji" error={errs.deduction}><Input inputMode="decimal" value={deduction} placeholder="0.00" onChange={(e) => setDeduction(moneyInput(e.target.value))} /></Field>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-brand-50 p-3">
        <span className="text-sm font-semibold text-brand-700">Gaji bersih (Duit Keluar)</span>
        <span className="text-xl font-extrabold text-brand-700">{formatRM(net)}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
        <PayFields accountId={accountId} onAccount={setAccountId} method={method} onMethod={setMethod} accountError={errs.accountId} />
        <Field label="Tarikh bayar" required error={errs.payDate}><Input type="date" value={payDate} max={today()} onChange={(e) => setPayDate(e.target.value)} /></Field>
      </div>
      <Field label="Catatan"><Textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></Field>
      {!!error && <ErrorBox error={error} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>Batal</Button>
        <Button type="submit" disabled={pay.isPending}>{pay.isPending ? 'Menyimpan…' : 'Simpan & jana slip gaji'}</Button>
      </div>
    </form>
  )
}

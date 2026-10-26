import { useState, type FormEvent } from 'react'
import { useBusinessUnits } from '../../api/hooks'
import { useEmployeeMutations, useEmployees } from '../../api/staffHooks'
import type { Employee, EmployeeInput, EmploymentType } from '../../api/types'
import { Icon } from '../../components/Icon'
import { ListRow, fieldErrors, moneyInput } from '../../components/staff/common'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { employmentTypes, formatPeriod } from '../../config/staff'
import { parseNum } from '../../lib/documentMath'
import { formatRM } from '../../lib/format'

/** Manage Employee: Pengurus dan Kerani. */
export default function EmployeesPage() {
  const [showInactive, setShowInactive] = useState(false)
  const { data, isLoading, error } = useEmployees(showInactive)
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pekerja"
        subtitle={data && `${data.filter((e) => e.isActive).length} pekerja aktif`}
        actions={<Button onClick={() => setEditing('new')}><Icon name="plus" className="h-4 w-4" /> Tambah pekerja</Button>}
      />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Tunjuk bekas pekerja
      </label>
      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data?.length === 0 && <Empty>Belum ada pekerja.</Empty>}
        <div className="-mx-2 divide-y divide-line/60">
          {data?.map((e) => (
            <ListRow
              key={e.id}
              muted={!e.isActive}
              onClick={() => setEditing(e)}
              title={e.name}
              badges={<>{e.position && <Badge>{e.position}</Badge>}{!e.isActive && <Badge tone="expense">Tidak aktif</Badge>}</>}
              sub={[
                `${formatRM(e.basicRate)} ${e.employmentType === 'Daily' ? 'sehari' : 'sebulan'}`,
                e.businessUnitName,
                e.lastPaidPeriod ? `Gaji terakhir: ${formatPeriod(e.lastPaidPeriod)}` : 'Belum ada rekod gaji',
              ].filter(Boolean).join(' · ')}
              right={<><span className="block text-xs text-muted">Dibayar tahun ini</span><span className="text-sm font-bold">{formatRM(e.paidThisYear)}</span></>}
            />
          ))}
        </div>
      </Card>
      <Modal open={!!editing} title={editing === 'new' ? 'Tambah pekerja' : 'Ubah maklumat pekerja'} onClose={() => setEditing(null)}>
        {editing && <EmployeeForm existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function EmployeeForm({ existing, onDone }: { existing?: Employee; onDone: () => void }) {
  const { save, remove } = useEmployeeMutations()
  const { data: units = [] } = useBusinessUnits()
  const [f, setF] = useState<EmployeeInput>({
    name: existing?.name ?? '', icNo: existing?.icNo ?? null, phone: existing?.phone ?? null, position: existing?.position ?? null,
    businessUnitId: existing?.businessUnitId ?? null, employmentType: existing?.employmentType ?? 'Monthly', basicRate: existing?.basicRate ?? 0,
    joinDate: existing?.joinDate ?? null, bankName: existing?.bankName ?? null, bankAccountNo: existing?.bankAccountNo ?? null,
    notes: existing?.notes ?? null, isActive: existing?.isActive ?? true,
  })
  const [rate, setRate] = useState(existing ? String(existing.basicRate) : '')
  const [error, setError] = useState<unknown>(null)
  const errs = fieldErrors(error)
  const set = (k: keyof EmployeeInput, v: string) => setF((x) => ({ ...x, [k]: v === '' ? null : v }))
  const typeCfg = employmentTypes.find((t) => t.value === f.employmentType)!

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await save.mutateAsync({ id: existing?.id, input: { ...f, name: f.name.trim(), basicRate: parseNum(rate) } })
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  const del = async () => {
    if (!existing || !window.confirm(`Buang ${existing.name}? Pekerja yang ada rekod gaji hanya akan dinyahaktifkan.`)) return
    try {
      await remove.mutateAsync(existing.id)
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama penuh" required error={errs.name}><Input value={f.name} maxLength={150} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jawatan"><Input value={f.position ?? ''} maxLength={100} onChange={(e) => set('position', e.target.value)} placeholder="Contoh: Pekerja kebun" /></Field>
        <Field label="Bekerja di">
          <Select value={f.businessUnitId ?? ''} onChange={(e) => setF({ ...f, businessUnitId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— Pilih perniagaan —</option>
            {units.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Jenis gaji" required>
          <Select value={f.employmentType} onChange={(e) => setF({ ...f, employmentType: e.target.value as EmploymentType })}>
            {employmentTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label={typeCfg.rateLabel} required error={errs.basicRate}>
          <Input inputMode="decimal" value={rate} placeholder="0.00" onChange={(e) => setRate(moneyInput(e.target.value))} />
        </Field>
        <Field label="No. telefon"><Input type="tel" value={f.phone ?? ''} maxLength={50} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="No. kad pengenalan"><Input value={f.icNo ?? ''} maxLength={20} onChange={(e) => set('icNo', e.target.value)} /></Field>
        <Field label="Tarikh mula bekerja"><Input type="date" value={f.joinDate ?? ''} onChange={(e) => set('joinDate', e.target.value)} /></Field>
        <Field label="Bank"><Input value={f.bankName ?? ''} maxLength={50} onChange={(e) => set('bankName', e.target.value)} /></Field>
        <Field label="No. akaun bank"><Input value={f.bankAccountNo ?? ''} maxLength={30} onChange={(e) => set('bankAccountNo', e.target.value)} /></Field>
      </div>
      <Field label="Catatan"><Textarea value={f.notes ?? ''} maxLength={1000} onChange={(e) => set('notes', e.target.value)} /></Field>
      {existing && (
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Masih bekerja
        </label>
      )}
      {!!error && <ErrorBox error={error} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {existing ? <Button type="button" variant="ghost" className="text-expense" onClick={del}>Buang</Button> : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onDone}>Batal</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </form>
  )
}

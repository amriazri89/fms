import { useState, type FormEvent } from 'react'
import { openFile } from '../../api/client'
import { useAccounts, useBusinessUnits, useCategories } from '../../api/hooks'
import { useClaimMutations, useClaims, useEmployees } from '../../api/staffHooks'
import type { Claim, ClaimStatus, PaymentMethod } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/Icon'
import { ReasonModal } from '../../components/ReasonModal'
import { ChipFilter, StatusBadge } from '../../components/sales/common'
import { ListRow, PayFields, TotalBar, fieldErrors, moneyInput } from '../../components/staff/common'
import { Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { paymentMethodLabel } from '../../config/sales'
import { claimStatusView, expenseCategoriesFor, pickCategory } from '../../config/staff'
import { parseNum } from '../../lib/documentMath'
import { formatDate, formatDateTime, formatRM, today } from '../../lib/format'
import { accountForBusiness } from '../../config/channels'

type Filter = '' | ClaimStatus

/**
 * Tuntutan kewangan.
 *  Kerani  : Manage Financial Claim Request (tuntutan sendiri).
 *  Pengurus: View Financial Claim + Approve Financial Claim.
 *  Selepas lulus, sesiapa boleh rekod bayaran balik → Duit Keluar.
 */
export default function ClaimsPage() {
  const { hasRole } = useAuth()
  const isManager = hasRole('Manager')
  const [status, setStatus] = useState<Filter>(isManager ? 'Pending' : '')
  const { data, isLoading, error } = useClaims({ status: status || undefined })
  const [open, setOpen] = useState<Claim | 'new' | null>(null)

  return (
    <div className="space-y-4">
      <PageHeader
        title={isManager ? 'Kelulusan tuntutan' : 'Tuntutan kewangan saya'}
        subtitle={isManager ? 'Semak setiap tuntutan dan resitnya, kemudian lulus atau tolak.' : 'Tuntut balik duit sendiri yang digunakan untuk perniagaan.'}
        actions={!isManager && <Button onClick={() => setOpen('new')}><Icon name="plus" className="h-4 w-4" /> Mohon tuntutan</Button>}
      />
      <ChipFilter
        value={status}
        onChange={(v) => setStatus(v as Filter)}
        options={[{ key: 'Pending', label: 'Menunggu' }, { key: 'Approved', label: 'Diluluskan' }, { key: 'Paid', label: 'Dibayar' }, { key: 'Rejected', label: 'Ditolak' }, { key: '', label: 'Semua' }]}
      />
      {data && <TotalBar count={data.count} total={data.total} label="tuntutan" />}
      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data?.items.length === 0 && <Empty>{status === 'Pending' ? 'Tiada tuntutan menunggu kelulusan.' : 'Tiada tuntutan.'}</Empty>}
        <div className="-mx-2 divide-y divide-line/60">
          {data?.items.map((c) => (
            <ListRow
              key={c.id}
              onClick={() => setOpen(c)}
              title={c.description}
              badges={<StatusBadge {...claimStatusView[c.status]} />}
              sub={[c.number, formatDate(c.claimDate), c.claimantName, c.businessUnitName, c.hasReceipt ? 'Ada resit' : 'Tiada resit'].join(' · ')}
              amount={c.amount}
            />
          ))}
        </div>
      </Card>
      <Modal open={!!open} title={open === 'new' ? 'Mohon tuntutan' : open ? `Tuntutan ${open.number}` : ''} onClose={() => setOpen(null)}>
        {open === 'new' && <ClaimForm onDone={() => setOpen(null)} />}
        {open && open !== 'new' && (!isManager && open.status === 'Pending'
          ? <ClaimForm existing={open} onDone={() => setOpen(null)} />
          : <ClaimDetail claim={open} isManager={isManager} onDone={() => setOpen(null)} />)}
      </Modal>
    </div>
  )
}

function ReceiptLink({ claim }: { claim: Claim }) {
  const [err, setErr] = useState<unknown>(null)
  if (!claim.hasReceipt) return <span className="text-sm text-muted">Tiada resit dilampirkan</span>
  return (
    <>
      <button type="button" onClick={() => openFile(`/claims/${claim.id}/receipt`).catch(setErr)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
        <Icon name="file" className="h-4 w-4" /> {claim.receiptOriginalName ?? 'Lihat resit'}
      </button>
      {!!err && <ErrorBox error={err} />}
    </>
  )
}

function ClaimDetail({ claim, isManager, onDone }: { claim: Claim; isManager: boolean; onDone: () => void }) {
  const m = useClaimMutations()
  const [remark, setRemark] = useState('')
  const [paying, setPaying] = useState(false)
  const [unpaying, setUnpaying] = useState(false)
  const [paidDate, setPaidDate] = useState(today())
  const [accountChosen, setAccountId] = useState<number | ''>('')
  const { data: accounts = [] } = useAccounts()
  // Satu akaun bagi setiap perniagaan: dipilih sendiri, masih boleh ditukar
  const accountId = accountChosen || accountForBusiness(accounts, claim.businessUnitId)?.id || ''
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [error, setError] = useState<unknown>(null)
  const errs = fieldErrors(error)

  const review = async (approve: boolean) => {
    setError(null)
    try {
      await m.review.mutateAsync({ id: claim.id, approve, remark: remark.trim() || null })
      onDone()
    } catch (err) {
      setError(err)
    }
  }
  const pay = async () => {
    setError(null)
    try {
      await m.pay.mutateAsync({ id: claim.id, paidDate, accountId: Number(accountId), method })
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusBadge {...claimStatusView[claim.status]} />
        <span className="text-2xl font-extrabold">{formatRM(claim.amount)}</span>
      </div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Tuntutan untuk</dt><dd className="font-semibold">{claim.claimantName}</dd>
        <dt className="text-muted">Tarikh belanja</dt><dd>{formatDate(claim.claimDate)}</dd>
        <dt className="text-muted">Perkara</dt><dd>{claim.description}</dd>
        <dt className="text-muted">Perniagaan</dt><dd>{claim.businessUnitName} · {claim.categoryName}</dd>
        <dt className="text-muted">Dipohon oleh</dt><dd>{claim.requestedBy} · {formatDateTime(claim.createdAt)}</dd>
        <dt className="text-muted">Resit</dt><dd><ReceiptLink claim={claim} /></dd>
        {claim.reviewedBy && (<><dt className="text-muted">Disemak oleh</dt><dd>{claim.reviewedBy} · {formatDateTime(claim.reviewedAt!)}</dd></>)}
        {claim.reviewRemark && (<><dt className="text-muted">Catatan</dt><dd>{claim.reviewRemark}</dd></>)}
        {claim.paidDate && (<><dt className="text-muted">Dibayar</dt><dd>{formatDate(claim.paidDate)} · {claim.paidAccountName} · {paymentMethodLabel(claim.method!)}</dd></>)}
      </dl>

      {isManager && claim.status === 'Pending' && (
        <>
          <Field label="Catatan" hint="Wajib jika menolak." error={errs.remark}>
            <Textarea value={remark} maxLength={300} onChange={(e) => setRemark(e.target.value)} />
          </Field>
          {!!error && <ErrorBox error={error} />}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" disabled={m.review.isPending} onClick={() => review(false)}><Icon name="close" className="h-4 w-4" /> Tolak</Button>
            <Button disabled={m.review.isPending} onClick={() => review(true)}><Icon name="check" className="h-4 w-4" /> Lulus</Button>
          </div>
        </>
      )}

      {claim.status === 'Approved' && (paying ? (
        <div className="space-y-4 rounded-xl border border-line p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <PayFields accountId={accountId} onAccount={setAccountId} method={method} onMethod={setMethod} accountError={errs.accountId} />
            <Field label="Tarikh bayar" required error={errs.paidDate}><Input type="date" value={paidDate} max={today()} onChange={(e) => setPaidDate(e.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted">Rekod Duit Keluar akan dicipta dengan kategori {claim.categoryName}.</p>
          {!!error && <ErrorBox error={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPaying(false)}>Batal</Button>
            <Button onClick={pay} disabled={m.pay.isPending}>Simpan bayaran</Button>
          </div>
        </div>
      ) : (
        <Button className="w-full" onClick={() => setPaying(true)}><Icon name="wallet" className="h-4 w-4" /> Rekod bayaran balik</Button>
      ))}

      {claim.status === 'Paid' && (
        <div className="text-right">
          <button onClick={() => setUnpaying(true)} className="text-sm font-semibold text-expense hover:underline">Batal bayaran</button>
        </div>
      )}
      {!(isManager && claim.status === 'Pending') && claim.status !== 'Approved' && (
        <div className="flex justify-end"><Button variant="secondary" onClick={onDone}>Tutup</Button></div>
      )}
      <ReasonModal
        open={unpaying}
        title={`Batal bayaran ${claim.number}`}
        confirmLabel="Batal bayaran"
        busy={m.unpay.isPending}
        onClose={() => setUnpaying(false)}
        onConfirm={(reason) => m.unpay.mutateAsync({ id: claim.id, reason }).then(onDone)}
      />
    </div>
  )
}

function ClaimForm({ existing, onDone }: { existing?: Claim; onDone: () => void }) {
  const { save, remove, uploadReceipt } = useClaimMutations()
  const { data: employees = [] } = useEmployees()
  const { data: units = [] } = useBusinessUnits()
  const { data: categories = [] } = useCategories()
  const [employeeId, setEmployeeId] = useState<number | ''>(existing?.employeeId ?? '')
  const [claimDate, setClaimDate] = useState(existing?.claimDate ?? today())
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>(existing?.businessUnitId ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(existing?.categoryId ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<unknown>(null)
  const errs = fieldErrors(error)
  const busy = save.isPending || uploadReceipt.isPending
  const cats = expenseCategoriesFor(categories, businessUnitId)
  const effectiveCategory = categoryId || pickCategory(cats, /tuntutan|minyak|tol/i, businessUnitId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (file && file.size > 5 * 1024 * 1024) return setError(new Error('Saiz resit mesti kurang daripada 5 MB.'))
    try {
      const c = await save.mutateAsync({
        id: existing?.id,
        input: { employeeId: employeeId ? Number(employeeId) : null, claimDate, businessUnitId: Number(businessUnitId), categoryId: Number(effectiveCategory), description: description.trim(), amount: parseNum(amount) },
      })
      if (file) await uploadReceipt.mutateAsync({ id: c.id, file })
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  const del = async () => {
    if (!existing || !window.confirm(`Padam tuntutan ${existing.number}?`)) return
    try {
      await remove.mutateAsync(existing.id)
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {existing && <p className="rounded-xl bg-gold-50 p-3 text-sm text-gold-600">Menunggu kelulusan Pengurus. Anda masih boleh ubah sebelum ia disemak.</p>}
      <Field label="Jumlah (RM)" required error={errs.amount}>
        <Input inputMode="decimal" autoFocus value={amount} placeholder="0.00" onChange={(e) => setAmount(moneyInput(e.target.value))} className="text-2xl font-bold tabular-nums" />
      </Field>
      <Field label="Perkara" required error={errs.description}>
        <Input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Contoh: Minyak lori hantar nenas" />
      </Field>
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
        <Field label="Tarikh belanja" required error={errs.claimDate}><Input type="date" value={claimDate} max={today()} onChange={(e) => setClaimDate(e.target.value)} /></Field>
        <Field label="Tuntutan untuk" error={errs.employeeId}>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Saya sendiri</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Resit" hint="Gambar atau PDF, maksimum 5 MB." error={errs.file}>
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700" />
      </Field>
      {existing?.hasReceipt && !file && <ReceiptLink claim={existing} />}
      {!!error && <ErrorBox error={error} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {existing ? <Button type="button" variant="ghost" className="text-expense" onClick={del}>Padam</Button> : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onDone}>Batal</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : existing ? 'Simpan' : 'Hantar tuntutan'}</Button>
        </div>
      </div>
    </form>
  )
}

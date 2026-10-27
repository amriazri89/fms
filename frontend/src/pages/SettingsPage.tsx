import { useState } from 'react'
import { useAccounts, useAuditLogs, useBusinessUnits, useCategories, useFamilyMembers, useUserMutations, useUsers } from '../api/hooks'
import type { Account, BusinessUnit, Category, FamilyMember, User, UserRole } from '../api/types'
import { roleLabels, useAuth } from '../auth/AuthContext'
import { MasterTable } from '../components/MasterTable'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, Money, PageHeader, Segmented, Select, Spinner } from '../components/ui'
import { formatDateTime } from '../lib/format'

type Tab = 'business' | 'accounts' | 'categories' | 'members' | 'users' | 'audit'
const tabs: { key: Tab; label: string }[] = [
  { key: 'business', label: 'Perniagaan' },
  { key: 'accounts', label: 'Akaun' },
  { key: 'categories', label: 'Kategori' },
  { key: 'members', label: 'Ahli keluarga' },
  { key: 'users', label: 'Pengguna' },
  { key: 'audit', label: 'Log perubahan' },
]

const accountTypeLabel = { Cash: 'Tunai', Bank: 'Bank' } as const
const categoryTypeLabel = { Income: 'Duit masuk', Expense: 'Duit keluar' } as const

function BusinessTab() {
  const { data, isLoading } = useBusinessUnits(true)
  return (
    <MasterTable<BusinessUnit>
      title="Perniagaan"
      description="Setiap rekod duit masuk dan keluar mesti dilabel dengan salah satu perniagaan ini."
      resource="business-units"
      cacheKey="business-units"
      rows={data}
      loading={isLoading}
      emptyRow={{
        name: '', description: null, color: '#1F6F4A', sortOrder: (data?.length ?? 0) + 1, isActive: true,
        legalName: null, registrationNo: null, address: null, phone: null, email: null, paymentInfo: null, documentFooter: null,
      }}
      fields={[
        { key: 'name', label: 'Nama', kind: 'text', required: true },
        { key: 'description', label: 'Keterangan', kind: 'text' },
        { key: 'color', label: 'Warna', kind: 'color', hint: 'Juga digunakan sebagai warna dokumen yang dicetak.' },
        { key: 'sortOrder', label: 'Susunan', kind: 'number' },
        { key: 'isActive', label: 'Aktif', kind: 'checkbox' },
        { key: 'legalName', label: 'Nama pada dokumen', kind: 'text', section: 'Dicetak pada sebut harga / invois / resit', hint: 'Kosongkan untuk guna nama di atas.' },
        { key: 'registrationNo', label: 'No. SSM / pendaftaran', kind: 'text', section: 'Dicetak pada sebut harga / invois / resit' },
        { key: 'address', label: 'Alamat', kind: 'textarea', section: 'Dicetak pada sebut harga / invois / resit' },
        { key: 'phone', label: 'No. telefon', kind: 'text', section: 'Dicetak pada sebut harga / invois / resit' },
        { key: 'email', label: 'E-mel', kind: 'text', section: 'Dicetak pada sebut harga / invois / resit' },
        { key: 'paymentInfo', label: 'Maklumat bayaran', kind: 'textarea', section: 'Dicetak pada sebut harga / invois / resit', hint: 'Contoh: Maybank 1122 3344 5566 (Nama akaun)' },
        { key: 'documentFooter', label: 'Nota kaki', kind: 'text', section: 'Dicetak pada sebut harga / invois / resit', hint: 'Contoh: Terima kasih atas sokongan anda.' },
      ]}
      columns={[
        { label: 'Nama', render: (r) => (<span className="font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color ?? '#999' }} />{r.name}</span>) },
        { label: 'Keterangan', render: (r) => <span className="text-muted">{r.description}</span>, className: 'hidden sm:table-cell' },
      ]}
    />
  )
}

function AccountsTab() {
  const { data, isLoading } = useAccounts(true)
  const { data: units = [] } = useBusinessUnits(true)
  return (
    <MasterTable<Account>
      title="Akaun"
      description="Satu akaun bagi setiap perniagaan — baki satu jumlah. Tunai atau Bank dipilih pada setiap rekod Duit Masuk / Keluar. Baki awal ialah baki pada hari mula guna sistem."
      resource="accounts"
      cacheKey="accounts"
      rows={data}
      loading={isLoading}
      emptyRow={{ name: '', type: 'Bank', openingBalance: 0, businessUnitId: null, sortOrder: (data?.length ?? 0) + 1, isActive: true }}
      fields={[
        { key: 'name', label: 'Nama akaun', kind: 'text', required: true },
        { key: 'type', label: 'Jenis', kind: 'select', required: true, options: [{ value: 'Cash', label: 'Tunai' }, { value: 'Bank', label: 'Bank' }] },
        { key: 'openingBalance', label: 'Baki awal (RM)', kind: 'number' },
        { key: 'businessUnitId', label: 'Milik perniagaan', kind: 'select', allowEmpty: 'Dikongsi semua', options: units.map((u) => ({ value: u.id, label: u.name })) },
        { key: 'sortOrder', label: 'Susunan', kind: 'number' },
        { key: 'isActive', label: 'Aktif', kind: 'checkbox' },
      ]}
      columns={[
        { label: 'Nama', render: (r) => <span className="font-semibold">{r.name}</span> },
        { label: 'Milik perniagaan', render: (r) => (r.businessUnitId ? units.find((u) => u.id === r.businessUnitId)?.name ?? '?' : `Dikongsi · ${accountTypeLabel[r.type]}`) },
        { label: 'Baki awal', render: (r) => <Money value={r.openingBalance} />, className: 'text-right' },
      ]}
    />
  )
}

function CategoriesTab() {
  const { data, isLoading } = useCategories(true)
  const { data: units = [] } = useBusinessUnits(true)
  const [filter, setFilter] = useState<'Expense' | 'Income'>('Expense')
  const unitName = (id: number | null) => (id ? units.find((u) => u.id === id)?.name ?? '?' : 'Semua perniagaan')
  return (
    <div className="space-y-3">
      <Segmented value={filter} onChange={setFilter} options={[{ key: 'Expense', label: 'Duit keluar' }, { key: 'Income', label: 'Duit masuk' }]} />
      <MasterTable<Category>
        title="Kategori"
        description="Kategori kosong 'perniagaan' boleh digunakan oleh semua perniagaan."
        resource="categories"
        cacheKey="categories"
        rows={data?.filter((c) => c.type === filter)}
        loading={isLoading}
        emptyRow={{ name: '', type: filter, businessUnitId: null, sortOrder: 1, isActive: true }}
        fields={[
          { key: 'name', label: 'Nama kategori', kind: 'text', required: true },
          { key: 'type', label: 'Jenis', kind: 'select', required: true, options: [{ value: 'Expense', label: 'Duit keluar' }, { value: 'Income', label: 'Duit masuk' }] },
          { key: 'businessUnitId', label: 'Perniagaan', kind: 'select', allowEmpty: 'Semua perniagaan', options: units.map((u) => ({ value: u.id, label: u.name })) },
          { key: 'sortOrder', label: 'Susunan', kind: 'number' },
          { key: 'isActive', label: 'Aktif', kind: 'checkbox' },
        ]}
        columns={[
          { label: 'Nama', render: (r) => <span className="font-semibold">{r.name}</span> },
          { label: 'Perniagaan', render: (r) => unitName(r.businessUnitId) },
          { label: 'Jenis', render: (r) => categoryTypeLabel[r.type], className: 'hidden sm:table-cell' },
        ]}
      />
    </div>
  )
}

function MembersTab() {
  const { data, isLoading } = useFamilyMembers(true)
  return (
    <MasterTable<FamilyMember>
      title="Ahli keluarga"
      description="Untuk rekod ambilan keluarga dan modal masuk."
      resource="family-members"
      cacheKey="family-members"
      rows={data}
      loading={isLoading}
      emptyRow={{ name: '', relationship: null, isActive: true }}
      fields={[
        { key: 'name', label: 'Nama', kind: 'text', required: true },
        { key: 'relationship', label: 'Hubungan', kind: 'text', hint: 'Contoh: Bapa, Ibu, Anak sulung' },
        { key: 'isActive', label: 'Aktif', kind: 'checkbox' },
      ]}
      columns={[
        { label: 'Nama', render: (r) => <span className="font-semibold">{r.name}</span> },
        { label: 'Hubungan', render: (r) => r.relationship },
      ]}
    />
  )
}

const roles: UserRole[] = ['Manager', 'Clerk']
const roleHelp: Record<UserRole, string> = {
  Manager: 'Ayah. Semua akses: tetapan, lulus tuntutan, padam rekod.',
  Clerk: 'Anak. Semua kemasukan data harian, mohon tuntutan dan lihat laporan.',
}

function UsersTab() {
  const { user: me } = useAuth()
  const { data, isLoading } = useUsers()
  const { create, update, resetPassword } = useUserMutations()
  const [form, setForm] = useState<{ id?: number; username: string; fullName: string; role: UserRole; isActive: boolean; password: string } | null>(null)
  const [error, setError] = useState<unknown>(null)

  const submit = async () => {
    if (!form) return
    setError(null)
    try {
      if (form.id) {
        await update.mutateAsync({ id: form.id, fullName: form.fullName, role: form.role, isActive: form.isActive })
        if (form.password) await resetPassword.mutateAsync({ id: form.id, newPassword: form.password })
      } else {
        await create.mutateAsync({ username: form.username, fullName: form.fullName, role: form.role, password: form.password })
      }
      setForm(null)
    } catch (e) {
      setError(e)
    }
  }

  const edit = (u: User) => setForm({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, isActive: u.isActive, password: '' })

  return (
    <Card
      title="Pengguna"
      action={<Button variant="secondary" className="min-h-[36px] px-3" onClick={() => setForm({ username: '', fullName: '', role: 'Clerk', isActive: true, password: '' })}>+ Tambah</Button>}
    >
      {isLoading && <Spinner />}
      <ul className="divide-y divide-line/60">
        {data?.map((u) => (
          <li key={u.id} className={'flex items-center justify-between gap-3 py-3 ' + (u.isActive ? '' : 'opacity-50')}>
            <div>
              <div className="font-semibold text-ink">{u.fullName} {u.id === me?.id && <Badge tone="gold">Anda</Badge>}</div>
              <div className="text-xs text-muted">@{u.username} · {roleLabels[u.role]}{!u.isActive && ' · Tidak aktif'}</div>
            </div>
            <Button variant="secondary" className="min-h-[36px] px-3" onClick={() => edit(u)}>Ubah</Button>
          </li>
        ))}
      </ul>

      <Modal open={!!form} title={form?.id ? 'Ubah pengguna' : 'Tambah pengguna'} onClose={() => setForm(null)}>
        {form && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <Field label="Nama pengguna (untuk log masuk)" required>
              <Input value={form.username} disabled={!!form.id} autoCapitalize="none" required onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="Nama penuh" required>
              <Input value={form.fullName} required onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </Field>
            <Field label="Peranan" hint={roleHelp[form.role]}>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {roles.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
              </Select>
            </Field>
            <Field label={form.id ? 'Kata laluan baru (biar kosong jika tidak tukar)' : 'Kata laluan'} required={!form.id} hint="Sekurang-kurangnya 8 aksara.">
              <Input type="password" autoComplete="new-password" minLength={8} required={!form.id} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            {form.id && (
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Aktif
              </label>
            )}
            {!!error && <ErrorBox error={error} />}
            <div className="flex justify-end">
              <Button type="submit" disabled={create.isPending || update.isPending}>Simpan</Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}

const actionLabel: Record<string, string> = { Create: 'Tambah', Update: 'Ubah', Delete: 'Padam', ResetPassword: 'Tukar kata laluan' }

function AuditTab() {
  const { data, isLoading, error } = useAuditLogs()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <Card title="Log perubahan (300 terkini)">
      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}
      <ul className="divide-y divide-line/60 text-sm">
        {data?.map((a) => (
          <li key={a.id} className="py-2.5">
            <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <span>
                <b>{a.username}</b> {actionLabel[a.action] ?? a.action} <span className="text-muted">{a.entity} #{a.entityId}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDateTime(a.timestamp)}</span>
            </button>
            {open === a.id && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {a.oldValue && <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-red-50 p-2 text-xs">{pretty(a.oldValue)}</pre>}
                {a.newValue && <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-brand-50 p-2 text-xs">{pretty(a.newValue)}</pre>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const pretty = (json: string) => {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('business')
  return (
    <div className="space-y-4">
      <PageHeader title="Tetapan" subtitle="Hanya pengurus sistem boleh ubah tetapan." />
      <div className="-mx-1 overflow-x-auto px-1">
        <Segmented value={tab} onChange={setTab} options={tabs} />
      </div>
      {tab === 'business' && <BusinessTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

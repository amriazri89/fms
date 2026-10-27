import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { download } from '../api/client'
import { useAccounts, useBusinessUnits, useTransaction, useTransactionMutations, useTransactions } from '../api/hooks'
import { useDocumentSettings } from '../api/salesHooks'
import type { MoneyChannel, Transaction, TransactionFilter, TransactionType } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import { PeriodFilter, usePeriod } from '../components/PeriodFilter'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionRow } from '../components/TransactionRow'
import { Button, Card, Empty, ErrorBox, Input, Modal, Money, PageHeader, Select, Spinner } from '../components/ui'
import { channelLabel, channels } from '../config/channels'
import { transactionTypes, typeConfig } from '../config/transactionTypes'
import { formatDateTime } from '../lib/format'

const PAGE_SIZE = 30

export default function TransactionsPage() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Manager', 'Clerk')
  const canDelete = hasRole('Manager')

  const [params, setParams] = useSearchParams()
  const [period, setPeriod] = usePeriod('month')
  const [type, setType] = useState<TransactionType | ''>('')
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [channel, setChannel] = useState<MoneyChannel | ''>('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [editing, setEditing] = useState(false)

  const { data: units = [] } = useBusinessUnits()
  const { data: accounts = [] } = useAccounts()
  const { remove } = useTransactionMutations()
  const docSettings = useDocumentSettings().data
  // Rekod yang dijana oleh dokumen lain dikunci (ubah melalui modul asal)
  const linkedSource = (t: { reference: string | null; type: string }) => {
    const ref = t.reference ?? ''
    const s = docSettings
    if (s && ref.startsWith(`${s.receiptPrefix}-`)) return { label: 'Dari resit', note: 'ubah melalui modul Resit' }
    if (s && ref.startsWith(`${s.paymentVoucherPrefix}-`)) return { label: 'Dari baucar bayaran', note: 'batal melalui modul Hutang kita' }
    if (s && ref.startsWith(`${s.payslipPrefix}-`)) return { label: 'Dari slip gaji', note: 'batal melalui modul Gaji pekerja' }
    if (s && ref.startsWith(`${s.utilityBillPrefix}-`)) return { label: 'Dari bil utiliti', note: 'batal bayaran melalui modul Bil utiliti' }
    if (s && ref.startsWith(`${s.claimPrefix}-`)) return { label: 'Dari tuntutan', note: 'batal bayaran melalui modul Tuntutan' }
    if (t.type === 'LoanIn' || t.type === 'LoanRepayment' || (s && ref.startsWith(`${s.payablePrefix}-`)))
      return { label: 'Dari pinjaman', note: 'urus melalui modul Hutang kita' }
    return null
  }

  // Buka rekod dari pautan (contoh: /rekod?edit=12)
  const editId = Number(params.get('edit')) || undefined
  const { data: linked } = useTransaction(editId)
  useEffect(() => {
    if (linked) {
      setSelected(linked)
      setParams({}, { replace: true })
    }
  }, [linked, setParams])

  useEffect(() => {
    const h = setTimeout(() => setSearch(q), 350)
    return () => clearTimeout(h)
  }, [q])

  const filter: TransactionFilter = {
    from: period.from,
    to: period.to,
    type: type || undefined,
    businessUnitId: businessUnitId || undefined,
    accountId: accountId || undefined,
    channel: channel || undefined,
    q: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  }
  useEffect(() => setPage(1), [period.from, period.to, type, businessUnitId, accountId, channel, search])

  const { data, isLoading, error } = useTransactions(filter)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const close = () => {
    setSelected(null)
    setEditing(false)
  }

  const doDelete = async () => {
    if (!selected) return
    if (!window.confirm('Padam rekod ini? Tindakan ini direkod dalam log perubahan.')) return
    try {
      await remove.mutateAsync(selected.id)
      close()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal memadam rekod.')
    }
  }

  const exportCsv = () => {
    const { page: _p, pageSize: _s, ...rest } = filter
    void _p
    void _s
    download('/transactions/export', { ...rest }, `rekod-${period.from}-${period.to}.csv`).catch((e) => alert(e.message))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Senarai rekod"
        actions={
          canEdit && (
            <Button variant="secondary" onClick={exportCsv}>
              <Icon name="download" className="h-4 w-4" /> Muat turun CSV
            </Button>
          )
        }
      />

      <Card>
        <div className="space-y-3">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari catatan, pelanggan…" className="pl-9" />
            </div>
            <Select value={type} onChange={(e) => setType(e.target.value as TransactionType | '')}>
              <option value="">Semua jenis</option>
              {transactionTypes.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </Select>
            <Select value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Semua perniagaan</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Semua akaun</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
            <Select value={channel} onChange={(e) => setChannel(e.target.value as MoneyChannel | '')}>
              <option value="">Tunai & Bank</option>
              {channels.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {data && (
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-white p-3 shadow-sm"><div className="text-xs text-muted">Masuk</div><Money value={data.totalIncome} tone="income" className="font-bold" /></div>
          <div className="rounded-xl bg-white p-3 shadow-sm"><div className="text-xs text-muted">Keluar</div><Money value={data.totalExpense} tone="expense" className="font-bold" /></div>
          <div className="rounded-xl bg-white p-3 shadow-sm"><div className="text-xs text-muted">Bersih</div><Money value={data.totalIncome - data.totalExpense} tone="auto" className="font-bold" /></div>
        </div>
      )}

      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data && data.items.length === 0 && <Empty>Tiada rekod untuk tapisan ini.</Empty>}
        {data && data.items.length > 0 && (
          <>
            <div className="-mx-2 divide-y divide-line/60">
              {data.items.map((t) => (
                <TransactionRow key={t.id} t={t} onClick={() => setSelected(t)} />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>{data.total} rekod</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
                <span>{page} / {pages}</span>
                <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={!!selected} title={editing ? 'Ubah rekod' : 'Butiran rekod'} onClose={close}>
        {selected && !editing && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Jenis</dt><dd className="font-semibold">{typeConfig(selected.type).label}</dd>
              <dt className="text-muted">Tarikh</dt><dd>{selected.date}</dd>
              <dt className="text-muted">Jumlah</dt><dd className="text-lg font-bold"><Money value={selected.amount} /></dd>
              {selected.businessUnitName && (<><dt className="text-muted">Perniagaan</dt><dd>{selected.businessUnitName}</dd></>)}
              {selected.toBusinessUnitName && (<><dt className="text-muted">Peminjam</dt><dd>{selected.toBusinessUnitName}</dd></>)}
              {selected.categoryName && (<><dt className="text-muted">Kategori</dt><dd>{selected.categoryName}</dd></>)}
              {selected.familyMemberName && (<><dt className="text-muted">Ahli keluarga</dt><dd>{selected.familyMemberName}</dd></>)}
              <dt className="text-muted">Akaun</dt><dd>{selected.accountName}{selected.toAccountName ? ` → ${selected.toAccountName}` : ''}</dd>
              {selected.channel && (<><dt className="text-muted">Tunai / Bank</dt><dd>{channelLabel(selected.channel)}</dd></>)}
              {selected.party && (<><dt className="text-muted">Pihak</dt><dd>{selected.party}</dd></>)}
              {selected.reference && (<><dt className="text-muted">Rujukan</dt><dd>{selected.reference}</dd></>)}
              {selected.description && (<><dt className="text-muted">Catatan</dt><dd>{selected.description}</dd></>)}
              {linkedSource(selected) && (<><dt className="text-muted">{linkedSource(selected)!.label}</dt><dd className="text-brand-700">{selected.reference} — {linkedSource(selected)!.note}</dd></>)}
              <dt className="text-muted">Direkod oleh</dt><dd>{selected.createdBy} · {formatDateTime(selected.createdAt)}</dd>
              {selected.updatedAt && (<><dt className="text-muted">Dikemas kini</dt><dd>{formatDateTime(selected.updatedAt)}</dd></>)}
            </dl>
            {(canEdit || canDelete) && !linkedSource(selected) && (
              <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
                {canDelete && (
                  <Button variant="danger" onClick={doDelete} disabled={remove.isPending}>
                    <Icon name="trash" className="h-4 w-4" /> Padam
                  </Button>
                )}
                {canEdit && (
                  <Button onClick={() => setEditing(true)}>
                    <Icon name="edit" className="h-4 w-4" /> Ubah
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {selected && editing && (
          <TransactionForm type={selected.type} existing={selected} onSaved={close} onCancel={() => setEditing(false)} />
        )}
      </Modal>
    </div>
  )
}

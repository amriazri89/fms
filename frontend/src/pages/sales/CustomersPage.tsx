import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCustomerMutations, useCustomers, useFollowUps } from '../../api/salesHooks'
import { Icon } from '../../components/Icon'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { Badge, Button, Card, Empty, ErrorBox, Input, Money, PageHeader, Segmented, Spinner, cx } from '../../components/ui'
import { activityLabel } from '../../config/sales'
import { formatDate, formatRM, today } from '../../lib/format'

type Sort = 'name' | 'outstanding'

export default function CustomersPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error } = useCustomers(search)
  const { data: followUps = [] } = useFollowUps()
  const { setDone } = useCustomerMutations()

  useEffect(() => {
    const h = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(h)
  }, [q])

  const rows = [...(data ?? [])].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.outstanding - a.outstanding))
  const t = today()
  const due = followUps.filter((f) => f.followUpDate && f.followUpDate <= t)
  const upcoming = followUps.filter((f) => f.followUpDate && f.followUpDate > t).slice(0, 5)
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pelanggan"
        subtitle={data && `${rows.length} pelanggan · Jumlah belum dibayar ${formatRM(totalOutstanding)}`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" className="h-4 w-4" /> Pelanggan baru
          </Button>
        }
      />

      {(due.length > 0 || upcoming.length > 0) && (
        <Card title="Tindakan susulan">
          <ul className="divide-y divide-line/60">
            {[...due, ...upcoming].map((f) => {
              const overdue = f.followUpDate! < t
              return (
                <li key={f.id} className="flex items-start gap-3 py-2.5">
                  <button
                    onClick={() => setDone.mutate({ id: f.id, done: true })}
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-line text-transparent hover:border-brand-500 hover:text-brand-500"
                    aria-label="Tanda selesai"
                    title="Tanda selesai"
                  >
                    <Icon name="check" className="h-4 w-4" />
                  </button>
                  <Link to={`/pelanggan/${f.customerId}`} className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{f.customerName}</span>
                    <span className="block text-sm text-muted">{f.note}</span>
                  </Link>
                  <span className={cx('shrink-0 text-xs font-semibold', overdue ? 'text-expense' : f.followUpDate === t ? 'text-gold-600' : 'text-muted')}>
                    {f.followUpDate === t ? 'Hari ini' : formatDate(f.followUpDate!)}
                    <span className="block text-right font-normal text-muted">{activityLabel(f.type)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, telefon, label…" className="pl-9" />
          </div>
          <Segmented value={sort} onChange={setSort} options={[{ key: 'name', label: 'Nama' }, { key: 'outstanding', label: 'Hutang tertinggi' }]} />
        </div>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data && rows.length === 0 && <Empty>{search ? 'Tiada padanan.' : 'Belum ada pelanggan. Tambah pelanggan pertama anda.'}</Empty>}
        <ul className="-mx-2 divide-y divide-line/60">
          {rows.map((c) => (
            <li key={c.id}>
              <Link to={`/pelanggan/${c.id}`} className={cx('flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-gray-50', !c.isActive && 'opacity-50')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                  {c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                    {c.tag && <Badge>{c.tag}</Badge>}
                    {c.openQuotations > 0 && <Badge tone="gold">{c.openQuotations} sebut harga terbuka</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[c.contactPerson, c.phone, c.lastActivity && `Aktiviti terakhir ${formatDate(c.lastActivity)}`].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {c.outstanding > 0 ? (
                    <>
                      <Money value={c.outstanding} className={cx('block text-sm font-bold', c.overdueInvoices > 0 ? 'text-expense' : 'text-ink')} />
                      <span className="block text-xs text-muted">{c.overdueInvoices > 0 ? `${c.overdueInvoices} tertunggak` : 'belum dibayar'}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted">Tiada hutang</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <CustomerFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/pelanggan/${c.id}`)} />
    </div>
  )
}

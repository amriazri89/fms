import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSuppliers } from '../../api/payableHooks'
import { Icon } from '../../components/Icon'
import { SupplierFormModal } from '../../components/payables/SupplierFormModal'
import { Badge, Button, Card, Empty, ErrorBox, Input, Money, PageHeader, Segmented, Spinner, cx } from '../../components/ui'
import { formatDate, formatRM } from '../../lib/format'

type Sort = 'name' | 'outstanding' | 'due'

export default function SuppliersPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('outstanding')
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error } = useSuppliers(search)

  useEffect(() => {
    const h = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(h)
  }, [q])

  const rows = [...(data ?? [])].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'outstanding') return b.outstanding - a.outstanding || a.name.localeCompare(b.name)
    return (a.nextDueDate ?? '9999').localeCompare(b.nextDueDate ?? '9999')
  })
  const total = rows.reduce((s, r) => s + r.outstanding, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pembekal & pemiutang"
        subtitle={data && `${rows.length} pembekal · Kita masih berhutang ${formatRM(total)}`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" className="h-4 w-4" /> Pembekal baru
          </Button>
        }
      />

      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, telefon, label…" className="pl-9" />
          </div>
          <Segmented value={sort} onChange={setSort} options={[
            { key: 'outstanding', label: 'Hutang tertinggi' },
            { key: 'due', label: 'Tarikh akhir' },
            { key: 'name', label: 'Nama' },
          ]} />
        </div>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data && rows.length === 0 && <Empty>{search ? 'Tiada padanan.' : 'Belum ada pembekal. Tambah kedai, bank atau orang yang anda berhutang.'}</Empty>}
        <ul className="-mx-2 divide-y divide-line/60">
          {rows.map((s) => (
            <li key={s.id}>
              <Link to={`/pembekal/${s.id}`} className={cx('flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-gray-50', !s.isActive && 'opacity-50')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-50 text-sm font-bold text-gold-600">
                  {s.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                    {s.tag && <Badge>{s.tag}</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[s.contactPerson, s.phone, s.nextDueDate && `Akhir bayar terdekat ${formatDate(s.nextDueDate)}`].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {s.outstanding > 0 ? (
                    <>
                      <Money value={s.outstanding} className={cx('block text-sm font-bold', s.overdueCount > 0 ? 'text-expense' : 'text-ink')} />
                      <span className="block text-xs text-muted">{s.overdueCount > 0 ? `${s.overdueCount} lewat bayar` : `${s.openCount} belum lunas`}</span>
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

      <SupplierFormModal open={creating} onClose={() => setCreating(false)} onSaved={(s) => navigate(`/pembekal/${s.id}`)} />
    </div>
  )
}

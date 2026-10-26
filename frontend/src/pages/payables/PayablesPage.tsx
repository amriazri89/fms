import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePayables } from '../../api/payableHooks'
import type { PayableKind } from '../../api/types'
import { Icon } from '../../components/Icon'
import { PayableRow } from '../../components/payables/common'
import { ChipFilter } from '../../components/sales/common'
import { Button, Card, Empty, ErrorBox, Input, Money, PageHeader, Segmented, Spinner } from '../../components/ui'
import { kindFilters, payableFilters } from '../../config/payables'

const PAGE_SIZE = 30

/** Kita hutang orang: bil pembekal & pinjaman. */
export default function PayablesPage() {
  const [status, setStatus] = useState('unpaid')
  const [kind, setKind] = useState<'' | PayableKind>('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const h = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(h)
  }, [q])
  useEffect(() => setPage(1), [status, kind, search])

  const { data, isLoading, error } = usePayables({ status: status || undefined, kind: kind || undefined, q: search || undefined, page, pageSize: PAGE_SIZE })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hutang kita"
        subtitle="Bil pembekal yang belum dibayar dan pinjaman"
        actions={
          <Link to="/hutang/baru" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            <Icon name="plus" className="h-4 w-4" /> Rekod hutang
          </Link>
        }
      />

      <div className="space-y-2">
        <ChipFilter value={status} onChange={setStatus} options={payableFilters} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-80">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no., pembekal, perkara…" className="pl-9" />
          </div>
          <Segmented value={kind} onChange={(v) => setKind(v as '' | PayableKind)} options={kindFilters as { key: '' | PayableKind; label: string }[]} />
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-2 text-sm sm:max-w-md">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <div className="text-xs text-muted">{data.total} hutang · jumlah asal</div>
            <Money value={data.sumTotal} className="font-bold" />
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <div className="text-xs text-muted">Baki perlu dibayar</div>
            <Money value={data.sumOutstanding} className="font-bold text-expense" />
          </div>
        </div>
      )}

      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data && data.items.length === 0 && <Empty>{status === 'unpaid' ? 'Tiada hutang belum lunas. 👍' : 'Tiada rekod.'}</Empty>}
        {data && data.items.length > 0 && (
          <>
            <div className="-mx-2 divide-y divide-line/60">
              {data.items.map((p) => <PayableRow key={p.id} p={p} />)}
            </div>
            {pages > 1 && (
              <div className="mt-4 flex items-center justify-end gap-2 text-sm text-muted">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
                <span>{page} / {pages}</span>
                <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

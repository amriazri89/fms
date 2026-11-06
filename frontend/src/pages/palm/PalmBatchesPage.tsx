import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePalmSummary } from '../../api/palmHooks'
import { Icon } from '../../components/Icon'
import { ChipFilter, StatusBadge } from '../../components/sales/common'
import { ListRow } from '../../components/staff/common'
import { Button, Card, Empty, ErrorBox, Money, PageHeader, Spinner } from '../../components/ui'
import { palmStatus } from '../../config/palm'
import { formatDate, formatRM } from '../../lib/format'

const filters = [
  { key: '', label: 'Semua' },
  { key: 'Draft', label: 'Draf' },
  { key: 'Posted', label: 'Disahkan' },
  { key: 'Cancelled', label: 'Dibatalkan' },
]

/** Agihan sawit: bayaran kilang dan duit pemilik yang belum dibayar. */
export default function PalmBatchesPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const { data, isLoading, error } = usePalmSummary({ status: status || undefined })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agihan sawit"
        subtitle="Kilang bayar sekali untuk banyak tiket. Caj (upah potong, transport) jadi pendapatan; baki dibayar kepada setiap pemilik."
        actions={
          <>
            <Link to="/sawit/pemilik" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold hover:bg-brand-50">
              <Icon name="users" className="h-4 w-4" /> Pemilik
            </Link>
            <Button onClick={() => navigate('/sawit/baru')}><Icon name="plus" className="h-4 w-4" /> Bayaran kilang baru</Button>
          </>
        }
      />

      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Duit pemilik belum dibayar</div>
            <Money value={data.unpaidToOwners} className="mt-1 block text-2xl font-extrabold text-expense" />
            <div className="text-xs text-muted">{data.ownersWaiting} pemilik menunggu · duit ini ada dalam baki akaun tetapi bukan milik perniagaan</div>
          </div>
          <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Pendapatan caj (senarai di bawah)</div>
            <Money
              value={data.batches.filter((b) => b.status === 'Posted').reduce((s, b) => s + b.totalCharges, 0)}
              className="mt-1 block text-2xl font-extrabold text-income"
            />
            <div className="text-xs text-muted">Upah potong, transport dan caj lain daripada bayaran kilang yang disahkan</div>
          </div>
        </div>
      )}

      <ChipFilter value={status} onChange={setStatus} options={filters} />

      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data?.batches.length === 0 && <Empty>Belum ada bayaran kilang.</Empty>}
        <div className="-mx-2 divide-y divide-line/60">
          {data?.batches.map((b) => (
            <ListRow
              key={b.id}
              onClick={() => navigate(`/sawit/${b.id}`)}
              muted={b.status === 'Cancelled'}
              title={`${b.millName} · ${b.number}`}
              badges={<StatusBadge {...palmStatus[b.status]} />}
              sub={[
                formatDate(b.date),
                b.businessUnitName,
                `${b.ticketCount} tiket · ${b.ownerCount} pemilik`,
                b.status === 'Posted' && `${b.ownersPaid}/${b.ownerCount} sudah dibayar`,
              ].filter(Boolean).join(' · ')}
              amount={b.amountReceived}
              right={b.unpaidToOwners > 0 ? <span className="block text-xs font-semibold text-expense">Belum bayar {formatRM(b.unpaidToOwners)}</span> : undefined}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}

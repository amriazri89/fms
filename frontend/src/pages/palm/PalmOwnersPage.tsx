import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePalmOwners } from '../../api/palmHooks'
import type { PalmOwner } from '../../api/types'
import { Icon } from '../../components/Icon'
import { PalmOwnerForm } from '../../components/palm/PalmOwnerForm'
import { ListRow } from '../../components/staff/common'
import { Badge, Button, Card, Empty, ErrorBox, Input, Modal, PageHeader, Spinner } from '../../components/ui'
import { formatRM } from '../../lib/format'

/** Senarai pemilik sawit. */
export default function PalmOwnersPage() {
  const [showInactive, setShowInactive] = useState(false)
  const [q, setQ] = useState('')
  const { data, isLoading, error } = usePalmOwners(showInactive)
  const [editing, setEditing] = useState<PalmOwner | 'new' | null>(null)
  const rows = (data ?? []).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.phone?.includes(q))

  return (
    <div className="space-y-4">
      <Link to="/sawit" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Agihan sawit
      </Link>
      <PageHeader
        title="Pemilik sawit"
        subtitle={data && `${data.length} pemilik · belum dibayar ${formatRM(data.reduce((s, o) => s + o.unpaid, 0))}`}
        actions={<Button onClick={() => setEditing('new')}><Icon name="plus" className="h-4 w-4" /> Pemilik baru</Button>}
      />
      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-72">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau telefon…" className="pl-9" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Tunjuk tidak aktif
          </label>
        </div>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data && rows.length === 0 && <Empty>Belum ada pemilik.</Empty>}
        <div className="-mx-2 divide-y divide-line/60">
          {rows.map((o) => (
            <ListRow
              key={o.id}
              onClick={() => setEditing(o)}
              muted={!o.isActive}
              title={o.name}
              badges={!o.isActive ? <Badge>Tidak aktif</Badge> : undefined}
              sub={[o.phone, o.bankInfo].filter(Boolean).join(' · ') || '—'}
              right={o.unpaid > 0 ? <span className="text-xs font-semibold text-expense">Belum dibayar {formatRM(o.unpaid)}</span> : <span className="text-xs text-muted">Tiada tunggakan</span>}
            />
          ))}
        </div>
      </Card>
      <Modal open={!!editing} title={editing === 'new' ? 'Pemilik sawit baru' : 'Ubah pemilik'} onClose={() => setEditing(null)}>
        {editing && (
          <PalmOwnerForm existing={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  )
}

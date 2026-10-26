import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCreditBook } from '../../api/creditBookHooks'
import { useBusinessUnits } from '../../api/hooks'
import { CreditEntryForm } from '../../components/creditbook/CreditForms'
import { Icon } from '../../components/Icon'
import { Badge, Button, Card, Empty, ErrorBox, Input, Modal, Money, PageHeader, Segmented, Select, Spinner } from '../../components/ui'
import { formatDate, formatRM } from '../../lib/format'

type Show = 'owing' | 'all'

/** Buku hutang kedai (555): siapa berhutang, berapa, dan sejak bila. */
export default function CreditBookPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const customerId = Number(params.get('pelanggan')) || undefined

  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>('')
  const [show, setShow] = useState<Show>('owing')
  const [adding, setAdding] = useState(false)

  const { data: units = [] } = useBusinessUnits()
  const { data, isLoading, error } = useCreditBook({
    q: search || undefined,
    businessUnitId: businessUnitId || undefined,
    customerId,
    includeSettled: show === 'all',
  })

  useEffect(() => {
    const h = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(h)
  }, [q])

  // Dari skrin Pelanggan: terus buka lejar jika pelanggan ada satu buku sahaja
  useEffect(() => {
    if (customerId && data && data.rows.length === 1) {
      const r = data.rows[0]
      navigate(`/buku-hutang/${r.customerId}/${r.businessUnitId}`, { replace: true })
    }
  }, [customerId, data, navigate])

  const multiUnit = units.length > 1
  const rows = data?.rows ?? []
  const customerName = customerId ? rows[0]?.customerName : undefined

  return (
    <div className="space-y-4">
      <PageHeader
        title="Buku hutang (555)"
        subtitle={data && `${data.customersOwing} pelanggan berhutang · Jumlah ${formatRM(data.totalBalance)}`}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Icon name="plus" className="h-4 w-4" /> Rekod hutang
          </Button>
        }
      />

      {customerId && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
          <span>Buku hutang untuk <b>{customerName ?? 'pelanggan ini'}</b></span>
          <button className="font-semibold text-brand-700 hover:underline" onClick={() => setParams({})}>Semua pelanggan</button>
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            {!customerId && (
              <div className="relative sm:w-72">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau telefon…" className="pl-9" />
              </div>
            )}
            {multiUnit && (
              <Select value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : '')} className="sm:w-56">
                <option value="">Semua perniagaan</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            )}
          </div>
          <Segmented value={show} onChange={setShow} options={[{ key: 'owing', label: 'Berhutang' }, { key: 'all', label: 'Semua' }]} />
        </div>

        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data && rows.length === 0 && (
          <Empty>{search ? 'Tiada padanan.' : show === 'owing' ? 'Tiada pelanggan berhutang. 👍' : 'Belum ada rekod buku hutang.'}</Empty>
        )}

        <ul className="-mx-2 divide-y divide-line/60">
          {rows.map((r) => (
            <li key={`${r.customerId}-${r.businessUnitId}`}>
              <Link to={`/buku-hutang/${r.customerId}/${r.businessUnitId}`} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-gray-50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                  {r.customerName.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{r.customerName}</span>
                    {multiUnit && <Badge>{r.businessUnitName}</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[
                      r.oldestUnpaidDate && `Hutang sejak ${formatDate(r.oldestUnpaidDate)}`,
                      r.lastPaidDate ? `Bayar terakhir ${formatDate(r.lastPaidDate)}` : r.balance > 0 && 'Belum pernah bayar',
                    ].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {r.balance > 0 ? (
                    <Money value={r.balance} className="block text-sm font-bold text-expense" />
                  ) : (
                    <span className="text-xs font-semibold text-income">Lunas</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={adding} title="Rekod hutang" onClose={() => setAdding(false)}>
        {adding && (
          <CreditEntryForm
            customerId={customerId}
            businessUnitId={businessUnitId || undefined}
            onCancel={() => setAdding(false)}
            onSaved={(l) => {
              setAdding(false)
              navigate(`/buku-hutang/${l.customerId}/${l.businessUnitId}`)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

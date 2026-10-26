import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInvoices, useQuotations, useReceipts } from '../../api/salesHooks'
import type { UseQueryResult } from '@tanstack/react-query'
import type { InvoiceListItem, Paged, PaymentListItem, QuotationListItem, SalesFilter } from '../../api/types'
import { Icon } from '../../components/Icon'
import { ChipFilter, InvoiceRow, QuotationRow, ReceiptRow } from '../../components/sales/common'
import { Button, Card, Empty, ErrorBox, Input, Money, PageHeader, Spinner } from '../../components/ui'
import { invoiceFilters, quotationFilters, receiptFilters } from '../../config/sales'

const PAGE_SIZE = 30

type Kind = 'quotation' | 'invoice' | 'receipt'

const config: Record<Kind, { title: string; newLabel: string; newPath: string; filters: { key: string; label: string }[]; empty: string }> = {
  quotation: { title: 'Sebut harga', newLabel: 'Sebut harga baru', newPath: '/sebut-harga/baru', filters: quotationFilters, empty: 'Tiada sebut harga.' },
  invoice: { title: 'Invois', newLabel: 'Invois baru', newPath: '/invois/baru', filters: invoiceFilters, empty: 'Tiada invois.' },
  receipt: { title: 'Resit', newLabel: 'Terima bayaran', newPath: '/resit/baru', filters: receiptFilters, empty: 'Tiada resit.' },
}

// Setiap halaman (InvoicesPage dll.) ialah komponen berbeza, jadi hook yang dipilih kekal sama sepanjang hayat komponen.
const listHooks = { quotation: useQuotations, invoice: useInvoices, receipt: useReceipts } as const
type AnyPaged = Paged<QuotationListItem | InvoiceListItem | PaymentListItem>

function DocumentList({ kind }: { kind: Kind }) {
  const cfg = config[kind]
  const [status, setStatus] = useState(kind === 'invoice' ? 'unpaid' : '')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const h = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(h)
  }, [q])
  useEffect(() => setPage(1), [status, search])

  const useData = listHooks[kind] as (f: SalesFilter) => UseQueryResult<AnyPaged>
  const { data, isLoading, error } = useData({ status: status || undefined, q: search || undefined, page, pageSize: PAGE_SIZE })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-4">
      <PageHeader
        title={cfg.title}
        actions={
          <Link to={cfg.newPath} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            <Icon name="plus" className="h-4 w-4" /> {cfg.newLabel}
          </Link>
        }
      />

      <div className="space-y-2">
        <ChipFilter value={status} onChange={setStatus} options={cfg.filters} />
        <div className="relative sm:w-80">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no., pelanggan, perkara…" className="pl-9" />
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-2 text-sm sm:max-w-md">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <div className="text-xs text-muted">{data.total} dokumen · jumlah</div>
            <Money value={data.sumTotal} className="font-bold" />
          </div>
          {kind === 'invoice' && (
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="text-xs text-muted">Belum dibayar</div>
              <Money value={data.sumOutstanding} className="font-bold text-expense" />
            </div>
          )}
        </div>
      )}

      <Card>
        {error && <ErrorBox error={error} />}
        {isLoading && <Spinner />}
        {data && data.items.length === 0 && <Empty>{cfg.empty}</Empty>}
        {data && data.items.length > 0 && (
          <>
            <div className="-mx-2 divide-y divide-line/60">
              {kind === 'quotation' && (data.items as QuotationListItem[]).map((x) => <QuotationRow key={x.id} q={x} />)}
              {kind === 'invoice' && (data.items as InvoiceListItem[]).map((x) => <InvoiceRow key={x.id} i={x} />)}
              {kind === 'receipt' && (data.items as PaymentListItem[]).map((x) => <ReceiptRow key={x.id} p={x} />)}
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

export function QuotationsPage() {
  return <DocumentList kind="quotation" />
}
export function InvoicesPage() {
  return <DocumentList kind="invoice" />
}
export function ReceiptsPage() {
  return <DocumentList kind="receipt" />
}

import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBusinessUnits } from '../../api/hooks'
import { usePalmBatch } from '../../api/palmHooks'
import { Icon } from '../../components/Icon'
import { Button, ErrorBox, Spinner } from '../../components/ui'
import { chargeMethodUnit, formatKg } from '../../config/palm'
import { paymentMethodLabel } from '../../config/sales'
import { formatDate, formatRM } from '../../lib/format'
import { ownerTickets } from '../../lib/palmMessages'

/** Slip bayaran sawit untuk seorang pemilik (cetak / simpan PDF). */
export default function PalmSlipPage() {
  const params = useParams()
  const batchId = Number(params.batchId) || undefined
  const ownerId = Number(params.ownerId)
  const { data: b, isLoading, error } = usePalmBatch(batchId)
  const { data: units = [] } = useBusinessUnits(true)
  const share = b?.owners.find((o) => o.ownerId === ownerId)
  const unit = units.find((u) => u.id === b?.businessUnitId)

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@page { size: A4; margin: 12mm; }'
    document.head.appendChild(style)
    const old = document.title
    if (b && share) document.title = `Slip sawit ${share.ownerName} ${b.number}`
    return () => {
      style.remove()
      document.title = old
    }
  }, [b, share])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!b || !share) return <ErrorBox error={new Error('Slip tidak dijumpai.')} />

  const tickets = ownerTickets(b, ownerId)
  const chargeNames = [...new Map(tickets.flatMap((t) => t.charges).map((c) => [c.chargeTypeId, c.name])).entries()]

  return (
    <div className="min-h-screen bg-gray-100 py-4 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center gap-2 px-4 print:hidden">
        <Link to={`/sawit/${b.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          <Icon name="back" className="h-4 w-4" /> Kembali
        </Link>
        <div className="flex-1" />
        <Button onClick={() => window.print()}><Icon name="printer" className="h-4 w-4" /> Cetak / PDF</Button>
      </div>

      <div className="mx-auto max-w-[210mm] bg-white p-8 text-sm text-ink shadow print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <div className="text-lg font-extrabold">{unit?.legalName || unit?.name || b.businessUnitName}</div>
            {unit?.address && <div className="whitespace-pre-line text-xs text-muted">{unit.address}</div>}
            {unit?.phone && <div className="text-xs text-muted">{unit.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-base font-bold uppercase tracking-wide">Slip bayaran sawit</div>
            <div className="text-xs text-muted">{b.number}{share.payout ? ` · ${share.payout.number}` : ''}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase text-muted">Pemilik</div>
            <div className="font-semibold">{share.ownerName}</div>
            {share.bankInfo && <div className="text-xs text-muted">{share.bankInfo}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted">Kilang</div>
            <div className="font-semibold">{b.millName}</div>
            <div className="text-xs text-muted">Bayaran kilang {formatDate(b.date)}</div>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink text-left">
              <th className="py-1.5">No. tiket</th>
              <th className="py-1.5">Tarikh</th>
              <th className="py-1.5 text-right">Berat</th>
              <th className="py-1.5 text-right">Harga/tan</th>
              <th className="py-1.5 text-right">Amaun kilang</th>
              {chargeNames.map(([id, name]) => <th key={id} className="py-1.5 text-right">{name}</th>)}
              <th className="py-1.5 text-right">Bersih</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-b border-line/60">
                <td className="py-1.5">{t.ticketNo ?? '-'}</td>
                <td className="py-1.5">{formatDate(t.date)}</td>
                <td className="py-1.5 text-right">{t.weightKg > 0 ? formatKg(t.weightKg) : '-'}</td>
                <td className="py-1.5 text-right">{t.pricePerTonne != null ? formatRM(t.pricePerTonne) : '-'}</td>
                <td className="py-1.5 text-right">{formatRM(t.gross)}</td>
                {chargeNames.map(([id]) => {
                  const c = t.charges.find((x) => x.chargeTypeId === id)
                  return (
                    <td key={id} className="py-1.5 text-right">
                      {c ? <>−{formatRM(c.amount)}<span className="block text-[10px] text-muted">{c.rate} {chargeMethodUnit(c.method)}</span></> : '-'}
                    </td>
                  )
                })}
                <td className="py-1.5 text-right font-semibold">{formatRM(t.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-bold">
              <td className="py-2" colSpan={2}>Jumlah</td>
              <td className="py-2 text-right">{share.weightKg > 0 ? formatKg(share.weightKg) : ''}</td>
              <td />
              <td className="py-2 text-right">{formatRM(share.gross)}</td>
              {chargeNames.map(([id]) => (
                <td key={id} className="py-2 text-right">
                  −{formatRM(tickets.flatMap((t) => t.charges).filter((c) => c.chargeTypeId === id).reduce((s, c) => s + c.amount, 0))}
                </td>
              ))}
              <td className="py-2 text-right">{formatRM(share.net)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-64 rounded-xl border border-ink p-3 text-right">
            <div className="text-xs uppercase text-muted">Jumlah dibayar</div>
            <div className="text-2xl font-extrabold">{formatRM(share.net)}</div>
            {share.payout ? (
              <div className="text-xs text-muted">
                {formatDate(share.payout.date)} · {paymentMethodLabel(share.payout.method)}{share.payout.reference ? ` · ${share.payout.reference}` : ''}
              </div>
            ) : (
              <div className="text-xs font-semibold text-expense">Belum dibayar</div>
            )}
          </div>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-10 text-xs">
          <div className="border-t border-ink pt-1">Dibayar oleh</div>
          <div className="border-t border-ink pt-1">Diterima oleh ({share.ownerName})</div>
        </div>
      </div>
    </div>
  )
}

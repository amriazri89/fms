import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useVoucher } from '../../api/payableHooks'
import type { PaymentVoucher } from '../../api/types'
import { Icon } from '../../components/Icon'
import { textOn } from '../../components/sales/PrintableDocument'
import { Button, ErrorBox, Spinner } from '../../components/ui'
import { payableKindLabel } from '../../config/payables'
import { paymentMethodLabel } from '../../config/sales'
import { formatDate, formatRM } from '../../lib/format'
import { amountInWords } from '../../lib/words'

/** Baucar bayaran (bukti kita bayar pembekal / pemiutang). Cetak → Simpan sebagai PDF. */
export default function VoucherPrintPage() {
  const id = Number(useParams().id) || undefined
  const { data, isLoading, error } = useVoucher(id)
  const number = data?.payment.number

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@page { size: A4; margin: 12mm; }'
    document.head.appendChild(style)
    const old = document.title
    if (number) document.title = number
    return () => {
      style.remove()
      document.title = old
    }
  }, [number])

  return (
    <div className="min-h-screen bg-gray-100 py-4 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4 print:hidden">
        <Link to={data ? `/hutang/${data.payment.payableId}` : '/hutang'} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          <Icon name="back" className="h-4 w-4" /> Kembali
        </Link>
        <Button className="ml-auto" onClick={() => window.print()} disabled={!data}>
          <Icon name="printer" className="h-4 w-4" /> Cetak / Simpan PDF
        </Button>
        <p className="w-full text-xs text-muted">Untuk PDF: tekan Cetak, kemudian pilih “Simpan sebagai PDF”.</p>
      </div>
      {isLoading && <Spinner />}
      {error && <div className="mx-auto max-w-xl px-4"><ErrorBox error={error} /></div>}
      {data && (
        <div className="mx-auto max-w-[210mm] shadow-lg print:max-w-none print:shadow-none">
          <Voucher v={data} />
        </div>
      )}
    </div>
  )
}

function Voucher({ v }: { v: PaymentVoucher }) {
  const p = v.payment
  const accent = v.seller.color || '#1F6F4A'
  const total = p.amount + p.interestAmount
  const isLoan = v.kind === 'Loan'
  const rows: [string, number][] = isLoan
    ? [['Bayaran pokok pinjaman', p.amount], ...(p.interestAmount > 0 ? [['Faedah / caj', p.interestAmount] as [string, number]] : [])]
    : [[v.payableDescription, p.amount]]

  return (
    <div className="relative bg-white p-8 text-[13px] text-ink sm:p-10">
      {p.isVoided && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-xl border-4 border-expense px-6 py-2 text-5xl font-black tracking-widest text-expense/70">BATAL</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-6 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div className="min-w-0">
          <div className="text-xl font-extrabold leading-tight">{v.seller.name}</div>
          {v.seller.registrationNo && <div className="text-[11px] text-muted">No. Pendaftaran: {v.seller.registrationNo}</div>}
          {v.seller.address && <div className="mt-1 whitespace-pre-line text-[12px] text-muted">{v.seller.address}</div>}
          {v.seller.phone && <div className="text-[12px] text-muted">Tel: {v.seller.phone}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="inline-block rounded-md px-3 py-1 text-sm font-extrabold tracking-[0.15em]" style={{ background: accent, color: textOn(accent) }}>BAUCAR BAYARAN</div>
          <dl className="mt-2 grid grid-cols-[auto,auto] justify-end gap-x-4 gap-y-0.5 text-[12px]">
            <dt className="text-muted">No.</dt><dd className="font-bold">{p.number}</dd>
            <dt className="text-muted">Tarikh</dt><dd>{formatDate(p.date)}</dd>
            <dt className="text-muted">Rujukan hutang</dt><dd>{p.payableNumber}</dd>
          </dl>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Dibayar kepada</div>
          <div className="mt-1 text-[14px] font-bold">{p.supplierName}</div>
          {v.supplierAddress && <div className="whitespace-pre-line text-[12px] text-muted">{v.supplierAddress}</div>}
          {v.supplierPhone && <div className="text-[12px] text-muted">{v.supplierPhone}</div>}
        </div>
        <div className="text-[12px] sm:text-right">
          <div><span className="text-muted">Jenis:</span> {payableKindLabel(v.kind)}</div>
          {v.supplierReference && <div><span className="text-muted">{isLoan ? 'No. akaun pinjaman' : 'No. bil pembekal'}:</span> {v.supplierReference}</div>}
          <div><span className="text-muted">Kaedah:</span> {paymentMethodLabel(p.method)} · {p.accountName}</div>
          {p.reference && <div><span className="text-muted">No. rujukan:</span> {p.reference}</div>}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide" style={{ background: accent, color: textOn(accent) }}>
            <th className="px-3 py-2">Butiran</th>
            <th className="px-3 py-2 text-right">Jumlah (RM)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([d, a]) => (
            <tr key={d} className="border-b border-line">
              <td className="px-3 py-2">{d}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatRM(a).replace('RM', '').trim()}</td>
            </tr>
          ))}
          <tr className="font-extrabold">
            <td className="px-3 py-2 text-right">JUMLAH DIBAYAR</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatRM(total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[12px] italic text-muted">{amountInWords(total)}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-[12px]">
        <div><span className="text-muted">{isLoan ? 'Jumlah pinjaman' : 'Jumlah bil'}:</span> <b>{formatRM(v.payableAmount)}</b></div>
        <div className="text-right"><span className="text-muted">Baki selepas bayaran ini:</span> <b>{formatRM(v.balanceAfter)}</b></div>
      </div>

      {p.notes && <p className="mt-3 text-[12px]"><span className="text-muted">Catatan:</span> {p.notes}</p>}
      {p.isVoided && <p className="mt-3 text-[12px] font-semibold text-expense">Baucar ini dibatalkan: {p.voidReason}</p>}

      <div className="mt-14 grid grid-cols-2 gap-10 text-[12px]">
        <div>
          <div className="border-t border-ink pt-1">Disediakan oleh: {p.createdBy}</div>
        </div>
        <div>
          <div className="border-t border-ink pt-1">Diterima oleh (tandatangan penerima)</div>
        </div>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWage } from '../../api/staffHooks'
import { Icon } from '../../components/Icon'
import { Button, ErrorBox, Spinner } from '../../components/ui'
import { appName, appSubtitle } from '../../config/app'
import { paymentMethodLabel } from '../../config/sales'
import { formatPeriod } from '../../config/staff'
import { formatAmount, formatDate, formatRM } from '../../lib/format'
import { amountInWords } from '../../lib/words'

/** Slip gaji boleh dicetak. Cetak → "Simpan sebagai PDF" untuk fail PDF. */
export default function PayslipPage() {
  const id = Number(useParams().id) || undefined
  const { data: w, isLoading, error } = useWage(id)

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@page { size: A4; margin: 14mm; }'
    document.head.appendChild(style)
    const old = document.title
    if (w) document.title = `${w.number} ${w.employeeName}`
    return () => {
      style.remove()
      document.title = old
    }
  }, [w])

  return (
    <div className="min-h-screen bg-gray-100 py-4 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center gap-2 px-4 print:hidden">
        <Link to="/gaji" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="h-4 w-4" /> Kembali</Link>
        <Button className="ml-auto" onClick={() => window.print()} disabled={!w}><Icon name="printer" className="h-4 w-4" /> Cetak / Simpan PDF</Button>
      </div>
      {isLoading && <Spinner />}
      {error && <div className="mx-auto max-w-xl px-4"><ErrorBox error={error} /></div>}
      {w && (
        <div className="relative mx-auto max-w-[210mm] bg-white p-10 text-[13px] text-ink shadow-lg print:max-w-none print:p-0 print:shadow-none">
          {w.isVoided && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="-rotate-12 rounded-xl border-4 border-expense px-6 py-2 text-5xl font-black tracking-widest text-expense/70">BATAL</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-6 border-b-2 border-brand-600 pb-4">
            <div className="min-w-0">
              <div className="text-xl font-extrabold">{w.seller.name}</div>
              {w.seller.registrationNo && <div className="text-[11px] text-muted">No. Pendaftaran: {w.seller.registrationNo}</div>}
              {w.seller.address && <div className="whitespace-pre-line text-xs text-muted">{w.seller.address}</div>}
              {w.seller.phone && <div className="text-xs text-muted">Tel: {w.seller.phone}</div>}
            </div>
            <div className="shrink-0 text-right">
              <div className="inline-block rounded-md bg-brand-600 px-3 py-1 text-sm font-extrabold tracking-[0.15em] text-white">SLIP GAJI</div>
              <div className="mt-2 font-semibold">{formatPeriod(w.periodMonth)}</div>
              <div className="text-xs text-muted">No. {w.number}</div>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1">
            {([
              ['Nama pekerja', w.employeeName], ['Jawatan', w.position ?? '—'], ['No. K/P', w.icNo ?? '—'],
              ['Jenis gaji', w.employmentType === 'Daily' ? `Harian${w.daysWorked ? ` (${w.daysWorked} hari)` : ''}` : 'Bulanan'],
              ['Tarikh bayar', formatDate(w.payDate)], ['Cara bayar', paymentMethodLabel(w.method)],
              ...(w.bankAccountNo ? [['Akaun bank', `${w.bankName ?? ''} ${w.bankAccountNo}`.trim()]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line/70 py-1">
                <dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 grid grid-cols-2 gap-6">
            <table className="w-full self-start">
              <thead><tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-wide"><th className="py-1.5">Pendapatan</th><th className="py-1.5 text-right">RM</th></tr></thead>
              <tbody>
                {([['Gaji pokok', w.basicPay], ['Elaun', w.allowance], ['Kerja lebih masa', w.overtime]] as [string, number][]).map(([k, v]) => (
                  <tr key={k} className="border-b border-line"><td className="py-1.5">{k}</td><td className="py-1.5 text-right tabular-nums">{formatAmount(v)}</td></tr>
                ))}
                <tr className="font-bold"><td className="py-1.5">Jumlah pendapatan</td><td className="py-1.5 text-right tabular-nums">{formatAmount(w.basicPay + w.allowance + w.overtime)}</td></tr>
              </tbody>
            </table>
            <table className="w-full self-start">
              <thead><tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-wide"><th className="py-1.5">Potongan</th><th className="py-1.5 text-right">RM</th></tr></thead>
              <tbody>
                <tr className="border-b border-line"><td className="py-1.5">{w.deduction > 0 && w.notes ? w.notes : 'Potongan'}</td><td className="py-1.5 text-right tabular-nums">{formatAmount(w.deduction)}</td></tr>
                <tr className="font-bold"><td className="py-1.5">Jumlah potongan</td><td className="py-1.5 text-right tabular-nums">{formatAmount(w.deduction)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
            <span className="font-bold uppercase tracking-wide text-brand-700">Gaji bersih</span>
            <span className="text-2xl font-extrabold text-brand-700">{formatRM(w.netPay)}</span>
          </div>
          <p className="mt-2 text-[12px] italic text-muted">{amountInWords(w.netPay)}</p>

          <div className="mt-16 grid grid-cols-2 gap-10 text-xs">
            <div className="border-t border-ink pt-1">Disediakan oleh: {w.createdBy}</div>
            <div className="border-t border-ink pt-1">Diterima oleh: {w.employeeName}</div>
          </div>
          <p className="mt-8 text-center text-[10px] text-muted">{appName} · {appSubtitle}</p>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useBusinessUnits } from '../../api/hooks'
import { useProfitLossStatement } from '../../api/staffHooks'
import type { StatementSection } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { IncomeExpenseChart } from '../../components/charts'
import { Icon } from '../../components/Icon'
import { PeriodFilter, usePeriod } from '../../components/PeriodFilter'
import { Button, Card, ErrorBox, PageHeader, Select, Spinner, cx } from '../../components/ui'
import { appName, appSubtitle } from '../../config/app'
import { formatAmount, formatDate, formatDateTime, formatRM } from '../../lib/format'

/** View Profit & Loss Statement, «extend» Print Profit & Loss Statement. */
export default function ProfitLossPage() {
  const { user } = useAuth()
  const [period, setPeriod] = usePeriod('month')
  const [businessUnitId, setBusinessUnitId] = useState<number | undefined>()
  const { data: units = [] } = useBusinessUnits()
  const { data, isLoading, error, isFetching } = useProfitLossStatement(period.from, period.to, businessUnitId)

  return (
    <div className="space-y-4">
      <div className="space-y-3 print:hidden">
        <PageHeader
          title="Penyata Untung Rugi"
          subtitle="Hasil tolak perbelanjaan bagi tempoh yang dipilih"
          actions={<Button onClick={() => window.print()} disabled={!data}><Icon name="printer" className="h-4 w-4" /> Cetak / Simpan PDF</Button>}
        />
        <PeriodFilter value={period} onChange={setPeriod} />
        <Select value={businessUnitId ?? ''} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : undefined)} className="max-w-xs">
          <option value="">Semua perniagaan</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}
      {data && (
        <>
          <div className={cx('mx-auto max-w-3xl rounded-2xl border border-line bg-white p-6 shadow-sm transition sm:p-10 print:max-w-none print:border-0 print:p-0 print:shadow-none', isFetching && 'opacity-60')}>
            <div className="text-center">
              <div className="text-xl font-extrabold text-ink">{data.companyName}</div>
              <div className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-brand-700">Penyata Untung Rugi</div>
              <div className="text-sm text-muted">Bagi tempoh {formatDate(data.from)} hingga {formatDate(data.to)}</div>
              <div className="text-sm font-semibold text-ink">{data.scope}</div>
            </div>

            <table className="mt-8 w-full text-sm">
              <tbody>
                <Section s={data.revenue} />
                <Section s={data.expenses} negative />
                <tr><td colSpan={2} className="pt-3" /></tr>
                <tr className="border-y-[3px] border-double border-ink">
                  <td className="py-2.5 text-base font-extrabold">{data.netProfit >= 0 ? 'UNTUNG BERSIH' : 'RUGI BERSIH'}</td>
                  <td className={cx('py-2.5 text-right text-base font-extrabold tabular-nums', data.netProfit >= 0 ? 'text-income' : 'text-expense')}>
                    RM {formatAmount(Math.abs(data.netProfit))}
                  </td>
                </tr>
              </tbody>
            </table>
            {data.netMarginPercent !== null && <p className="mt-2 text-right text-xs text-muted">Margin untung: {data.netMarginPercent}% daripada hasil</p>}

            {data.byBusiness.length > 1 && (
              <table className="mt-8 w-full text-sm">
                <thead>
                  <tr className="border-b border-ink text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5">Ikut perniagaan</th><th className="py-1.5 text-right">Hasil</th><th className="py-1.5 text-right">Belanja</th><th className="py-1.5 text-right">Untung / (rugi)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBusiness.map((b) => (
                    <tr key={b.businessUnitId} className="border-b border-line/60">
                      <td className="py-1.5">{b.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatAmount(b.revenue)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatAmount(b.expenses)}</td>
                      <td className={cx('py-1.5 text-right font-semibold tabular-nums', b.net < 0 && 'text-expense')}>{b.net < 0 ? `(${formatAmount(-b.net)})` : formatAmount(b.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {data.notCounted.lines.length > 0 && (
              <div className="mt-8 rounded-lg bg-gray-50 p-3 text-xs print:bg-transparent print:p-0">
                <div className="mb-1 font-bold uppercase tracking-wide text-muted">Pergerakan duit yang tidak dikira untung rugi</div>
                {data.notCounted.lines.map((l) => (
                  <div key={l.name} className="flex justify-between"><span>{l.name}</span><span className="tabular-nums">{formatAmount(l.amount)}</span></div>
                ))}
              </div>
            )}

            <div className="mt-10 text-xs text-muted">
              <p>Hasil = Duit Masuk (jualan, sewa dan lain-lain). Perbelanjaan = Duit Keluar termasuk gaji, bil utiliti, tuntutan yang dibayar dan bil pembekal yang dibayar. Ambilan keluarga, modal dan pinjaman tidak dikira.</p>
              <div className="mt-10 grid grid-cols-2 gap-10">
                <div className="border-t border-ink pt-1">Disediakan oleh: {user?.fullName}</div>
                <div className="border-t border-ink pt-1">Disemak oleh (Pengurus)</div>
              </div>
              <p className="mt-6 text-center">Dijana {formatDateTime(data.generatedAt)} · {appName} · {appSubtitle}</p>
            </div>
          </div>

          {data.monthly.length > 1 && (
            <Card title="Bulan demi bulan" className="print:break-before-page">
              <IncomeExpenseChart data={data.monthly.map((m) => ({ month: m.month, income: m.revenue, expense: m.expenses, profit: m.net }))} />
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs uppercase text-muted"><th className="py-2">Bulan</th><th className="py-2 text-right">Hasil</th><th className="py-2 text-right">Belanja</th><th className="py-2 text-right">Untung</th></tr></thead>
                  <tbody>
                    {data.monthly.map((m) => (
                      <tr key={m.month} className="border-b border-line/60">
                        <td className="py-1.5">{m.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatRM(m.revenue)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatRM(m.expenses)}</td>
                        <td className={cx('py-1.5 text-right font-semibold tabular-nums', m.net < 0 && 'text-expense')}>{formatRM(m.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Section({ s, negative }: { s: StatementSection; negative?: boolean }) {
  return (
    <>
      <tr><td colSpan={2} className="pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-muted">{s.title}</td></tr>
      {s.lines.length === 0 && <tr><td className="py-1 pl-4 italic text-muted">Tiada</td><td className="py-1 text-right tabular-nums">0.00</td></tr>}
      {s.lines.map((l) => (
        <tr key={l.name}>
          <td className="py-1 pl-4">{l.name}</td>
          <td className="py-1 text-right tabular-nums">{negative ? `(${formatAmount(l.amount)})` : formatAmount(l.amount)}</td>
        </tr>
      ))}
      <tr className="border-t border-ink/70">
        <td className="py-1.5 font-semibold">Jumlah {s.title.toLowerCase()}</td>
        <td className="py-1.5 text-right font-semibold tabular-nums">{negative ? `(${formatAmount(s.total)})` : formatAmount(s.total)}</td>
      </tr>
    </>
  )
}

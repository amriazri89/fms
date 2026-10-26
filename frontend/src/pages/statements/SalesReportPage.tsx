import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useBusinessUnits } from '../../api/hooks'
import { useSalesReport } from '../../api/staffHooks'
import type { SalesReportRow } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/Icon'
import { PeriodFilter, usePeriod } from '../../components/PeriodFilter'
import { Button, Card, Empty, ErrorBox, Money, PageHeader, Segmented, Select, Spinner, cx } from '../../components/ui'
import { appName, appSubtitle } from '../../config/app'
import { chartColors } from '../../config/chartColors'
import { formatCompact, formatDate, formatRM } from '../../lib/format'

/** Manage Sales Report: jualan ikut hari / bulan, kategori, perniagaan dan akaun. */
export default function SalesReportPage() {
  const { user } = useAuth()
  const [period, setPeriod] = usePeriod('month')
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day')
  const [businessUnitId, setBusinessUnitId] = useState<number | undefined>()
  const { data: units = [] } = useBusinessUnits()
  const { data, isLoading, error, isFetching } = useSalesReport(period.from, period.to, groupBy, businessUnitId)

  return (
    <div className="space-y-4">
      <div className="space-y-3 print:hidden">
        <PageHeader
          title="Laporan Jualan"
          subtitle="Berapa banyak dijual, bila dan di mana duit diterima"
          actions={<Button onClick={() => window.print()} disabled={!data}><Icon name="printer" className="h-4 w-4" /> Cetak / Simpan PDF</Button>}
        />
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={businessUnitId ?? ''} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : undefined)} className="max-w-xs">
            <option value="">Semua perniagaan</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Segmented value={groupBy} onChange={setGroupBy} options={[{ key: 'day', label: 'Ikut hari' }, { key: 'month', label: 'Ikut bulan' }]} />
        </div>
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}
      {data && (
        <div className={cx('space-y-4', isFetching && 'opacity-60')}>
          <div className="hidden text-center print:block">
            <div className="text-xl font-extrabold">{data.companyName}</div>
            <div className="mt-1 text-sm font-bold uppercase tracking-[0.18em]">Laporan Jualan</div>
            <div className="text-sm">{formatDate(data.from)} hingga {formatDate(data.to)} · {data.scope}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Jumlah jualan', value: <Money value={data.total} className="text-income" /> },
              { label: 'Bilangan rekod', value: data.count },
              { label: 'Purata sehari', value: <Money value={data.averagePerDay} /> },
              { label: 'Invois dikeluarkan', value: <Money value={data.invoicedInPeriod} />, sub: `Belum dibayar ${formatRM(data.outstandingInvoices)}` },
            ].map((x) => (
              <div key={x.label} className="min-w-0 rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{x.label}</div>
                <div className="mt-1 truncate text-lg font-extrabold sm:text-xl">{x.value}</div>
                {x.sub && <div className="truncate text-xs text-muted">{x.sub}</div>}
              </div>
            ))}
          </div>
          {data.rows.length === 0 ? <Card><Empty>Tiada jualan dalam tempoh ini.</Empty></Card> : (
            <>
              <Card title={groupBy === 'day' ? 'Jualan ikut hari' : 'Jualan ikut bulan'} className="print:hidden">
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={chartColors.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartColors.axis }} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: chartColors.axis }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [formatRM(v), 'Jualan']} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                    <Bar dataKey="total" fill={chartColors.income} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <div className="grid gap-4 lg:grid-cols-3 print:grid-cols-3">
                <Breakdown title="Ikut kategori" rows={data.byCategory} total={data.total} />
                <Breakdown title="Ikut perniagaan" rows={data.byBusiness} total={data.total} />
                <Breakdown title="Duit masuk ke akaun" rows={data.byAccount} total={data.total} />
              </div>
              <Card title={groupBy === 'day' ? 'Butiran harian' : 'Butiran bulanan'}>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs uppercase text-muted"><th className="py-2">{groupBy === 'day' ? 'Tarikh' : 'Bulan'}</th><th className="py-2 text-right">Rekod</th><th className="py-2 text-right">Jualan</th></tr></thead>
                  <tbody>
                    {data.rows.map((r) => <tr key={r.key} className="border-b border-line/60"><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right">{r.count}</td><td className="py-1.5 text-right tabular-nums">{formatRM(r.total)}</td></tr>)}
                    <tr className="font-bold"><td className="py-2">Jumlah</td><td className="py-2 text-right">{data.count}</td><td className="py-2 text-right tabular-nums">{formatRM(data.total)}</td></tr>
                  </tbody>
                </table>
              </Card>
              <p className="hidden text-center text-xs text-muted print:block">Disediakan oleh {user?.fullName} · {appName} · {appSubtitle}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Breakdown({ title, rows, total }: { title: string; rows: SalesReportRow[]; total: number }) {
  return (
    <Card title={title}>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{r.label} <span className="text-xs text-muted">({r.count})</span></span><span className="shrink-0 font-semibold tabular-nums">{formatRM(r.total)}</span></div>
            <div className="h-2 rounded-full bg-gray-100 print:hidden"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${total ? (r.total / total) * 100 : 0}%` }} /></div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

import { useState, type ReactNode } from 'react'
import { useAccounts, useBusinessUnits, useCashflow, useCategoryReport, useMonthlyReport, useProfitReport } from '../api/hooks'
import type { CategoryType } from '../api/types'
import { HorizontalBars, IncomeExpenseChart, ProfitBarChart } from '../components/charts'
import { PeriodFilter, usePeriod, type PeriodValue } from '../components/PeriodFilter'
import { Card, Empty, ErrorBox, Money, PageHeader, Segmented, Select, Spinner } from '../components/ui'
import { chartColors } from '../config/chartColors'
import { typeConfig } from '../config/transactionTypes'
import { formatDate, monthNamesLong } from '../lib/format'

type Tab = 'cashflow' | 'profit' | 'category' | 'monthly'
const tabs: { key: Tab; label: string }[] = [
  { key: 'profit', label: 'Untung perniagaan' },
  { key: 'cashflow', label: 'Aliran tunai' },
  { key: 'category', label: 'Ikut kategori' },
  { key: 'monthly', label: 'Trend bulanan' },
]

function Row({ label, value, bold, tone }: { label: ReactNode; value: number; bold?: boolean; tone?: 'auto' | 'income' | 'expense' }) {
  return (
    <div className={'flex justify-between py-2 text-sm ' + (bold ? 'border-t border-line font-bold' : '')}>
      <span>{label}</span>
      <Money value={value} tone={tone} />
    </div>
  )
}

function PeriodLabel({ from, to }: { from: string; to: string }) {
  return <p className="mb-3 text-sm text-muted">{formatDate(from)} – {formatDate(to)}</p>
}

function CashflowTab({ period }: { period: PeriodValue }) {
  const [accountId, setAccountId] = useState<number | undefined>()
  const { data: accounts = [] } = useAccounts()
  const { data, isLoading, error } = useCashflow({ from: period.from, to: period.to, accountId })
  return (
    <Card
      title="Laporan aliran tunai"
      action={
        <Select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)} className="w-48">
          <option value="">Semua akaun</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      }
    >
      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}
      {data && (
        <div className="max-w-lg">
          <PeriodLabel {...data.period} />
          <Row label="Baki awal" value={data.openingBalance} bold />
          <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-income">Duit masuk</h3>
          {data.moneyIn.length ? data.moneyIn.map((l) => <Row key={l.type} label={typeConfig(l.type).label} value={l.amount} />) : <p className="py-2 text-sm text-muted">—</p>}
          <Row label="Jumlah masuk" value={data.totalIn} bold tone="income" />
          <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-expense">Duit keluar</h3>
          {data.moneyOut.length ? data.moneyOut.map((l) => <Row key={l.type} label={typeConfig(l.type).label} value={l.amount} />) : <p className="py-2 text-sm text-muted">—</p>}
          <Row label="Jumlah keluar" value={data.totalOut} bold tone="expense" />
          <div className="mt-3 rounded-xl bg-brand-50 px-3">
            <Row label="Aliran tunai bersih" value={data.netCashflow} tone="auto" />
            <Row label="Baki akhir" value={data.closingBalance} bold />
          </div>
        </div>
      )}
    </Card>
  )
}

function ProfitTab({ period }: { period: PeriodValue }) {
  const { data, isLoading, error } = useProfitReport({ from: period.from, to: period.to })
  return (
    <Card title="Untung mengikut perniagaan">
      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}
      {data && (
        <>
          <PeriodLabel {...data.period} />
          {data.rows.length === 0 ? <Empty>Tiada rekod.</Empty> : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2">Perniagaan</th><th className="py-2 text-right">Masuk</th><th className="py-2 text-right">Keluar</th><th className="py-2 text-right">Untung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.businessUnitId} className="border-b border-line/60">
                        <td className="py-2 font-semibold">{r.name}</td>
                        <td className="py-2 text-right"><Money value={r.income} /></td>
                        <td className="py-2 text-right"><Money value={r.expense} /></td>
                        <td className="py-2 text-right font-bold"><Money value={r.profit} tone="auto" /></td>
                      </tr>
                    ))}
                    <tr className="bg-brand-50 font-bold">
                      <td className="py-2 pl-1">JUMLAH</td>
                      <td className="py-2 text-right"><Money value={data.totalIncome} /></td>
                      <td className="py-2 text-right"><Money value={data.totalExpense} /></td>
                      <td className="py-2 pr-1 text-right"><Money value={data.totalProfit} tone="auto" /></td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted">Ambilan keluarga, modal, pindah duit dan pinjaman dalaman tidak dikira dalam untung.</p>
              </div>
              <ProfitBarChart data={data.rows} />
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function CategoryTab({ period }: { period: PeriodValue }) {
  const [type, setType] = useState<CategoryType>('Expense')
  const [businessUnitId, setBusinessUnitId] = useState<number | undefined>()
  const { data: units = [] } = useBusinessUnits()
  const { data, isLoading, error } = useCategoryReport({ from: period.from, to: period.to, type, businessUnitId })
  return (
    <Card title={type === 'Expense' ? 'Duit keluar ikut kategori' : 'Duit masuk ikut kategori'}>
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented value={type} onChange={setType} options={[{ key: 'Expense', label: 'Duit keluar' }, { key: 'Income', label: 'Duit masuk' }]} />
        <Select value={businessUnitId ?? ''} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : undefined)} className="w-52">
          <option value="">Semua perniagaan</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}
      {data && (
        <div className="max-w-xl">
          <PeriodLabel {...data.period} />
          {data.rows.length ? (
            <>
              <HorizontalBars data={data.rows} max={50} color={type === 'Expense' ? chartColors.expense : chartColors.income} />
              <Row label="Jumlah" value={data.total} bold />
            </>
          ) : <Empty>Tiada rekod.</Empty>}
        </div>
      )}
    </Card>
  )
}

function MonthlyTab() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [businessUnitId, setBusinessUnitId] = useState<number | undefined>()
  const { data: units = [] } = useBusinessUnits()
  const { data, isLoading, error } = useMonthlyReport({ year, businessUnitId })
  const years = Array.from({ length: 5 }, (_, i) => thisYear - i)
  return (
    <Card title="Trend bulanan">
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select value={businessUnitId ?? ''} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : undefined)} className="w-52">
          <option value="">Semua perniagaan</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}
      {data && (
        <div className="space-y-5">
          <IncomeExpenseChart data={data.months} height={300} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2">Bulan</th><th className="py-2 text-right">Masuk</th><th className="py-2 text-right">Keluar</th><th className="py-2 text-right">Untung</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} className="border-b border-line/60">
                    <td className="py-2">{monthNamesLong[Number(m.month.slice(5)) - 1]}</td>
                    <td className="py-2 text-right"><Money value={m.income} /></td>
                    <td className="py-2 text-right"><Money value={m.expense} /></td>
                    <td className="py-2 text-right font-semibold"><Money value={m.profit} tone="auto" /></td>
                  </tr>
                ))}
                <tr className="bg-brand-50 font-bold">
                  <td className="py-2 pl-1">JUMLAH {data.year}</td>
                  <td className="py-2 text-right"><Money value={data.totalIncome} /></td>
                  <td className="py-2 text-right"><Money value={data.totalExpense} /></td>
                  <td className="py-2 pr-1 text-right"><Money value={data.totalProfit} tone="auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('profit')
  const [period, setPeriod] = usePeriod('month')
  return (
    <div className="space-y-4">
      <PageHeader title="Laporan" />
      <div className="-mx-1 overflow-x-auto px-1">
        <Segmented value={tab} onChange={setTab} options={tabs} />
      </div>
      {tab !== 'monthly' && <PeriodFilter value={period} onChange={setPeriod} />}
      {tab === 'cashflow' && <CashflowTab period={period} />}
      {tab === 'profit' && <ProfitTab period={period} />}
      {tab === 'category' && <CategoryTab period={period} />}
      {tab === 'monthly' && <MonthlyTab />}
    </div>
  )
}

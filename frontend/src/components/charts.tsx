import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyPoint, NamedAmount } from '../api/types'
import { chartColors } from '../config/chartColors'
import { formatCompact, formatMonth, formatRM } from '../lib/format'

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #DCE3DF', fontSize: 13, fontFamily: 'inherit' },
  cursor: { fill: 'rgba(46,138,94,0.06)' },
}

/** Duit masuk lawan duit keluar mengikut bulan. */
export function IncomeExpenseChart({ data, height = 260 }: { data: MonthlyPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={chartColors.grid} />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12, fill: chartColors.axis }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: chartColors.axis }} axisLine={false} tickLine={false} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(l) => formatMonth(String(l))}
          formatter={(v: number, name) => [formatRM(v), name]}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: '#22302A' }}>{v}</span>} />
        <Bar dataKey="income" name="Duit masuk" fill={chartColors.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="Duit keluar" fill={chartColors.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Bar mendatar satu warna — untuk kategori, perniagaan, dsb. */
export function HorizontalBars({ data, color = chartColors.single, max = 8 }: { data: NamedAmount[]; color?: string; max?: number }) {
  const rows = data.slice(0, max)
  const top = Math.max(...rows.map((r) => Math.abs(r.amount)), 1)
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.name} className="group" title={`${r.name}: ${formatRM(r.amount)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-ink">{r.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{formatRM(r.amount)}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full transition-[width] group-hover:opacity-80"
              style={{ width: `${(Math.abs(r.amount) / top) * 100}%`, background: r.amount < 0 ? '#9CA3AF' : color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Untung setiap perniagaan (boleh negatif). */
export function ProfitBarChart({ data, height = 240 }: { data: { name: string; profit: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={chartColors.grid} />
        <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 12, fill: chartColors.axis }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 13, fill: '#22302A' }} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [formatRM(v), 'Untung']} />
        <Bar dataKey="profit" radius={4} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.profit < 0 ? '#9CA3AF' : chartColors.single} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

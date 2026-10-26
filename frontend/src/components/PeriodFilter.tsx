import { useState } from 'react'
import { periodOptions, resolvePeriod, type PeriodKey } from '../lib/period'
import { Input } from './ui'

export interface PeriodValue {
  key: PeriodKey
  from: string
  to: string
}

export function usePeriod(initial: PeriodKey = 'month') {
  return useState<PeriodValue>(() => ({ key: initial, ...resolvePeriod(initial) }))
}

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {periodOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key === 'custom' ? { ...value, key: 'custom' } : { key: o.key, ...resolvePeriod(o.key) })}
            className={
              'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ' +
              (value.key === o.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-muted hover:text-ink')
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.key === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className="max-w-[180px]" />
          <span className="text-sm text-muted">hingga</span>
          <Input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className="max-w-[180px]" />
        </div>
      )}
    </div>
  )
}

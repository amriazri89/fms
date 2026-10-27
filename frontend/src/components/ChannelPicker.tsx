import type { MoneyChannel } from '../api/types'
import { channels } from '../config/channels'
import { cx } from './ui'

/** Dua butang Tunai / Bank. allowClear: tekan sekali lagi untuk kosongkan (medan pilihan). */
export function ChannelPicker({
  value,
  onChange,
  allowClear = false,
}: {
  value: MoneyChannel | null
  onChange: (v: MoneyChannel | null) => void
  allowClear?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {channels.map((c) => (
        <button
          type="button"
          key={c.value}
          onClick={() => onChange(value === c.value && allowClear ? null : c.value)}
          className={cx(
            'min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold transition',
            value === c.value ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-line bg-white text-ink hover:bg-gray-50',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

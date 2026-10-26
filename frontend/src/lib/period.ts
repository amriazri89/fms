import { toISODate } from './format'

export type PeriodKey = 'today' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom'

export const periodOptions: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hari ini' },
  { key: 'week', label: 'Minggu ini' },
  { key: 'month', label: 'Bulan ini' },
  { key: 'lastMonth', label: 'Bulan lepas' },
  { key: 'year', label: 'Tahun ini' },
  { key: 'custom', label: 'Pilih tarikh' },
]

export function resolvePeriod(key: PeriodKey, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (key) {
    case 'today':
      return { from: toISODate(now), to: toISODate(now) }
    case 'week': {
      // Minggu bermula hari Isnin
      const diff = (now.getDay() + 6) % 7
      const start = new Date(y, m, now.getDate() - diff)
      return { from: toISODate(start), to: toISODate(now) }
    }
    case 'lastMonth':
      return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)) }
    case 'year':
      return { from: toISODate(new Date(y, 0, 1)), to: toISODate(now) }
    case 'month':
    case 'custom':
    default:
      return { from: toISODate(new Date(y, m, 1)), to: toISODate(now) }
  }
}

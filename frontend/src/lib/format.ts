import { locale } from '../config/app'

const rm = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rmShort = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })

export const formatRM = (n: number, opts: { short?: boolean; signed?: boolean } = {}) => {
  const abs = Math.abs(n)
  const body = opts.short ? rmShort.format(abs) : rm.format(abs)
  const sign = n < 0 ? '−' : opts.signed && n > 0 ? '+' : ''
  return `${sign}RM${body}`
}

export const formatCompact = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}j`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

const months = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
export const monthNamesLong = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember']

/** "2026-10-05" → "5 Okt 2026" */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${months[m - 1]} ${y}`
}

/** "2026-10" → "Okt 26" */
export const formatMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${months[m - 1]} ${String(y).slice(2)}`
}

export const formatDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${formatDate(toISODate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Tarikh tempatan dalam format yyyy-MM-dd (bukan UTC). */
export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const today = () => toISODate(new Date())

const plain2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 })

/** Nombor wang tanpa "RM", untuk lajur jadual dokumen. */
export const formatAmount = (n: number) => plain2.format(n)

export const formatQty = (n: number) => qtyFmt.format(n)

/** Tambah hari pada tarikh yyyy-MM-dd. */
export const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

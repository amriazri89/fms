// Base path datang dari vite.config.ts (VITE_BASE_PATH). Jangan hardcode di tempat lain.
const base = import.meta.env.BASE_URL.replace(/\/$/, '')

export const routerBase = base || '/'
export const apiBase = `${base}/api`

export const appName = 'FMS'
export const appFullName = 'Finance Management System'
export const appSubtitle = 'Sistem Pengurusan Kewangan Ajib Business'
export const currency = 'MYR'
export const locale = 'ms-MY'

import { apiBase } from '../config/app'

const TOKEN_KEY = 'fms.token'

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage tidak tersedia */
    }
  },
}

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string[]>

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

type Query = Record<string, string | number | boolean | undefined | null>

export function toQueryString(q?: Query): string {
  if (!q) return ''
  const params = new URLSearchParams()
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v))
  })
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Ralat ${res.status}`
  let fieldErrors: Record<string, string[]> = {}
  try {
    const body = await res.json()
    if (body?.errors && typeof body.errors === 'object') {
      // ASP.NET ValidationProblemDetails: kunci kadang-kadang huruf besar
      fieldErrors = Object.fromEntries(
        Object.entries(body.errors as Record<string, string[]>).map(([k, v]) => [
          k.charAt(0).toLowerCase() + k.slice(1),
          v,
        ]),
      )
      message = Object.values(fieldErrors).flat()[0] ?? 'Sila semak maklumat yang diisi.'
    } else if (body?.message) {
      message = body.message
    } else if (body?.title) {
      message = body.title
    }
  } catch {
    if (res.status === 403) message = 'Anda tiada kebenaran untuk tindakan ini.'
  }
  return new ApiError(res.status, message, fieldErrors)
}

export async function api<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const { query, headers, ...rest } = init
  const token = tokenStore.get()
  const res = await fetch(`${apiBase}${path}${toQueryString(query)}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    tokenStore.set(null)
    onUnauthorized?.()
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const http = {
  get: <T>(path: string, query?: Query) => api<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path: string) => api<void>(path, { method: 'DELETE' }),
}

/** Muat naik satu fail (multipart/form-data). */
export async function upload<T>(path: string, file: File, field = 'file'): Promise<T> {
  const token = tokenStore.get()
  const form = new FormData()
  form.append(field, file)
  const res = await fetch(`${apiBase}${path}`, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (res.status === 401) {
    tokenStore.set(null)
    onUnauthorized?.()
  }
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as T
}

/** Buka fail yang dilindungi (contoh: resit tuntutan) dalam tab baru. */
export async function openFile(path: string) {
  const win = window.open('', '_blank')
  const token = tokenStore.get()
  const res = await fetch(`${apiBase}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    win?.close()
    throw await parseError(res)
  }
  const url = URL.createObjectURL(await res.blob())
  if (win) win.location.href = url
  else window.location.href = url
}

/** Muat turun fail (contoh: CSV) dengan token. */
export async function download(path: string, query: Query, filename: string) {
  const token = tokenStore.get()
  const res = await fetch(`${apiBase}${path}${toQueryString(query)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw await parseError(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

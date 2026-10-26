import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { formatRM } from '../lib/format'
import { Icon } from './Icon'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
const btn: Record<BtnVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'border border-line bg-white text-ink hover:bg-brand-50',
  danger: 'bg-expense text-white hover:bg-red-800',
  ghost: 'text-muted hover:bg-brand-50 hover:text-ink',
}

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed',
        btn[variant],
        className,
      )}
    />
  )
}

export function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-expense"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-expense">{error}</span>}
    </label>
  )
}

const inputCls =
  'w-full min-h-[44px] rounded-xl border border-line bg-white px-3 text-[15px] text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50'

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, className)} />
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={cx(inputCls, 'py-2.5 leading-relaxed', className)} />
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(inputCls, 'pr-8', className)}>
      {children}
    </select>
  )
}

export function Money({ value, tone, signed, className }: { value: number; tone?: 'auto' | 'income' | 'expense' | 'plain'; signed?: boolean; className?: string }) {
  const t = tone ?? 'plain'
  const color = t === 'income' ? 'text-income' : t === 'expense' ? 'text-expense' : t === 'auto' ? (value < 0 ? 'text-expense' : 'text-income') : ''
  return <span className={cx('tabular-nums', color, className)}>{formatRM(value, { signed })}</span>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'income' | 'expense' | 'neutral' | 'gold' }) {
  const cls = {
    income: 'bg-brand-50 text-brand-700',
    expense: 'bg-red-50 text-expense',
    neutral: 'bg-gray-100 text-gray-700',
    gold: 'bg-gold-50 text-gold-600',
  }[tone]
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{children}</span>
}

export function Spinner() {
  return <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" /></div>
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Ralat tidak diketahui.'
  return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-expense">{msg}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted">{children}</div>
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-gray-100" aria-label="Tutup">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === o.key ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

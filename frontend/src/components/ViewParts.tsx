import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { cx } from './ui'

export function ActionLink({ to, icon, children, primary, external }: { to: string; icon: IconName; children: ReactNode; primary?: boolean; external?: boolean }) {
  const cls = cx(
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
    primary ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-line bg-white text-ink hover:bg-brand-50',
  )
  return external ? (
    <a href={to} target="_blank" rel="noreferrer" className={cls}><Icon name={icon} className="h-4 w-4" />{children}</a>
  ) : (
    <Link to={to} className={cls}><Icon name={icon} className="h-4 w-4" />{children}</Link>
  )
}

export function ViewHeader({ back, backLabel, number, badge, sub, actions }: { back: string; backLabel: string; number: string; badge: ReactNode; sub: ReactNode; actions: ReactNode }) {
  return (
    <div className="space-y-3">
      <Link to={back} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> {backLabel}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">{number} {badge}</h1>
          <p className="mt-0.5 text-sm text-muted">{sub}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    </div>
  )
}

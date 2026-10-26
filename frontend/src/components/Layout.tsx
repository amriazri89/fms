import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { roleLabels, useAuth } from '../auth/AuthContext'
import { appName, appSubtitle } from '../config/app'
import { moduleGroups, modulesFor } from '../config/modules'
import { Icon } from './Icon'
import { Spinner, cx } from './ui'

export function Layout() {
  const { user, logout } = useAuth()
  if (!user) return null
  const mods = modulesFor(user.role)
  const navMods = mods.filter((m) => !m.hidden && !m.mobileOnly)
  // Butang "+" di tengah bar bawah
  const mobileOrder = ['dashboard', 'invoices', 'new', 'transactions', 'menu']
  const mobile = mods.filter((m) => m.mobileNav).sort((a, b) => mobileOrder.indexOf(a.key) - mobileOrder.indexOf(b.key))

  return (
    <div className="min-h-screen bg-[#F5F7F6] lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-xs font-extrabold text-white">FMS</div>
          <div className="min-w-0">
            <div className="font-extrabold leading-tight text-ink">{appName}</div>
            <div className="text-[11px] leading-tight text-muted">{appSubtitle}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto">
          {moduleGroups.map((g) => {
            const items = navMods.filter((m) => m.group === g.key)
            if (!items.length) return null
            return (
              <div key={g.key}>
                <div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-muted/70">{g.label}</div>
                <div className="space-y-0.5">
                  {items.map((m) => (
                    <NavLink
                      key={m.key}
                      to={m.path}
                      end={m.path === '/'}
                      className={({ isActive }) =>
                        cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition', isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-gray-50 hover:text-ink')
                      }
                    >
                      <Icon name={m.icon} /> {m.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        <div className="border-t border-line pt-4">
          <div className="px-2 text-sm font-semibold text-ink">{user.fullName}</div>
          <div className="px-2 text-xs text-muted">{roleLabels[user.role]}</div>
          <button onClick={logout} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-gray-50 hover:text-ink">
            <Icon name="logout" /> Log keluar
          </button>
        </div>
      </aside>

      {/* Header (telefon) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-[10px] font-extrabold text-white">FMS</div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold leading-tight text-ink">{appName}</div>
            <div className="truncate text-[11px] leading-tight text-muted">{appSubtitle}</div>
          </div>
        </div>
        {mods.some((m) => m.key === 'settings') && (
          <NavLink to="/tetapan" className="rounded-lg p-2 text-muted hover:bg-gray-100" aria-label="Tetapan">
            <Icon name="settings" />
          </NavLink>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Navigasi bawah (telefon) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobile.map((m) => (
          <NavLink
            key={m.key}
            to={m.path}
            end={m.path === '/'}
            className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-brand-600' : 'text-muted')}
          >
            {m.key === 'new' ? (
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg">
                <Icon name="plus" className="h-6 w-6" />
              </span>
            ) : (
              <Icon name={m.icon} />
            )}
            <span>{m.key === 'new' ? 'Rekod' : m.label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

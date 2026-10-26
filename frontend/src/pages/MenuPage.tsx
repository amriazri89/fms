import { Link } from 'react-router-dom'
import { roleLabels, useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import { moduleGroups, modulesFor } from '../config/modules'

/** Senarai semua modul — untuk telefon, di mana bar bawah hanya muat 5 butang. */
export default function MenuPage() {
  const { user, logout } = useAuth()
  if (!user) return null
  const mods = modulesFor(user.role).filter((m) => !m.hidden && m.key !== 'menu')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Menu</h1>
        <p className="text-sm text-muted">{user.fullName} · {roleLabels[user.role]}</p>
      </div>
      {moduleGroups.map((g) => {
        const items = mods.filter((m) => m.group === g.key)
        if (!items.length) return null
        return (
          <section key={g.key}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{g.label}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((m) => (
                <Link key={m.key} to={m.path} className="flex min-h-[72px] flex-col justify-center gap-1.5 rounded-2xl border border-line bg-white p-3 text-sm font-semibold text-ink shadow-sm hover:bg-brand-50">
                  <Icon name={m.icon} className="h-5 w-5 text-brand-600" />
                  {m.label}
                </Link>
              ))}
            </div>
          </section>
        )
      })}
      <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="logout" /> Log keluar
      </button>
    </div>
  )
}

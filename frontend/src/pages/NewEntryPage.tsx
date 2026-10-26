import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Transaction, TransactionType } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import { TransactionForm } from '../components/TransactionForm'
import { Card, cx } from '../components/ui'
import { typeConfig, typesForRole } from '../config/transactionTypes'
import { formatRM } from '../lib/format'

const toneCls = {
  income: 'bg-brand-600 text-white hover:bg-brand-700',
  expense: 'bg-expense text-white hover:bg-red-800',
  neutral: 'bg-white text-ink border border-line hover:bg-gray-50',
}

export default function NewEntryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [lastSaved, setLastSaved] = useState<Transaction | null>(null)

  const allowed = typesForRole(user!.role)
  const selected = allowed.find((t) => t.type === params.get('jenis'))?.type
  const choose = (t?: TransactionType) => {
    setLastSaved(null)
    setParams(t ? { jenis: t } : {})
  }

  if (!selected) {
    const [primary, secondary] = [allowed.filter((t) => t.tone !== 'neutral'), allowed.filter((t) => t.tone === 'neutral')]
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Rekod baru</h1>
        <p className="text-sm text-muted">Pilih jenis rekod.</p>
        <div className="grid gap-3">
          {primary.map((t) => (
            <button key={t.type} onClick={() => choose(t.type)} className={cx('flex min-h-[84px] items-center gap-4 rounded-2xl px-5 text-left shadow-sm transition', toneCls[t.tone])}>
              <span className="text-3xl font-bold">{t.icon}</span>
              <span>
                <span className="block text-lg font-extrabold uppercase tracking-wide">{t.label}</span>
                <span className="block text-sm opacity-85">{t.help}</span>
              </span>
            </button>
          ))}
        </div>
        <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-muted">Jualan</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { to: '/resit/baru', icon: 'receipt' as const, label: 'Terima bayaran', sub: 'Jana resit' },
            { to: '/invois/baru', icon: 'file' as const, label: 'Invois baru', sub: 'Bil pelanggan' },
            { to: '/sebut-harga/baru', icon: 'quote' as const, label: 'Sebut harga', sub: 'Tawaran harga' },
          ].map((x) => (
            <Link key={x.to} to={x.to} className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-3 shadow-sm transition hover:bg-gray-50">
              <Icon name={x.icon} className="h-5 w-5 text-brand-600" />
              <span className="text-sm font-bold text-ink">{x.label}</span>
              <span className="text-xs text-muted">{x.sub}</span>
            </Link>
          ))}
        </div>
        <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-muted">Hutang kita</h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { to: '/hutang/baru', icon: 'bill' as const, label: 'Bil pembekal', sub: 'Ambil dulu, bayar kemudian' },
                { to: '/hutang/baru?jenis=pinjaman', icon: 'wallet' as const, label: 'Pinjaman', sub: 'Bank / orang' },
                { to: '/hutang', icon: 'truck' as const, label: 'Bayar hutang', sub: 'Pilih bil / ansuran' },
              ].map((x) => (
                <Link key={x.to} to={x.to} className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-3 shadow-sm transition hover:bg-gray-50">
                  <Icon name={x.icon} className="h-5 w-5 text-gold-600" />
                  <span className="text-sm font-bold text-ink">{x.label}</span>
                  <span className="text-xs text-muted">{x.sub}</span>
                </Link>
              ))}
            </div>
        <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-muted">Pekerja, bil & tuntutan</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { to: '/gaji', icon: 'wallet' as const, label: 'Bayar gaji', sub: 'Jana slip gaji' },
            { to: '/bil-utiliti', icon: 'bolt' as const, label: 'Bil utiliti', sub: 'Elektrik, air, internet' },
            { to: '/tuntutan', icon: 'claim' as const, label: 'Tuntutan', sub: 'Mohon / lulus' },
          ].map((x) => (
            <Link key={x.to} to={x.to} className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-3 shadow-sm transition hover:bg-gray-50">
              <Icon name={x.icon} className="h-5 w-5 text-brand-600" />
              <span className="text-sm font-bold text-ink">{x.label}</span>
              <span className="text-xs text-muted">{x.sub}</span>
            </Link>
          ))}
        </div>
        {secondary.length > 0 && (
          <>
            <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-muted">Lain-lain</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {secondary.map((t) => (
                <button key={t.type} onClick={() => choose(t.type)} className={cx('flex items-start gap-3 rounded-2xl p-4 text-left shadow-sm transition', toneCls.neutral)}>
                  <span className="text-2xl font-bold text-gold-600">{t.icon}</span>
                  <span>
                    <span className="block font-bold">{t.label}</span>
                    <span className="block text-xs text-muted">{t.help}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  const cfg = typeConfig(selected)
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <button onClick={() => choose()} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Tukar jenis
      </button>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{cfg.label}</h1>
        <p className="text-sm text-muted">{cfg.help}</p>
      </div>
      {lastSaved && (
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700">
          ✓ Disimpan: {formatRM(lastSaved.amount)} {lastSaved.businessUnitName ? `· ${lastSaved.businessUnitName}` : ''}
        </div>
      )}
      <Card>
        <TransactionForm
          key={selected}
          type={selected}
          onSaved={(t, again) => {
            if (again) setLastSaved(t)
            else navigate('/', { replace: true })
          }}
          onCancel={() => choose()}
        />
      </Card>
    </div>
  )
}

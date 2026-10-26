import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { appFullName, appName, appSubtitle } from '../config/app'
import { Button, ErrorBox, Field, Input } from '../components/ui'

export default function LoginPage() {
  const { user, login } = useAuth()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  if (user) {
    const to = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={to} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-600 lg:flex-row">
      <div className="flex flex-1 flex-col justify-end p-8 text-white lg:justify-center lg:p-16">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-extrabold">{appName}</div>
        <h1 className="text-3xl font-extrabold leading-tight lg:text-5xl">{appSubtitle}</h1>
        <p className="mt-2 text-white/70">{appFullName}</p>
        <p className="mt-3 max-w-md text-white/80">Jualan, invois, pembekal, bil utiliti, gaji dan tuntutan untuk semua perniagaan keluarga dalam satu tempat, dengan penyata untung rugi bila-bila masa.</p>
      </div>
      <div className="flex flex-1 items-start justify-center rounded-t-3xl bg-[#F5F7F6] p-6 lg:items-center lg:rounded-none">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-ink">Log masuk</h2>
          <Field label="Nama pengguna">
            <Input autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Kata laluan">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {!!error && <ErrorBox error={error} />}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Sedang log masuk…' : 'Log masuk'}
          </Button>
        </form>
      </div>
    </div>
  )
}

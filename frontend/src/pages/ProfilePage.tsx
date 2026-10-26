import { useState, type FormEvent } from 'react'
import { http } from '../api/client'
import { roleLabels, useAuth } from '../auth/AuthContext'
import { Button, Card, ErrorBox, Field, Input, PageHeader } from '../components/ui'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next !== confirm) {
      setError(new Error('Kata laluan baru tidak sama.'))
      return
    }
    setBusy(true)
    try {
      await http.post('/auth/change-password', { currentPassword: current, newPassword: next })
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Akaun saya" subtitle={user && `${user.fullName} · @${user.username} · ${roleLabels[user.role]}`} />
      <Card title="Tukar kata laluan">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Kata laluan semasa" required>
            <Input type="password" autoComplete="current-password" value={current} required onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="Kata laluan baru" required hint="Sekurang-kurangnya 8 aksara.">
            <Input type="password" autoComplete="new-password" minLength={8} value={next} required onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Ulang kata laluan baru" required>
            <Input type="password" autoComplete="new-password" minLength={8} value={confirm} required onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {!!error && <ErrorBox error={error} />}
          {done && <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">Kata laluan telah ditukar.</div>}
          <Button type="submit" disabled={busy} className="w-full">Simpan</Button>
        </form>
      </Card>
      <Button variant="secondary" className="w-full" onClick={logout}>Log keluar</Button>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { useCustomerMutations } from '../../api/salesHooks'
import type { Customer, CustomerInput } from '../../api/types'
import { Button, ErrorBox, Field, Input, Modal, Textarea } from '../ui'

const empty: CustomerInput = {
  name: '',
  contactPerson: null,
  phone: null,
  email: null,
  address: null,
  registrationNo: null,
  tag: null,
  notes: null,
  isActive: true,
}

export function CustomerFormModal({
  open,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean
  existing?: Customer
  onClose: () => void
  onSaved?: (c: Customer) => void
}) {
  const { save } = useCustomerMutations()
  const [form, setForm] = useState<CustomerInput>(empty)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (existing) {
      const { id: _id, createdAt: _c, ...rest } = existing
      void _id
      void _c
      setForm(rest)
    } else {
      setForm(empty)
    }
  }, [open, existing])

  const set = (k: keyof CustomerInput, v: string) => setForm((f) => ({ ...f, [k]: v === '' ? null : v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const c = await save.mutateAsync({ id: existing?.id, input: { ...form, name: form.name.trim() } })
      onSaved?.(c)
      onClose()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Modal open={open} title={existing ? 'Ubah pelanggan' : 'Pelanggan baru'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama pelanggan / syarikat" required>
          <Input value={form.name} required maxLength={150} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Orang untuk dihubungi">
            <Input value={form.contactPerson ?? ''} maxLength={100} onChange={(e) => set('contactPerson', e.target.value)} />
          </Field>
          <Field label="No. telefon" hint="Untuk butang WhatsApp">
            <Input type="tel" inputMode="tel" value={form.phone ?? ''} maxLength={50} onChange={(e) => set('phone', e.target.value)} placeholder="012-345 6789" />
          </Field>
          <Field label="E-mel">
            <Input type="email" value={form.email ?? ''} maxLength={100} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Label" hint="Contoh: Pemborong, Kilang, Restoran">
            <Input value={form.tag ?? ''} maxLength={50} onChange={(e) => set('tag', e.target.value)} />
          </Field>
        </div>
        <Field label="Alamat">
          <Textarea value={form.address ?? ''} maxLength={300} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="No. SSM / pendaftaran syarikat">
          <Input value={form.registrationNo ?? ''} maxLength={50} onChange={(e) => set('registrationNo', e.target.value)} />
        </Field>
        <Field label="Catatan dalaman">
          <Textarea value={form.notes ?? ''} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {existing && (
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Aktif
          </label>
        )}
        {!!error && <ErrorBox error={error} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

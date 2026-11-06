import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { http } from '../../api/client'
import type { PalmOwner } from '../../api/types'
import { fieldErrors } from '../staff/common'
import { Button, ErrorBox, Field, Input, Textarea } from '../ui'

/** Tambah / ubah pemilik sawit. */
export function PalmOwnerForm({ existing, onSaved, onCancel }: { existing?: PalmOwner; onSaved: (id: number) => void; onCancel: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(existing?.name ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [icNumber, setIcNumber] = useState(existing?.icNumber ?? '')
  const [bankInfo, setBankInfo] = useState(existing?.bankInfo ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setErrors({ name: 'Nama diperlukan.' })
    setBusy(true)
    setFormError(null)
    try {
      const input = {
        name: name.trim(), phone: phone.trim() || null, icNumber: icNumber.trim() || null,
        bankInfo: bankInfo.trim() || null, notes: notes.trim() || null, isActive,
      }
      const id = existing ? await http.put<number>(`/palm/owners/${existing.id}`, input) : await http.post<number>('/palm/owners', input)
      await qc.invalidateQueries({ queryKey: ['palm-owners'] })
      onSaved(existing?.id ?? id)
    } catch (ex) {
      setErrors(fieldErrors(ex))
      setFormError(ex)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama" required error={errors.name}>
        <Input value={name} autoFocus maxLength={150} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="No. telefon" hint="Untuk hantar slip melalui WhatsApp">
          <Input value={phone} maxLength={30} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="No. IC">
          <Input value={icNumber} maxLength={20} onChange={(e) => setIcNumber(e.target.value)} />
        </Field>
      </div>
      <Field label="Maklumat bank" hint="Contoh: Maybank 1122 3344 5566">
        <Input value={bankInfo} maxLength={150} onChange={(e) => setBankInfo(e.target.value)} />
      </Field>
      <Field label="Catatan">
        <Textarea value={notes} maxLength={300} rows={2} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {existing && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif
        </label>
      )}
      {!!formError && <ErrorBox error={formError} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
      </div>
    </form>
  )
}

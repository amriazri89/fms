import { useState, type ReactNode } from 'react'
import { useMasterMutation } from '../api/hooks'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Textarea } from './ui'
import { Icon } from './Icon'

export type FieldDef<T> =
  | { key: keyof T & string; label: string; kind: 'text' | 'color' | 'textarea'; required?: boolean; hint?: string; section?: string }
  | { key: keyof T & string; label: string; kind: 'number'; required?: boolean; hint?: string; section?: string }
  | { key: keyof T & string; label: string; kind: 'select'; options: { value: string | number; label: string }[]; allowEmpty?: string; required?: boolean; hint?: string; section?: string }
  | { key: keyof T & string; label: string; kind: 'checkbox'; hint?: string; section?: string }

export interface MasterTableProps<T extends { id: number; isActive: boolean }> {
  title: string
  description?: string
  resource: string
  cacheKey: string
  rows: T[] | undefined
  loading: boolean
  fields: FieldDef<T>[]
  columns: { label: string; render: (row: T) => ReactNode; className?: string }[]
  emptyRow: Omit<T, 'id'>
}

export function MasterTable<T extends { id: number; isActive: boolean }>(p: MasterTableProps<T>) {
  const { save, remove } = useMasterMutation<Omit<T, 'id'>>(p.resource, p.cacheKey)
  const [editing, setEditing] = useState<{ id?: number; values: Record<string, unknown> } | null>(null)
  const [error, setError] = useState<unknown>(null)

  const open = (row?: T) => {
    setError(null)
    if (row) {
      const { id, ...values } = row
      setEditing({ id, values })
    } else {
      setEditing({ values: { ...p.emptyRow } })
    }
  }

  const setVal = (k: string, v: unknown) => setEditing((e) => (e ? { ...e, values: { ...e.values, [k]: v } } : e))

  const submit = async () => {
    if (!editing) return
    setError(null)
    try {
      await save.mutateAsync({ id: editing.id, input: editing.values as Omit<T, 'id'> })
      setEditing(null)
    } catch (e) {
      setError(e)
    }
  }

  const doRemove = async () => {
    if (!editing?.id) return
    if (!window.confirm('Padam item ini? Jika sudah digunakan dalam rekod, ia akan dinyahaktifkan sahaja.')) return
    try {
      await remove.mutateAsync(editing.id)
      setEditing(null)
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Card
      title={p.title}
      action={
        <Button variant="secondary" onClick={() => open()} className="min-h-[36px] px-3">
          <Icon name="plus" className="h-4 w-4" /> Tambah
        </Button>
      }
    >
      {p.description && <p className="-mt-1 mb-3 text-sm text-muted">{p.description}</p>}
      {p.loading && <Spinner />}
      {p.rows && p.rows.length === 0 && <Empty>Belum ada data.</Empty>}
      {p.rows && p.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                {p.columns.map((c) => (
                  <th key={c.label} className={'py-2 font-semibold ' + (c.className ?? '')}>{c.label}</th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.id} className={'border-b border-line/60 last:border-0 ' + (r.isActive ? '' : 'opacity-50')}>
                  {p.columns.map((c) => (
                    <td key={c.label} className={'py-2.5 ' + (c.className ?? '')}>{c.render(r)}</td>
                  ))}
                  <td className="py-2.5 text-right">
                    {!r.isActive && <Badge>Tidak aktif</Badge>}
                    <button onClick={() => open(r)} className="ml-2 rounded-lg p-2 text-muted hover:bg-gray-100 hover:text-ink" aria-label="Ubah">
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} title={editing?.id ? `Ubah ${p.title.toLowerCase()}` : `Tambah ${p.title.toLowerCase()}`} onClose={() => setEditing(null)}>
        {editing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {p.fields.map((f, idx) => {
              const v = editing.values[f.key]
              const heading = f.section && f.section !== p.fields[idx - 1]?.section ? (
                <h3 key={`${f.key}-section`} className="border-t border-line pt-4 text-xs font-bold uppercase tracking-wide text-muted">{f.section}</h3>
              ) : null
              if (f.kind === 'textarea')
                return (
                  <div key={f.key} className="space-y-4">
                    {heading}
                    <Field label={f.label} required={f.required} hint={f.hint}>
                      <Textarea value={(v as string) ?? ''} onChange={(e) => setVal(f.key, e.target.value || null)} />
                    </Field>
                  </div>
                )
              if (heading && f.kind !== 'checkbox')
                return (
                  <div key={f.key} className="space-y-4">
                    {heading}
                    <Field label={f.label} hint={f.hint}>
                      <Input value={v === null || v === undefined ? '' : String(v)} onChange={(e) => setVal(f.key, e.target.value || null)} />
                    </Field>
                  </div>
                )
              if (f.kind === 'checkbox')
                return (
                  <label key={f.key} className="flex items-center gap-3 text-sm font-semibold">
                    <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!v} onChange={(e) => setVal(f.key, e.target.checked)} />
                    {f.label}
                  </label>
                )
              return (
                <Field key={f.key} label={f.label} required={f.required} hint={f.hint}>
                  {f.kind === 'select' ? (
                    <Select
                      required={f.required}
                      value={v === null || v === undefined ? '' : String(v)}
                      onChange={(e) => {
                        const raw = e.target.value
                        const opt = f.options.find((o) => String(o.value) === raw)
                        setVal(f.key, raw === '' ? null : opt ? opt.value : raw)
                      }}
                    >
                      {(f.allowEmpty || !f.required) && <option value="">{f.allowEmpty ?? '—'}</option>}
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  ) : f.kind === 'color' ? (
                    <div className="flex gap-2">
                      <input type="color" value={(v as string) || '#1F6F4A'} onChange={(e) => setVal(f.key, e.target.value)} className="h-11 w-14 rounded-lg border border-line" />
                      <Input value={(v as string) ?? ''} onChange={(e) => setVal(f.key, e.target.value)} />
                    </div>
                  ) : (
                    <Input
                      type={f.kind === 'number' ? 'number' : 'text'}
                      step={f.kind === 'number' ? 'any' : undefined}
                      required={f.required}
                      value={v === null || v === undefined ? '' : String(v)}
                      onChange={(e) => setVal(f.key, f.kind === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value || null)}
                    />
                  )}
                </Field>
              )
            })}
            {!!error && <ErrorBox error={error} />}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
              {editing.id ? (
                <Button type="button" variant="ghost" onClick={doRemove} className="text-expense">
                  <Icon name="trash" className="h-4 w-4" /> Padam
                </Button>
              ) : <span />}
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccounts, useBusinessUnits } from '../../api/hooks'
import { usePalmBatch, usePalmChargeTypes, usePalmMutations, usePalmOwners, usePalmSummary } from '../../api/palmHooks'
import type { ChargeMethod, MoneyChannel, PalmBatch, PalmChargeType, PalmOwner } from '../../api/types'
import { ChannelPicker } from '../../components/ChannelPicker'
import { Icon } from '../../components/Icon'
import { PalmOwnerForm } from '../../components/palm/PalmOwnerForm'
import { fieldErrors, moneyInput } from '../../components/staff/common'
import { Button, Card, ErrorBox, Field, Input, Modal, Money, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui'
import { accountForBusiness } from '../../config/channels'
import { chargeMethodUnit, chargeMethods, formatKg } from '../../config/palm'
import { parseNum } from '../../lib/documentMath'
import { formatRM, today } from '../../lib/format'
import { palmCharge, palmGross } from '../../lib/palmMath'

interface ChargeRow {
  chargeTypeId: number
  method: ChargeMethod
  rate: string
}

interface TicketRow {
  key: number
  ownerId: number | ''
  ticketNo: string
  date: string
  weightKg: string
  pricePerTonne: string
  gross: string
  /** Amaun ditaip sendiri — jangan kira semula dari berat × harga */
  grossManual: boolean
  charges: ChargeRow[]
}

let nextKey = 1
const LAST_UNIT_KEY = 'fms.palm.lastUnit'
const readLastUnit = () => {
  try {
    return Number(localStorage.getItem(LAST_UNIT_KEY)) || null
  } catch {
    return null
  }
}
const saveLastUnit = (id: number) => {
  try {
    localStorage.setItem(LAST_UNIT_KEY, String(id))
  } catch {
    /* storage tidak tersedia */
  }
}

/** Caj lalai untuk pemilik: kadar tiket terakhirnya, atau kadar lalai jenis caj. */
const defaultCharges = (types: PalmChargeType[], owner?: PalmOwner): ChargeRow[] =>
  types.map((t) => {
    const last = owner?.lastCharges.find((c) => c.chargeTypeId === t.id)
    return { chargeTypeId: t.id, method: last?.method ?? t.defaultMethod, rate: String(last?.rate ?? t.defaultRate) }
  })

const emptyTicket = (date: string, types: PalmChargeType[]): TicketRow => ({
  key: nextKey++, ownerId: '', ticketNo: '', date, weightKg: '', pricePerTonne: '', gross: '', grossManual: false, charges: defaultCharges(types),
})

/** Kiraan satu tiket (pratonton; server kira semula semasa simpan). */
const computeTicket = (t: TicketRow) => {
  const weight = parseNum(t.weightKg)
  const price = parseNum(t.pricePerTonne)
  const gross = t.grossManual || !(weight > 0 && price > 0) ? parseNum(t.gross) : palmGross(weight, price)
  const charges = t.charges.map((c) => palmCharge(c.method, parseNum(c.rate), weight, gross))
  const totalCharges = charges.reduce((s, x) => s + x, 0)
  return { weight, price, gross, charges, totalCharges, net: Math.round((gross - totalCharges) * 100) / 100 }
}

/** Rekod / ubah bayaran kilang (draf) bersama tiket-tiketnya. */
export default function PalmBatchEditPage() {
  const params = useParams()
  const id = Number(params.id) || undefined
  const { data: existing, isLoading } = usePalmBatch(id)
  if (id && isLoading) return <Spinner />
  if (existing && existing.status !== 'Draft')
    return <ErrorBox error={new Error('Bayaran kilang ini sudah disahkan. Buka semula dahulu untuk mengubahnya.')} />
  return <Editor key={existing?.id ?? 'new'} existing={existing} />
}

function Editor({ existing }: { existing?: PalmBatch }) {
  const navigate = useNavigate()
  const { data: units = [] } = useBusinessUnits()
  const { data: accounts = [] } = useAccounts()
  const { data: owners = [] } = usePalmOwners()
  const { data: chargeTypes = [], isLoading: loadingTypes } = usePalmChargeTypes()
  const { data: summary } = usePalmSummary()
  const { save, post } = usePalmMutations()

  const [millName, setMillName] = useState(existing?.millName ?? '')
  const [date, setDate] = useState(existing?.date ?? today())
  const [amount, setAmount] = useState(existing ? String(existing.amountReceived) : '')
  const [businessUnitId, setBusinessUnitId] = useState<number | ''>(existing?.businessUnitId ?? '')
  const [accountChosen, setAccountId] = useState<number | ''>(existing?.accountId ?? '')
  const [channel, setChannel] = useState<MoneyChannel | null>(existing?.channel ?? 'Bank')
  const [reference, setReference] = useState(existing?.reference ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [tickets, setTickets] = useState<TicketRow[]>(() =>
    existing
      ? existing.tickets.map((t) => ({
          key: nextKey++,
          ownerId: t.ownerId,
          ticketNo: t.ticketNo ?? '',
          date: t.date,
          weightKg: t.weightKg ? String(t.weightKg) : '',
          pricePerTonne: t.pricePerTonne != null ? String(t.pricePerTonne) : '',
          gross: String(t.gross),
          grossManual: !(t.weightKg > 0 && t.pricePerTonne != null && palmGross(t.weightKg, t.pricePerTonne) === t.gross),
          charges: t.charges.map((c) => ({ chargeTypeId: c.chargeTypeId, method: c.method, rate: String(c.rate) })),
        }))
      : [],
  )
  const [addingOwnerFor, setAddingOwnerFor] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<unknown>(null)

  // Perniagaan lalai: pilihan terakhir pengguna (tidak di-hardcode); akaun ikut perniagaan
  useEffect(() => {
    if (existing || businessUnitId !== '' || units.length === 0) return
    const last = readLastUnit()
    if (last && units.some((u) => u.id === last)) setBusinessUnitId(last)
    else if (units.length === 1) setBusinessUnitId(units[0].id)
  }, [existing, businessUnitId, units])
  const accountId = accountChosen || accountForBusiness(accounts, businessUnitId || null)?.id || ''

  // Tiket pertama untuk bayaran baru, selepas jenis caj dimuatkan
  useEffect(() => {
    if (!existing && tickets.length === 0 && !loadingTypes) setTickets([emptyTicket(date, chargeTypes)])
  }, [existing, tickets.length, loadingTypes, chargeTypes, date])

  // Tiket lama / dipindah mungkin tiada baris caj: tambah setiap jenis caj aktif yang tiada (kadar lalai)
  useEffect(() => {
    if (chargeTypes.length === 0) return
    setTickets((ts) => {
      let changed = false
      const next = ts.map((t) => {
        const missing = chargeTypes.filter((ct) => ct.isActive && !t.charges.some((c) => c.chargeTypeId === ct.id))
        if (missing.length === 0) return t
        changed = true
        const charges = [...t.charges, ...missing.map((ct) => ({ chargeTypeId: ct.id, method: ct.defaultMethod, rate: String(ct.defaultRate) }))]
        const order = (id: number) => chargeTypes.find((ct) => ct.id === id)?.sortOrder ?? 0
        return { ...t, charges: charges.sort((a, b) => order(a.chargeTypeId) - order(b.chargeTypeId)) }
      })
      return changed ? next : ts
    })
  }, [chargeTypes])

  // Kadar pukal: isi satu kadar untuk semua tiket sekali gus
  const [bulk, setBulk] = useState<Record<number, { method: ChargeMethod; rate: string }>>({})
  const bulkOf = (ct: PalmChargeType) => bulk[ct.id] ?? { method: ct.defaultMethod, rate: String(ct.defaultRate) }
  const applyBulk = (ct: PalmChargeType) => {
    const { method, rate } = bulkOf(ct)
    setTickets((ts) => ts.map((t) => ({
      ...t,
      charges: t.charges.some((c) => c.chargeTypeId === ct.id)
        ? t.charges.map((c) => (c.chargeTypeId === ct.id ? { ...c, method, rate } : c))
        : [...t.charges, { chargeTypeId: ct.id, method, rate }],
    })))
  }

  const mills = useMemo(() => [...new Set((summary?.batches ?? []).map((b) => b.millName))], [summary])
  const typeName = (id: number) => chargeTypes.find((t) => t.id === id)?.name ?? '?'

  const computed = tickets.map(computeTicket)
  const totals = computed.reduce(
    (s, c) => ({ weight: s.weight + c.weight, gross: s.gross + c.gross, charges: s.charges + c.totalCharges, net: s.net + c.net }),
    { weight: 0, gross: 0, charges: 0, net: 0 },
  )
  const received = parseNum(amount)
  const difference = Math.round((received - totals.gross) * 100) / 100

  const update = (key: number, patch: Partial<TicketRow>) => setTickets((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)))
  const updateCharge = (key: number, idx: number, patch: Partial<ChargeRow>) =>
    setTickets((ts) => ts.map((t) => (t.key === key ? { ...t, charges: t.charges.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : t)))
  const chooseOwner = (key: number, ownerId: number | '') => {
    const owner = owners.find((o) => o.id === ownerId)
    // Pemilik ditukar → isi caj ikut kadar terakhir pemilik itu
    update(key, { ownerId, charges: defaultCharges(chargeTypes, owner) })
  }
  const addTicket = () => {
    const last = tickets[tickets.length - 1]
    setTickets((ts) => [...ts, { ...emptyTicket(last?.date ?? date, chargeTypes), pricePerTonne: last?.pricePerTonne ?? '' }])
  }

  const submit = async (e: FormEvent | null, andPost: boolean) => {
    e?.preventDefault()
    setFormError(null)
    const err: Record<string, string> = {}
    if (!millName.trim()) err.millName = 'Nama kilang diperlukan.'
    if (received <= 0) err.amountReceived = 'Masukkan amaun yang diterima.'
    if (!businessUnitId) err.businessUnitId = 'Pilih perniagaan / servis.'
    if (!accountId) err.accountId = 'Pilih akaun.'
    if (!channel) err.channel = 'Pilih Tunai atau Bank.'
    tickets.forEach((t, n) => {
      if (!t.ownerId) err[`tickets.${n}.ownerId`] = 'Pilih pemilik.'
      if (computed[n].gross <= 0) err[`tickets.${n}.gross`] = 'Masukkan amaun.'
      if (computed[n].net < 0) err[`tickets.${n}.charges`] = 'Caj melebihi amaun tiket.'
      if (t.charges.some((c) => c.method === 'PerTonne' && parseNum(c.rate) > 0) && computed[n].weight <= 0)
        err[`tickets.${n}.weightKg`] = 'Masukkan berat untuk caj per tan.'
    })
    if (andPost && tickets.length === 0) err.tickets = 'Masukkan sekurang-kurangnya satu tiket.'
    if (andPost && difference !== 0) err.tickets = `Jumlah tiket mesti sama dengan amaun diterima (beza ${formatRM(difference)}).`
    setErrors(err)
    if (Object.keys(err).length) return

    try {
      const saved = await save.mutateAsync({
        id: existing?.id,
        input: {
          millName: millName.trim(),
          date,
          amountReceived: received,
          businessUnitId: Number(businessUnitId),
          accountId: Number(accountId),
          channel: channel!,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          tickets: tickets.map((t, n) => ({
            ownerId: Number(t.ownerId),
            ticketNo: t.ticketNo.trim() || null,
            date: t.date,
            weightKg: computed[n].weight,
            pricePerTonne: t.pricePerTonne.trim() ? computed[n].price : null,
            gross: computed[n].gross,
            charges: t.charges.map((c) => ({ chargeTypeId: c.chargeTypeId, method: c.method, rate: parseNum(c.rate) })),
          })),
        },
      })
      saveLastUnit(Number(businessUnitId))
      if (andPost) await post.mutateAsync(saved.id)
      navigate(`/sawit/${saved.id}`)
    } catch (ex) {
      setErrors(fieldErrors(ex))
      setFormError(ex)
    }
  }

  const busy = save.isPending || post.isPending

  return (
    <>
    <form onSubmit={(e) => submit(e, false)} className="space-y-4 pb-24">
      <Link to={existing ? `/sawit/${existing.id}` : '/sawit'} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> {existing ? existing.number : 'Agihan sawit'}
      </Link>
      <PageHeader
        title={existing ? `Ubah ${existing.number}` : 'Bayaran kilang baru'}
        subtitle="Masukkan amaun yang kilang bayar dan setiap tiket timbang. Caj (upah potong, transport) jadi pendapatan; baki dibayar kepada pemilik."
      />

      <Card title="Bayaran dari kilang">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nama kilang" required error={errors.millName}>
            <Input value={millName} list="palm-mills" maxLength={150} onChange={(e) => setMillName(e.target.value)} placeholder="Contoh: Kilang Sawit Felda" />
            <datalist id="palm-mills">{mills.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Tarikh terima" required error={errors.date}>
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amaun diterima (RM)" required error={errors.amountReceived}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(moneyInput(e.target.value))} placeholder="0.00" className="text-lg font-bold tabular-nums" />
          </Field>
          <Field label="Perniagaan / servis" required error={errors.businessUnitId}>
            <Select value={businessUnitId} onChange={(e) => { setBusinessUnitId(e.target.value ? Number(e.target.value) : ''); setAccountId('') }}>
              <option value="">— Pilih —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Masuk ke akaun" required error={errors.accountId}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Pilih akaun —</option>
              {accounts.filter((a) => a.isActive && (a.businessUnitId === null || a.businessUnitId === businessUnitId)).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tunai / Bank" required error={errors.channel}>
            <ChannelPicker value={channel} onChange={setChannel} />
          </Field>
          <Field label="No. rujukan" hint="Contoh: no. pindahan bank / cek">
            <Input value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="Pilihan" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Catatan">
              <Textarea value={notes} maxLength={500} rows={1} onChange={(e) => setNotes(e.target.value)} placeholder="Pilihan" />
            </Field>
          </div>
        </div>
      </Card>

      {chargeTypes.length === 0 && !loadingTypes && (
        <div className="rounded-xl border border-gold-500/30 bg-gold-50 px-3 py-2 text-sm">
          Belum ada jenis caj (upah potong, transport). Pengurus boleh tambah di <Link to="/tetapan" className="font-semibold underline">Tetapan → Caj sawit</Link>.
        </div>
      )}

      {chargeTypes.some((ct) => ct.isActive) && tickets.length > 1 && (
        <Card title="Kadar caj untuk semua tiket">
          <p className="mb-3 text-sm text-muted">Isi kadar di sini dan tekan <b>Guna pada semua tiket</b>. Kadar setiap tiket masih boleh diubah satu-satu di bawah.</p>
          <div className="space-y-3">
            {chargeTypes.filter((ct) => ct.isActive).map((ct) => {
              const v = bulkOf(ct)
              return (
                <Field key={ct.id} label={ct.name}>
                  <div className="flex flex-wrap gap-2">
                    <Select value={v.method} onChange={(e) => setBulk((b) => ({ ...b, [ct.id]: { ...v, method: e.target.value as ChargeMethod } }))} className="w-36 shrink-0">
                      {chargeMethods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                    <Input inputMode="decimal" value={v.rate} onChange={(e) => setBulk((b) => ({ ...b, [ct.id]: { ...v, rate: moneyInput(e.target.value) } }))} aria-label={`Kadar ${ct.name} (${chargeMethodUnit(v.method)})`} className="w-32" />
                    <span className="flex items-center text-sm text-muted">{chargeMethodUnit(v.method)}</span>
                    <Button type="button" variant="secondary" onClick={() => applyBulk(ct)}>Guna pada semua tiket</Button>
                  </div>
                </Field>
              )
            })}
          </div>
        </Card>
      )}

      <Card title={`Tiket kilang (${tickets.length})`} action={<Button type="button" variant="secondary" onClick={addTicket} className="min-h-[36px] px-3"><Icon name="plus" className="h-4 w-4" /> Tambah tiket</Button>}>
        <div className="space-y-3">
          {tickets.map((t, n) => {
            const c = computed[n]
            const err = (f: string) => errors[`tickets.${n}.${f}`]
            return (
              <div key={t.key} className="rounded-2xl border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">Tiket {n + 1}</span>
                  <button type="button" onClick={() => setTickets((ts) => ts.filter((x) => x.key !== t.key))} className="text-xs font-semibold text-muted hover:text-expense">
                    Buang
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Field label="Pemilik" required error={err('ownerId')}>
                      <div className="flex gap-2">
                        <Select value={t.ownerId} onChange={(e) => chooseOwner(t.key, e.target.value ? Number(e.target.value) : '')}>
                          <option value="">— Pilih pemilik —</option>
                          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </Select>
                        <Button type="button" variant="secondary" className="shrink-0" onClick={() => setAddingOwnerFor(t.key)}>Baru</Button>
                      </div>
                    </Field>
                  </div>
                  <Field label="No. tiket">
                    <Input value={t.ticketNo} maxLength={50} onChange={(e) => update(t.key, { ticketNo: e.target.value })} />
                  </Field>
                  <Field label="Tarikh tiket">
                    <Input type="date" value={t.date} max={today()} onChange={(e) => update(t.key, { date: e.target.value })} />
                  </Field>
                  <Field label="Berat (kg)" error={err('weightKg')}>
                    <Input inputMode="decimal" value={t.weightKg} onChange={(e) => update(t.key, { weightKg: moneyInput(e.target.value) })} placeholder="0" />
                  </Field>
                  <Field label="Harga (RM/tan)">
                    <Input inputMode="decimal" value={t.pricePerTonne} onChange={(e) => update(t.key, { pricePerTonne: moneyInput(e.target.value) })} placeholder="Pilihan" />
                  </Field>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Field
                      label="Amaun tiket (RM)"
                      required
                      error={err('gross')}
                      hint={!t.grossManual && c.weight > 0 && c.price > 0 ? 'Dikira: berat × harga. Taip untuk tukar.' : undefined}
                    >
                      <Input
                        inputMode="decimal"
                        value={!t.grossManual && c.weight > 0 && c.price > 0 ? String(c.gross) : t.gross}
                        onChange={(e) => update(t.key, { gross: moneyInput(e.target.value), grossManual: true })}
                        placeholder="0.00"
                        className="font-semibold tabular-nums"
                      />
                    </Field>
                    {t.grossManual && c.weight > 0 && c.price > 0 && (
                      <button type="button" className="mt-1 text-xs font-semibold text-brand-700 hover:underline" onClick={() => update(t.key, { grossManual: false })}>
                        Kira semula dari berat × harga ({formatRM(palmGross(c.weight, c.price))})
                      </button>
                    )}
                  </div>
                  {t.charges.map((ch, i) => (
                    <div key={ch.chargeTypeId} className="sm:col-span-2 lg:col-span-2">
                      <Field label={typeName(ch.chargeTypeId)} error={i === 0 ? err('charges') : undefined}>
                        <div className="flex gap-2">
                          <Select value={ch.method} onChange={(e) => updateCharge(t.key, i, { method: e.target.value as ChargeMethod })} className="w-36 shrink-0">
                            {chargeMethods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </Select>
                          <Input inputMode="decimal" value={ch.rate} onChange={(e) => updateCharge(t.key, i, { rate: moneyInput(e.target.value) })} aria-label={`Kadar ${chargeMethodUnit(ch.method)}`} />
                          <span className="flex min-w-[88px] shrink-0 items-center justify-end text-sm font-semibold tabular-nums text-expense">−{formatRM(c.charges[i])}</span>
                        </div>
                      </Field>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-line/60 pt-2 text-sm">
                  {c.weight > 0 && <span className="text-muted">{formatKg(c.weight)}</span>}
                  <span className="text-muted">Caj <Money value={c.totalCharges} className="font-semibold text-ink" /></span>
                  <span>Dibayar kepada pemilik <Money value={c.net} className={cx('font-bold', c.net < 0 ? 'text-expense' : 'text-ink')} /></span>
                </div>
              </div>
            )
          })}
          {tickets.length === 0 && <p className="text-sm text-muted">Belum ada tiket.</p>}
          <Button type="button" variant="secondary" onClick={addTicket} className="w-full"><Icon name="plus" className="h-4 w-4" /> Tambah tiket</Button>
        </div>
      </Card>

      {/* Ringkasan melekat di bawah */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>Tiket <Money value={totals.gross} className="font-bold" /></span>
            <span>Caj (pendapatan) <Money value={totals.charges} className="font-bold text-income" /></span>
            <span>Pemilik <Money value={totals.net} className="font-bold" /></span>
            <span className={cx('font-semibold', difference === 0 ? 'text-income' : 'text-expense')}>
              {difference === 0 ? '✓ Sama dengan amaun kilang' : `Beza dengan amaun kilang ${formatRM(difference)}`}
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={busy}>{save.isPending && !post.isPending ? 'Menyimpan…' : 'Simpan draf'}</Button>
            <Button type="button" disabled={busy} onClick={() => submit(null, true)}>{post.isPending ? 'Mengesahkan…' : 'Simpan & sahkan'}</Button>
          </div>
        </div>
        {(errors.tickets || !!formError) && (
          <div className="mx-auto mt-2 max-w-5xl text-sm">
            {errors.tickets && <p className="font-semibold text-expense">{errors.tickets}</p>}
            {!!formError && !errors.tickets && <ErrorBox error={formError} />}
          </div>
        )}
      </div>
    </form>

    {/* Di luar <form>: borang pemilik ada <form> sendiri (borang bersarang tidak sah) */}
    <Modal open={addingOwnerFor !== null} title="Pemilik sawit baru" onClose={() => setAddingOwnerFor(null)}>
        {addingOwnerFor !== null && (
          <PalmOwnerForm
            onCancel={() => setAddingOwnerFor(null)}
            onSaved={(ownerId) => {
              update(addingOwnerFor, { ownerId, charges: defaultCharges(chargeTypes) })
              setAddingOwnerFor(null)
            }}
          />
        )}
    </Modal>
    </>
  )
}

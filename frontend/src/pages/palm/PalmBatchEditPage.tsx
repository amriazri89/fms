import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
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

  const activeTypes = chargeTypes.filter((ct) => ct.isActive)

  // Kumpulan ikut pemilik (ikut susunan tiket); carian pemilik / no. tiket
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [changingOwner, setChangingOwner] = useState<Set<number>>(() => new Set())
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const mills = useMemo(() => [...new Set((summary?.batches ?? []).map((b) => b.millName))], [summary])
  const typeName = (id: number) => chargeTypes.find((t) => t.id === id)?.name ?? '?'

  const computed = tickets.map(computeTicket)
  const totals = computed.reduce(
    (s, c) => ({ weight: s.weight + c.weight, gross: s.gross + c.gross, charges: s.charges + c.totalCharges, net: s.net + c.net }),
    { weight: 0, gross: 0, charges: 0, net: 0 },
  )
  const received = parseNum(amount)
  const difference = Math.round((received - totals.gross) * 100) / 100

  const ownerName = (id: number | '') => (id === '' ? 'Belum pilih pemilik' : owners.find((o) => o.id === id)?.name ?? `Pemilik #${id}`)
  const groups: TicketGroup[] = []
  tickets.forEach((t, n) => {
    const id = t.ownerId === '' ? 'none' : String(t.ownerId)
    let g = groups.find((x) => x.id === id)
    if (!g) groups.push((g = { id, ownerId: t.ownerId, name: ownerName(t.ownerId), rows: [], weight: 0, gross: 0, charges: 0, net: 0 }))
    const c = computed[n]
    g.rows.push({ t, n })
    g.weight += c.weight
    g.gross += c.gross
    g.charges += c.totalCharges
    g.net += c.net
  })
  const q = search.trim().toLowerCase()
  const visibleGroups = q
    ? groups
        .map((g) => (g.name.toLowerCase().includes(q) ? g : { ...g, rows: g.rows.filter(({ t }) => t.ticketNo.toLowerCase().includes(q)) }))
        .filter((g) => g.rows.length > 0)
    : groups

  const update = (key: number, patch: Partial<TicketRow>) => setTickets((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)))
  const updateCharge = (key: number, idx: number, patch: Partial<ChargeRow>) =>
    setTickets((ts) => ts.map((t) => (t.key === key ? { ...t, charges: t.charges.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : t)))
  const chooseOwner = (key: number, ownerId: number | '') => {
    const owner = owners.find((o) => o.id === ownerId)
    // Pemilik ditukar → isi caj ikut kadar terakhir pemilik itu
    update(key, { ownerId, charges: defaultCharges(chargeTypes, owner) })
    if (ownerId !== '') setOpen((s) => new Set(s).add(String(ownerId)))
  }
  const addTicket = () => {
    const last = tickets[tickets.length - 1]
    setTickets((ts) => [...ts, { ...emptyTicket(last?.date ?? date, chargeTypes), pricePerTonne: last?.pricePerTonne ?? '' }])
    setOpen((s) => new Set(s).add('none'))
    setSearch('')
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
    if (Object.keys(err).length) {
      const bad = new Set(Object.keys(err).map((k) => /^tickets\.(\d+)\./.exec(k)?.[1]).filter(Boolean).map(Number))
      if (bad.size) setOpen((s) => { const n = new Set(s); bad.forEach((i) => n.add(tickets[i].ownerId === '' ? 'none' : String(tickets[i].ownerId))); return n })
      return
    }

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

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Amaun kilang" value={received} />
        <Stat label={`${tickets.length} tiket · ${formatKg(totals.weight)}`} value={totals.gross}
          note={difference === 0 ? '✓ Sama dengan amaun kilang' : `Beza ${formatRM(difference)}`} noteTone={difference === 0 ? 'ok' : 'bad'} />
        <Stat label="Caj → pendapatan" value={totals.charges} tone="income" />
        <Stat label={`Untuk ${groups.filter((g) => g.ownerId !== '').length} pemilik`} value={totals.net} />
      </div>

      {activeTypes.length > 0 && tickets.length > 1 && (
        <Card title="Kadar caj sekali gus">
          <p className="mb-3 text-sm text-muted">Isi kadar dan tekan <b>Guna pada semua tiket</b>. Lepas itu, ubah tiket yang berbeza sahaja di bawah.</p>
          <div className="divide-y divide-line/60">
            {activeTypes.map((ct) => {
              const v = bulkOf(ct)
              return (
                <div key={ct.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
                  <span className="w-28 shrink-0 text-sm font-semibold">{ct.name}</span>
                  <MethodPicker value={v.method} onChange={(method) => setBulk((b) => ({ ...b, [ct.id]: { ...v, method } }))} />
                  <RateInput method={v.method} value={v.rate} onChange={(rate) => setBulk((b) => ({ ...b, [ct.id]: { ...v, rate } }))} label={ct.name} />
                  <Button type="button" variant="secondary" className="min-h-[36px] px-3 text-sm" onClick={() => applyBulk(ct)}>Guna pada semua tiket</Button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Card
        title={`Tiket kilang (${tickets.length})`}
        action={<Button type="button" variant="secondary" onClick={addTicket} className="min-h-[36px] px-3"><Icon name="plus" className="h-4 w-4" /> Tambah tiket</Button>}
      >
        {tickets.length > 3 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pemilik atau no. tiket" className="min-h-[40px] pl-9" />
            </div>
            <Button type="button" variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => setOpen(new Set(groups.map((g) => g.id)))}>Buka semua</Button>
            <Button type="button" variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => setOpen(new Set())}>Tutup semua</Button>
          </div>
        )}

        <div className="space-y-2">
          {visibleGroups.map((g) => {
            const isOpen = open.has(g.id) || !!search.trim() || groups.length === 1
            const hasError = g.rows.some(({ n }) => Object.keys(errors).some((k) => k.startsWith(`tickets.${n}.`)))
            return (
              <div key={g.id} className={cx('overflow-hidden rounded-2xl border', hasError ? 'border-expense/50' : 'border-line')}>
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 bg-brand-50/50 px-3 py-2.5 text-left hover:bg-brand-50"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Icon name="chevron" className={cx('h-4 w-4 shrink-0 text-muted transition-transform', isOpen && 'rotate-90')} />
                    <span className="truncate font-semibold">{g.name}</span>
                    <span className="shrink-0 text-xs text-muted">{g.rows.length} tiket · {formatKg(g.weight)}</span>
                    {hasError && <span className="shrink-0 text-xs font-semibold text-expense">Perlu dibetulkan</span>}
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums sm:text-sm">
                    <span className="text-muted">Amaun <b className="text-ink">{formatRM(g.gross)}</b></span>
                    <span className="text-muted">Caj <b className={g.charges > 0 ? 'text-income' : 'text-muted'}>{formatRM(g.charges)}</b></span>
                    <span className="text-muted">Bersih <b className="text-ink">{formatRM(g.net)}</b></span>
                  </span>
                </button>

                {isOpen && (
                  <div className="divide-y divide-line/60">
                    {g.rows.map(({ t, n }) => {
                      const c = computed[n]
                      const err = (f: string) => errors[`tickets.${n}.${f}`]
                      const auto = !t.grossManual && c.weight > 0 && c.price > 0
                      const showOwner = t.ownerId === '' || changingOwner.has(t.key) || !!err('ownerId')
                      return (
                        <div key={t.key} className="space-y-2.5 px-3 py-3">
                          {showOwner && (
                            <Mini label="Pemilik" error={err('ownerId')}>
                              <div className="flex gap-1.5">
                                <Select value={t.ownerId} onChange={(e) => chooseOwner(t.key, e.target.value ? Number(e.target.value) : '')} className={small}>
                                  <option value="">— Pilih pemilik —</option>
                                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </Select>
                                <Button type="button" variant="secondary" className="min-h-[38px] shrink-0 px-2.5 text-sm" onClick={() => setAddingOwnerFor(t.key)}>Baru</Button>
                              </div>
                            </Mini>
                          )}
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto]">
                            <Mini label="No. tiket / lokasi">
                              <Input value={t.ticketNo} maxLength={50} onChange={(e) => update(t.key, { ticketNo: e.target.value })} className={small} />
                            </Mini>
                            <Mini label="Tarikh">
                              <Input type="date" value={t.date} max={today()} onChange={(e) => update(t.key, { date: e.target.value })} className={small} />
                            </Mini>
                            <Mini label="Berat (kg)" error={err('weightKg')}>
                              <Input inputMode="decimal" value={t.weightKg} onChange={(e) => update(t.key, { weightKg: moneyInput(e.target.value) })} placeholder="0" className={cx(small, 'text-right tabular-nums')} />
                            </Mini>
                            <Mini label="RM / tan">
                              <Input inputMode="decimal" value={t.pricePerTonne} onChange={(e) => update(t.key, { pricePerTonne: moneyInput(e.target.value) })} placeholder="—" className={cx(small, 'text-right tabular-nums')} />
                            </Mini>
                            <Mini label={auto ? 'Amaun (auto)' : 'Amaun (RM)'} error={err('gross')}>
                              <Input
                                inputMode="decimal"
                                value={auto ? c.gross.toFixed(2) : t.gross}
                                onChange={(e) => update(t.key, { gross: moneyInput(e.target.value), grossManual: true })}
                                placeholder="0.00"
                                title={auto ? 'Dikira: berat × harga. Taip untuk tukar.' : undefined}
                                className={cx(small, 'text-right font-semibold tabular-nums')}
                              />
                              {t.grossManual && c.weight > 0 && c.price > 0 && (
                                <button type="button" className="mt-0.5 text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => update(t.key, { grossManual: false })}>
                                  Guna berat × harga
                                </button>
                              )}
                            </Mini>
                            <div className="flex items-end justify-end gap-1 sm:col-span-5 lg:col-span-1">
                              {t.ownerId !== '' && !showOwner && (
                                <button
                                  type="button"
                                  title="Pindah tiket ini ke pemilik lain"
                                  onClick={() => setChangingOwner((s) => new Set(s).add(t.key))}
                                  className="grid h-[38px] w-[38px] place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-ink"
                                >
                                  <Icon name="user" className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`Buang tiket ${n + 1}`}
                                title="Buang tiket"
                                onClick={() => setTickets((ts) => ts.filter((x) => x.key !== t.key))}
                                className="grid h-[38px] w-[38px] place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-expense"
                              >
                                <Icon name="trash" className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {t.charges.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-2">
                              {t.charges.map((ch, i) => (
                                <div key={ch.chargeTypeId} className="flex flex-wrap items-center gap-1.5">
                                  <span className="w-24 text-xs font-semibold text-muted sm:w-auto">{typeName(ch.chargeTypeId)}</span>
                                  <MethodPicker value={ch.method} onChange={(method) => updateCharge(t.key, i, { method })} />
                                  <RateInput method={ch.method} value={ch.rate} onChange={(rate) => updateCharge(t.key, i, { rate })} label={typeName(ch.chargeTypeId)} />
                                  <span className="w-20 text-right text-sm font-semibold tabular-nums text-expense">−{formatRM(c.charges[i])}</span>
                                  {i < t.charges.length - 1 && <span className="mx-1 hidden h-5 w-px bg-line sm:block" />}
                                </div>
                              ))}
                              <span className="ml-auto text-sm">
                                Bersih <Money value={c.net} className={cx('font-bold', c.net < 0 ? 'text-expense' : 'text-ink')} />
                              </span>
                              {err('charges') && <span className="w-full text-xs font-medium text-expense">{err('charges')}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {tickets.length === 0 && <p className="text-sm text-muted">Belum ada tiket.</p>}
          {tickets.length > 0 && visibleGroups.length === 0 && <p className="text-sm text-muted">Tiada tiket sepadan dengan carian.</p>}
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

interface TicketGroup {
  id: string
  ownerId: number | ''
  name: string
  rows: { t: TicketRow; n: number }[]
  weight: number
  gross: number
  charges: number
  net: number
}

const small = 'min-h-[38px] rounded-lg px-2.5 text-sm'

function Mini({ label, error, className, children }: { label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx('block min-w-0', className)}>
      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {error && <span className="mt-0.5 block text-xs font-medium text-expense">{error}</span>}
    </label>
  )
}

function Stat({ label, value, tone, note, noteTone }: { label: string; value: number; tone?: 'income'; note?: string; noteTone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3 shadow-sm">
      <div className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <Money value={value} className={cx('mt-0.5 block text-xl font-extrabold', tone === 'income' && 'text-income')} />
      {note && <div className={cx('text-xs font-semibold', noteTone === 'ok' ? 'text-income' : 'text-expense')}>{note}</div>}
    </div>
  )
}

const methodShort: Record<ChargeMethod, string> = { PerTonne: 'RM/tan', Fixed: 'RM', Percent: '%' }
const methodHelp: Record<ChargeMethod, string> = { PerTonne: 'Ringgit setiap tan', Fixed: 'Amaun tetap (taip RM terus)', Percent: 'Peratus daripada amaun tiket' }

/** Pilihan cara kira caj: RM/tan · RM tetap · %. */
function MethodPicker({ value, onChange }: { value: ChargeMethod; onChange: (m: ChargeMethod) => void }) {
  return (
    <div role="radiogroup" className="inline-flex shrink-0 rounded-lg border border-line bg-white p-0.5">
      {chargeMethods.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          title={methodHelp[m.value]}
          onClick={() => onChange(m.value)}
          className={cx(
            'min-h-[32px] rounded-md px-2.5 text-xs font-semibold transition',
            value === m.value ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:bg-brand-50 hover:text-ink',
          )}
        >
          {methodShort[m.value]}
        </button>
      ))}
    </div>
  )
}

function RateInput({ method, value, onChange, label }: { method: ChargeMethod; value: string; onChange: (v: string) => void; label: string }) {
  const prefix = method === 'Percent' ? null : 'RM'
  return (
    <div className="relative w-28 shrink-0">
      {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">{prefix}</span>}
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(moneyInput(e.target.value))}
        aria-label={`${label} (${chargeMethodUnit(method)})`}
        placeholder="0"
        className={cx('min-h-[36px] rounded-lg text-right text-sm tabular-nums', prefix ? 'pl-9 pr-2.5' : 'pl-2.5 pr-7')}
      />
      {method === 'Percent' && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>}
    </div>
  )
}

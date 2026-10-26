import type { ReactNode } from 'react'
import type { Buyer, DocumentLine, Invoice, Quotation, Receipt, Seller } from '../../api/types'
import { docTitles, paymentMethodLabel } from '../../config/sales'
import { formatAmount, formatDate, formatQty, formatRM } from '../../lib/format'
import { amountInWords } from '../../lib/words'

export type PrintableProps =
  | { kind: 'quotation'; doc: Quotation; taxLabel: string }
  | { kind: 'invoice'; doc: Invoice; taxLabel: string }
  | { kind: 'receipt'; doc: Receipt; taxLabel: string }

const fallbackAccent = '#1F6F4A'
const INK = '#22302A'

function luminance(hex: string) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return 0
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** Warna teks (putih atau gelap) yang paling jelas di atas warna perniagaan. */
export function textOn(accent: string) {
  const l = luminance(accent)
  return contrast(l, 1) >= contrast(l, luminance(INK)) ? '#FFFFFF' : INK
}

function SellerBlock({ s }: { s: Seller }) {
  return (
    <div className="min-w-0">
      <div className="text-xl font-extrabold leading-tight text-ink">{s.name}</div>
      {s.registrationNo && <div className="mt-0.5 text-[11px] text-muted">No. Pendaftaran: {s.registrationNo}</div>}
      {s.address && <div className="mt-1.5 whitespace-pre-line text-[12px] leading-snug text-muted">{s.address}</div>}
      {(s.phone || s.email) && <div className="mt-1 text-[12px] text-muted">{[s.phone && `Tel: ${s.phone}`, s.email].filter(Boolean).join('  ·  ')}</div>}
    </div>
  )
}

function BuyerBlock({ label, b }: { label: string; b: Buyer }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1 text-[14px] font-bold text-ink">{b.name}</div>
      {b.registrationNo && <div className="text-[11px] text-muted">No. Pendaftaran: {b.registrationNo}</div>}
      {b.contactPerson && <div className="text-[12px] text-ink">u.p. {b.contactPerson}</div>}
      {b.address && <div className="whitespace-pre-line text-[12px] leading-snug text-muted">{b.address}</div>}
      {(b.phone || b.email) && <div className="text-[12px] text-muted">{[b.phone, b.email].filter(Boolean).join('  ·  ')}</div>}
    </div>
  )
}

function Meta({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto,auto] justify-end gap-x-4 gap-y-0.5 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-right text-muted">{k}</dt>
          <dd className="text-right font-semibold tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ItemsTable({ items, accent }: { items: DocumentLine[]; accent: string }) {
  return (
    <table className="w-full border-collapse text-[11.5px] sm:text-[12.5px]">
      <thead>
        <tr style={{ background: accent, color: textOn(accent) }} className="text-left text-[11px] uppercase tracking-wide">
          <th className="hidden w-8 px-2 py-2 text-center font-semibold sm:table-cell">#</th>
          <th className="px-1.5 py-2 font-semibold sm:px-2">Perkara</th>
          <th className="px-1.5 py-2 sm:px-2 text-right font-semibold">Kuantiti</th>
          <th className="px-1.5 py-2 sm:px-2 text-right font-semibold">Harga (RM)</th>
          <th className="px-1.5 py-2 sm:px-2 text-right font-semibold">Jumlah (RM)</th>
        </tr>
      </thead>
      <tbody>
        {items.map((l, i) => (
          <tr key={l.id || i} className="border-b border-line align-top">
            <td className="hidden px-2 py-2 text-center text-muted sm:table-cell">{i + 1}</td>
            <td className="px-1.5 py-2 text-ink sm:px-2">{l.description}</td>
            <td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums sm:px-2">
              {formatQty(l.quantity)}
              {l.unit && <span className="text-muted"> {l.unit}</span>}
            </td>
            <td className="px-1.5 py-2 text-right tabular-nums sm:px-2">{formatAmount(l.unitPrice)}</td>
            <td className="px-1.5 py-2 text-right font-semibold tabular-nums sm:px-2">{formatAmount(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TotalRow({ label, value, strong, accent }: { label: string; value: number; strong?: boolean; accent?: string }) {
  return (
    <div
      className={'flex justify-between gap-6 px-3 py-1.5 ' + (strong ? 'text-[15px] font-extrabold' : 'text-[12.5px]')}
      style={strong && accent ? { background: accent, color: textOn(accent) } : undefined}
    >
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="tabular-nums">{formatRM(value)}</span>
    </div>
  )
}

function Totals({ d, taxLabel, accent, extra }: {
  d: { subtotal: number; discountAmount: number; taxRate: number; taxAmount: number; total: number }
  taxLabel: string
  accent: string
  extra?: ReactNode
}) {
  return (
    <div className="ml-auto w-full max-w-[280px] break-inside-avoid">
      <TotalRow label="Jumlah kecil" value={d.subtotal} />
      {d.discountAmount > 0 && <TotalRow label="Diskaun" value={-d.discountAmount} />}
      {d.taxRate > 0 && <TotalRow label={`${taxLabel} ${d.taxRate}%`} value={d.taxAmount} />}
      <TotalRow label="JUMLAH" value={d.total} strong accent={accent} />
      {extra}
    </div>
  )
}

function Words({ amount }: { amount: number }) {
  return (
    <p className="mt-3 text-[12px] italic text-muted">
      <span className="font-semibold not-italic text-ink">Ringgit Malaysia: </span>
      {amountInWords(amount)}
    </p>
  )
}

function TextSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{title}</div>
      <div className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-ink">{children}</div>
    </div>
  )
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-12 grid grid-cols-2 gap-16 break-inside-avoid text-[11px] text-muted">
      {[left, right].map((l) => (
        <div key={l}>
          <div className="h-10 border-b border-ink/60" />
          <div className="mt-1.5">{l}</div>
        </div>
      ))}
    </div>
  )
}

function Stamp({ text }: { text: string }) {
  const good = text === 'LUNAS'
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <span className={'-rotate-[24deg] rounded-xl border-[6px] px-8 py-2 text-[64px] font-black tracking-[0.2em] ' + (good ? 'border-income/30 text-income/25' : 'border-expense/40 text-expense/30')}>
        {text}
      </span>
    </div>
  )
}

/** Dokumen A4 — digunakan untuk pratonton dalam aplikasi dan untuk cetakan. */
export function PrintableDocument(props: PrintableProps) {
  const { kind, doc, taxLabel } = props
  const accent = doc.seller.color || fallbackAccent

  let meta: [string, ReactNode][] = []
  let stamp: string | null = null
  if (props.kind === 'quotation') {
    const q = props.doc
    meta = [['No.', q.number], ['Tarikh', formatDate(q.date)], ['Sah sehingga', formatDate(q.validUntil)]]
  } else if (props.kind === 'invoice') {
    const i = props.doc
    meta = [['No.', i.number], ['Tarikh', formatDate(i.date)], ['Tarikh akhir bayaran', formatDate(i.dueDate)]]
    if (i.quotationNumber) meta.push(['Rujukan', i.quotationNumber])
    if (i.status === 'Cancelled') stamp = 'BATAL'
    else if (i.status === 'Paid') stamp = 'LUNAS'
  } else {
    const r = props.doc
    meta = [['No.', r.number], ['Tarikh', formatDate(r.date)]]
    if (r.invoiceNumber) meta.push(['Invois', r.invoiceNumber])
    if (r.isVoided) stamp = 'BATAL'
  }

  return (
    <article className="doc-sheet relative mx-auto w-full max-w-[210mm] bg-white p-4 text-[13px] text-ink sm:p-10 print:max-w-none print:p-0">
      {stamp && <Stamp text={stamp} />}

      <header className="flex flex-col gap-5 border-b-[3px] pb-5 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: accent }}>
        <SellerBlock s={doc.seller} />
        <div className="shrink-0 sm:text-right">
          <div className="text-[26px] font-black leading-none tracking-[0.08em]" style={{ color: accent }}>
            {docTitles[kind]}
          </div>
          <Meta rows={meta} />
        </div>
      </header>

      {props.kind === 'receipt' ? (
        <ReceiptBody r={props.doc} accent={accent} />
      ) : (
        <>
          <section className="mt-6 flex flex-col gap-4 sm:flex-row sm:justify-between">
            <BuyerBlock label={props.kind === 'quotation' ? 'Sebut harga untuk' : 'Bil kepada'} b={doc.buyer} />
            {props.doc.subject && (
              <div className="sm:max-w-[45%] sm:text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Perkara</div>
                <div className="mt-1 text-[13px] font-semibold">{props.doc.subject}</div>
              </div>
            )}
          </section>

          <section className="mt-6 overflow-x-auto">
            <ItemsTable items={props.doc.items} accent={accent} />
          </section>

          <section className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="sm:max-w-[55%]">
              <Words amount={props.doc.total} />
            </div>
            <Totals
              d={props.doc}
              taxLabel={taxLabel}
              accent={accent}
              extra={
                props.kind === 'invoice' && props.doc.status !== 'Cancelled' && props.doc.amountPaid > 0 ? (
                  <>
                    <TotalRow label="Telah dibayar" value={-props.doc.amountPaid} />
                    <div className="flex justify-between gap-6 border-t-2 border-ink px-3 py-1.5 text-[13px] font-bold">
                      <span>Baki perlu dibayar</span>
                      <span className="tabular-nums">{formatRM(props.doc.balance)}</span>
                    </div>
                  </>
                ) : null
              }
            />
          </section>

          <section className="mt-8 grid gap-5 sm:grid-cols-2">
            {props.doc.notes && <TextSection title="Catatan">{props.doc.notes}</TextSection>}
            {props.doc.terms && <TextSection title="Terma & syarat">{props.doc.terms}</TextSection>}
            {props.kind === 'invoice' && doc.seller.paymentInfo && props.doc.status !== 'Paid' && props.doc.status !== 'Cancelled' && (
              <TextSection title="Cara bayaran">{doc.seller.paymentInfo}</TextSection>
            )}
          </section>

          {props.kind === 'quotation' && <Signatures left={`Disediakan oleh ${props.doc.seller.name}`} right="Disahkan oleh pelanggan (tandatangan & cop)" />}
          {props.kind === 'invoice' && props.doc.cancelReason && (
            <p className="mt-6 text-[12px] text-expense">Dibatalkan: {props.doc.cancelReason}</p>
          )}
        </>
      )}

      <footer className="mt-10 border-t border-line pt-3 text-center text-[11px] text-muted">
        {doc.seller.footer && <div className="mb-1 font-semibold text-ink">{doc.seller.footer}</div>}
        Dokumen ini dijana oleh komputer{kind === 'receipt' ? ' dan tidak memerlukan tandatangan' : ''}.
      </footer>
    </article>
  )
}

function ReceiptBody({ r, accent }: { r: Receipt; accent: string }) {
  const purpose = r.invoiceNumber ? `Bayaran bagi invois ${r.invoiceNumber}` : r.description || 'Bayaran'
  return (
    <>
      <section className="mt-6 grid gap-6 sm:grid-cols-[1fr,auto]">
        <div className="space-y-3">
          <BuyerBlock label="Diterima daripada" b={r.buyer} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Bagi</div>
            <div className="mt-1 text-[13px] text-ink">{purpose}</div>
            {r.invoiceNumber && r.description && <div className="text-[12px] text-muted">{r.description}</div>}
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[12px]">
            <div>
              <span className="text-muted">Kaedah: </span>
              <span className="font-semibold">{paymentMethodLabel(r.method)}</span>
            </div>
            {r.reference && (
              <div>
                <span className="text-muted">Rujukan: </span>
                <span className="font-semibold">{r.reference}</span>
              </div>
            )}
          </div>
        </div>
        <div className="self-start rounded-xl px-6 py-4 text-center" style={{ background: accent, color: textOn(accent) }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">Jumlah diterima</div>
          <div className="mt-1 text-[28px] font-black tabular-nums leading-none">{formatRM(r.amount)}</div>
        </div>
      </section>

      <Words amount={r.amount} />

      {r.items.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Butiran invois {r.invoiceNumber}</div>
          <ItemsTable items={r.items} accent={accent} />
          <div className="ml-auto mt-3 w-full max-w-[280px] text-[12.5px]">
            {r.invoiceTotal != null && <TotalRow label="Jumlah invois" value={r.invoiceTotal} />}
            <TotalRow label="Dibayar kali ini" value={r.amount} />
            {r.balanceAfter != null && (
              <div className="flex justify-between gap-6 border-t-2 border-ink px-3 py-1.5 font-bold">
                <span>Baki selepas bayaran</span>
                <span className="tabular-nums">{formatRM(r.balanceAfter)}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {r.isVoided && r.voidReason && <p className="mt-6 text-[12px] text-expense">Resit dibatalkan: {r.voidReason}</p>}
      <div className="mt-10 text-[11px] text-muted">Diterima oleh: {r.createdBy}</div>
    </>
  )
}

/** Resit kecil untuk pencetak thermal 80mm (kedai runcit). */
export function ThermalReceipt({ r }: { r: Receipt }) {
  const line = <div className="my-1.5 border-t border-dashed border-black" />
  return (
    <article className="mx-auto w-[72mm] bg-white p-1 font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <div className="text-[14px] font-bold">{r.seller.name}</div>
        {r.seller.registrationNo && <div>({r.seller.registrationNo})</div>}
        {r.seller.address && <div className="whitespace-pre-line">{r.seller.address}</div>}
        {r.seller.phone && <div>Tel: {r.seller.phone}</div>}
      </div>
      {line}
      <div className="text-center font-bold">RESIT RASMI{r.isVoided ? ' — BATAL' : ''}</div>
      <div className="flex justify-between"><span>No:</span><span>{r.number}</span></div>
      <div className="flex justify-between"><span>Tarikh:</span><span>{formatDate(r.date)}</span></div>
      {r.invoiceNumber && <div className="flex justify-between"><span>Invois:</span><span>{r.invoiceNumber}</span></div>}
      <div className="flex justify-between gap-2"><span>Daripada:</span><span className="text-right">{r.receivedFrom}</span></div>
      {line}
      {r.items.length > 0 ? (
        r.items.map((l, i) => (
          <div key={l.id || i} className="mb-1">
            <div>{l.description}</div>
            <div className="flex justify-between">
              <span>{formatQty(l.quantity)}{l.unit ? ` ${l.unit}` : ''} x {formatAmount(l.unitPrice)}</span>
              <span>{formatAmount(l.amount)}</span>
            </div>
          </div>
        ))
      ) : (
        <div>{r.description || 'Bayaran'}</div>
      )}
      {line}
      {r.invoiceTotal != null && <div className="flex justify-between"><span>Jumlah invois</span><span>{formatAmount(r.invoiceTotal)}</span></div>}
      <div className="flex justify-between text-[13px] font-bold"><span>DIBAYAR</span><span>RM {formatAmount(r.amount)}</span></div>
      {r.balanceAfter != null && r.balanceAfter > 0 && <div className="flex justify-between"><span>Baki</span><span>{formatAmount(r.balanceAfter)}</span></div>}
      <div className="flex justify-between"><span>Kaedah</span><span>{paymentMethodLabel(r.method)}</span></div>
      {r.reference && <div className="flex justify-between"><span>Rujukan</span><span>{r.reference}</span></div>}
      {line}
      <div className="text-center">{r.seller.footer || 'Terima kasih!'}</div>
      <div className="mt-1 text-center text-[10px]">Resit komputer — tiada tandatangan diperlukan</div>
    </article>
  )
}

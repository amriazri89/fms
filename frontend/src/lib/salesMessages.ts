import type { CreditLedger, Invoice, Quotation, Receipt } from '../api/types'
import { formatDate, formatQty, formatRM } from './format'

// Mesej WhatsApp ringkas. Dokumen penuh boleh dihantar sebagai PDF (Cetak → Simpan sebagai PDF).

const greet = (name: string) => `Assalamualaikum / Salam sejahtera ${name},`

const itemLines = (items: { description: string; quantity: number; unit: string | null; amount: number }[]) =>
  items.map((l) => `• ${l.description} — ${formatQty(l.quantity)}${l.unit ? ` ${l.unit}` : ''} = ${formatRM(l.amount)}`).join('\n')

export const quotationMessage = (q: Quotation) =>
  [
    greet(q.buyer.contactPerson || q.buyer.name),
    '',
    `Berikut sebut harga *${q.number}* daripada ${q.seller.name}${q.subject ? ` untuk ${q.subject}` : ''}:`,
    '',
    itemLines(q.items),
    '',
    `*Jumlah: ${formatRM(q.total)}*`,
    `Sah sehingga: ${formatDate(q.validUntil)}`,
    '',
    'Sila maklumkan jika bersetuju. Terima kasih.',
  ].join('\n')

export const invoiceMessage = (i: Invoice) =>
  [
    greet(i.buyer.contactPerson || i.buyer.name),
    '',
    `Invois *${i.number}* daripada ${i.seller.name} berjumlah *${formatRM(i.total)}*.`,
    i.amountPaid > 0 ? `Telah dibayar: ${formatRM(i.amountPaid)}. Baki: *${formatRM(i.balance)}*.` : '',
    `Tarikh akhir bayaran: ${formatDate(i.dueDate)}.`,
    i.seller.paymentInfo ? `\nBayaran boleh dibuat ke:\n${i.seller.paymentInfo}` : '',
    '',
    'Terima kasih.',
  ]
    .filter((l, idx, arr) => !(l === '' && arr[idx - 1] === ''))
    .join('\n')

export const receiptMessage = (r: Receipt) =>
  [
    greet(r.receivedFrom),
    '',
    `Terima kasih. Bayaran *${formatRM(r.amount)}* telah diterima pada ${formatDate(r.date)}.`,
    `No. resit: *${r.number}*${r.invoiceNumber ? ` (invois ${r.invoiceNumber})` : ''}.`,
    r.balanceAfter != null && r.balanceAfter > 0 ? `Baki invois: ${formatRM(r.balanceAfter)}.` : '',
    '',
    `— ${r.seller.name}`,
  ].join('\n')

/** Barang yang belum dibayar (FIFO — bayaran menutup hutang paling lama dahulu, sama seperti server). */
export function unpaidCreditItems(l: CreditLedger) {
  let covered = l.totalPaid
  const unpaid: { date: string; description: string; amount: number }[] = []
  for (const x of l.lines.filter((x) => x.kind === 'Taken' && !x.isVoided)) {
    if (covered >= x.amount) {
      covered -= x.amount
      continue
    }
    // Barang pertama yang belum lunas mungkin sudah dibayar sebahagian
    unpaid.push({ date: x.date, description: x.description, amount: x.amount - covered })
    covered = 0
  }
  return unpaid
}

const MAX_REMINDER_ITEMS = 10

/** Peringatan hutang 555 melalui WhatsApp. */
export const creditReminderMessage = (l: CreditLedger) => {
  const items = unpaidCreditItems(l)
  const shown = items.slice(-MAX_REMINDER_ITEMS)
  return [
    greet(l.contactPerson || l.customerName),
    '',
    `Peringatan mesra daripada ${l.businessUnitName}. Baki hutang buku 555: *${formatRM(l.balance)}*.`,
    '',
    items.length > shown.length ? `(${items.length - shown.length} rekod lebih lama tidak disenaraikan)` : '',
    shown.map((x) => `• ${formatDate(x.date)} — ${x.description} — ${formatRM(x.amount)}`).join('\n'),
    '',
    'Terima kasih.',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')
}

import type { PalmBatch, PalmOwnerShare } from '../api/types'
import { chargeMethodUnit, formatKg } from '../config/palm'
import { formatDate, formatRM } from './format'

/** Tiket seorang pemilik dalam satu bayaran kilang. */
export const ownerTickets = (b: PalmBatch, ownerId: number) => b.tickets.filter((t) => t.ownerId === ownerId)

/** Slip bayaran sawit untuk WhatsApp. */
export function palmSlipMessage(b: PalmBatch, share: PalmOwnerShare) {
  const lines = [
    `Assalamualaikum / Salam sejahtera ${share.ownerName},`,
    '',
    `Slip bayaran sawit — ${b.millName} (${formatDate(b.date)})`,
  ]
  for (const t of ownerTickets(b, share.ownerId)) {
    lines.push('')
    lines.push(`• Tiket ${t.ticketNo ?? '-'} · ${formatDate(t.date)}${t.weightKg > 0 ? ` · ${formatKg(t.weightKg)}` : ''}`)
    lines.push(`  Amaun kilang: ${formatRM(t.gross)}`)
    for (const c of t.charges) lines.push(`  Tolak ${c.name} (${c.rate} ${chargeMethodUnit(c.method)}): −${formatRM(c.amount)}`)
    lines.push(`  Bersih: ${formatRM(t.net)}`)
  }
  lines.push('')
  lines.push(`*Jumlah dibayar: ${formatRM(share.net)}*`)
  if (share.payout) lines.push(`Dibayar ${formatDate(share.payout.date)} · ${share.payout.number}`)
  lines.push('', 'Terima kasih.')
  return lines.join('\n')
}

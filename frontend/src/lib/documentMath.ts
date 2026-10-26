// Sama dengan backend Domain/SalesEntities.cs → DocumentMath. Hanya untuk paparan semasa menaip;
// jumlah sebenar sentiasa dikira semula oleh server.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const lineAmount = (qty: number, price: number) => round2(qty * price)

export function documentTotals(lines: { quantity: number; unitPrice: number }[], discount: number, taxRate: number) {
  const subtotal = round2(lines.reduce((s, l) => s + lineAmount(l.quantity || 0, l.unitPrice || 0), 0))
  const disc = round2(Math.min(Math.max(discount || 0, 0), subtotal))
  const taxable = subtotal - disc
  const tax = round2((taxable * (taxRate || 0)) / 100)
  return { subtotal, discount: disc, tax, total: round2(taxable + tax) }
}

/** Nombor dari input teks ("1,250.50" → 1250.5). */
export const parseNum = (s: string) => {
  const n = Number(String(s).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

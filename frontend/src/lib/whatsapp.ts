/** Tukar nombor telefon Malaysia kepada format antarabangsa untuk wa.me (0123456789 → 60123456789). */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('0')) d = `6${d}`
  else if (!d.startsWith('6')) d = `60${d}`
  return d.length >= 10 ? d : null
}

/** Pautan WhatsApp. Tanpa nombor, pengguna pilih kenalan sendiri. */
export function waLink(phone: string | null | undefined, message: string): string {
  const n = waNumber(phone)
  const text = encodeURIComponent(message)
  return n ? `https://wa.me/${n}?text=${text}` : `https://wa.me/?text=${text}`
}

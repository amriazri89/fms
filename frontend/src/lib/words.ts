// Jumlah dalam perkataan (Bahasa Melayu) untuk cetakan resit / invois.
// Contoh: 2580.50 → "Dua Ribu Lima Ratus Lapan Puluh Ringgit dan Lima Puluh Sen Sahaja"

const ones = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Lapan', 'Sembilan']

function below1000(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h === 1) parts.push('Seratus')
  else if (h > 1) parts.push(`${ones[h]} Ratus`)

  if (rest >= 20) {
    const t = Math.floor(rest / 10)
    parts.push(`${ones[t]} Puluh`)
    if (rest % 10) parts.push(ones[rest % 10])
  } else if (rest >= 11) {
    parts.push(rest === 11 ? 'Sebelas' : `${ones[rest - 10]} Belas`)
  } else if (rest === 10) {
    parts.push('Sepuluh')
  } else if (rest > 0) {
    parts.push(ones[rest])
  }
  return parts.join(' ')
}

const scales: [number, string, string][] = [
  [1_000_000_000, 'Bilion', 'Sebilion'],
  [1_000_000, 'Juta', 'Sejuta'],
  [1_000, 'Ribu', 'Seribu'],
]

export function numberToMalayWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'Kosong'
  const parts: string[] = []
  for (const [value, word, single] of scales) {
    const chunk = Math.floor(n / value)
    if (chunk) {
      parts.push(chunk === 1 ? single : `${numberToMalayWords(chunk)} ${word}`)
      n %= value
    }
  }
  if (n) parts.push(below1000(n))
  return parts.join(' ')
}

export function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100)
  const ringgit = Math.floor(cents / 100)
  const sen = cents % 100
  const r = `${numberToMalayWords(ringgit)} Ringgit`
  return sen ? `${r} dan ${numberToMalayWords(sen)} Sen Sahaja` : `${r} Sahaja`
}

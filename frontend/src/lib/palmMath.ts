import type { ChargeMethod } from '../api/types'

// Salinan formula backend Domain/PalmEntities.cs (PalmMath) — untuk pratonton dalam borang.
// Server mengira semula semasa simpan; jika ubah di sana, ubah di sini juga.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const palmGross = (weightKg: number, pricePerTonne: number) => round2((weightKg / 1000) * pricePerTonne)

export const palmCharge = (method: ChargeMethod, rate: number, weightKg: number, gross: number) => {
  switch (method) {
    case 'PerTonne':
      return round2((weightKg / 1000) * rate)
    case 'Fixed':
      return round2(rate)
    case 'Percent':
      return round2((gross * rate) / 100)
  }
}

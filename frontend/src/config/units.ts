import type { BusinessUnit, UnitKind } from '../api/types'

// Mesti sama dengan backend: Domain/Enums.cs (UnitKind)
export const unitKinds: { value: UnitKind; label: string }[] = [
  { value: 'Business', label: 'Perniagaan' },
  { value: 'Service', label: 'Servis' },
]

export const unitKindLabel = (k: UnitKind | undefined) => unitKinds.find((x) => x.value === k)?.label ?? 'Perniagaan'

/** Nama akaun ikut nama perniagaan / servis. Mesti sama dengan backend: Account.NameFor */
export const accountNameFor = (u: Pick<BusinessUnit, 'name'>) => `Akaun ${u.name}`

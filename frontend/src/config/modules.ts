import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { UserRole } from '../api/types'
import type { IconName } from '../components/Icon'

export type ModuleGroup = 'kewangan' | 'laporan' | 'jualan' | 'hutang' | 'pekerja' | 'sistem'

export const moduleGroups: { key: ModuleGroup; label: string }[] = [
  { key: 'kewangan', label: 'Kewangan' },
  { key: 'laporan', label: 'Laporan' },
  { key: 'jualan', label: 'Jualan & pelanggan' },
  { key: 'hutang', label: 'Pembekal, hutang & bil' },
  { key: 'pekerja', label: 'Pekerja & tuntutan' },
  { key: 'sistem', label: 'Sistem' },
]

export interface AppModule {
  key: string
  path: string
  label: string
  icon: IconName
  roles: UserRole[]
  component: LazyExoticComponent<ComponentType>
  group: ModuleGroup
  /** Laluan dalaman (butiran / borang) — tidak dipapar dalam menu */
  hidden?: boolean
  /** Dipapar tanpa menu & header (contoh: halaman cetak) */
  bare?: boolean
  /** Tunjuk dalam bar navigasi bawah (telefon) */
  mobileNav?: boolean
  /** Hanya untuk telefon (tidak dipapar di sidebar desktop) */
  mobileOnly?: boolean
  /** Laluan utama untuk peranan ini selepas log masuk */
  homeFor?: UserRole[]
}

const ALL: UserRole[] = ['Manager', 'Clerk']
const MANAGER: UserRole[] = ['Manager']
/** Dahulu untuk pemilik sahaja; kini Pengurus & Kerani (sistem 2 pengguna). */
const MANAGERS: UserRole[] = ALL

const named = <T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] })))

const salesLists = () => import('../pages/sales/DocumentListPage')
const salesForms = () => import('../pages/sales/DocumentFormPages')
const salesViews = () => import('../pages/sales/DocumentViewPages')

// Satu-satunya senarai modul. Navigasi, laluan dan kawalan akses dibina dari sini.
export const modules: AppModule[] = [
  // ---------- Kewangan
  { key: 'dashboard', path: '/', label: 'Ringkasan', icon: 'home', roles: MANAGERS, group: 'kewangan', component: lazy(() => import('../pages/DashboardPage')), mobileNav: true, homeFor: MANAGERS },
  { key: 'new', path: '/rekod-baru', label: 'Rekod baru', icon: 'plus', roles: ALL, group: 'kewangan', component: lazy(() => import('../pages/NewEntryPage')), mobileNav: true,  },
  { key: 'transactions', path: '/rekod', label: 'Senarai rekod', icon: 'list', roles: ALL, group: 'kewangan', component: lazy(() => import('../pages/TransactionsPage')), mobileNav: true },
  { key: 'pnl', path: '/penyata-untung-rugi', label: 'Penyata Untung Rugi', icon: 'statement', roles: ALL, group: 'laporan', component: lazy(() => import('../pages/statements/ProfitLossPage')) },
  { key: 'sales-report', path: '/laporan-jualan', label: 'Laporan Jualan', icon: 'chart', roles: ALL, group: 'laporan', component: lazy(() => import('../pages/statements/SalesReportPage')) },
  { key: 'reports', path: '/laporan', label: 'Analisis kewangan', icon: 'chart', roles: MANAGERS, group: 'laporan', component: lazy(() => import('../pages/ReportsPage')) },

  // ---------- Jualan & pelanggan
  { key: 'customers', path: '/pelanggan', label: 'Pelanggan', icon: 'users', roles: ALL, group: 'jualan', component: lazy(() => import('../pages/sales/CustomersPage')) },
  { key: 'customer', path: '/pelanggan/:id', label: 'Pelanggan', icon: 'users', roles: ALL, group: 'jualan', hidden: true, component: lazy(() => import('../pages/sales/CustomerDetailPage')) },

  { key: 'quotations', path: '/sebut-harga', label: 'Sebut harga', icon: 'quote', roles: ALL, group: 'jualan', component: named(salesLists, 'QuotationsPage') },
  { key: 'quotation-new', path: '/sebut-harga/baru', label: 'Sebut harga baru', icon: 'quote', roles: ALL, group: 'jualan', hidden: true, component: named(salesForms, 'QuotationFormPage') },
  { key: 'quotation-edit', path: '/sebut-harga/:id/ubah', label: 'Ubah sebut harga', icon: 'quote', roles: ALL, group: 'jualan', hidden: true, component: named(salesForms, 'QuotationFormPage') },
  { key: 'quotation', path: '/sebut-harga/:id', label: 'Sebut harga', icon: 'quote', roles: ALL, group: 'jualan', hidden: true, component: named(salesViews, 'QuotationViewPage') },

  { key: 'invoices', path: '/invois', label: 'Invois', icon: 'file', roles: ALL, group: 'jualan', component: named(salesLists, 'InvoicesPage'), mobileNav: true },
  { key: 'invoice-new', path: '/invois/baru', label: 'Invois baru', icon: 'file', roles: ALL, group: 'jualan', hidden: true, component: named(salesForms, 'InvoiceFormPage') },
  { key: 'invoice-edit', path: '/invois/:id/ubah', label: 'Ubah invois', icon: 'file', roles: ALL, group: 'jualan', hidden: true, component: named(salesForms, 'InvoiceFormPage') },
  { key: 'invoice', path: '/invois/:id', label: 'Invois', icon: 'file', roles: ALL, group: 'jualan', hidden: true, component: named(salesViews, 'InvoiceViewPage') },

  { key: 'receipts', path: '/resit', label: 'Resit', icon: 'receipt', roles: ALL, group: 'jualan', component: named(salesLists, 'ReceiptsPage') },
  { key: 'receipt-new', path: '/resit/baru', label: 'Terima bayaran', icon: 'receipt', roles: ALL, group: 'jualan', hidden: true, component: named(salesForms, 'ReceiptNewPage') },
  { key: 'receipt', path: '/resit/:id', label: 'Resit', icon: 'receipt', roles: ALL, group: 'jualan', hidden: true, component: named(salesViews, 'ReceiptViewPage') },

  { key: 'print', path: '/cetak/:kind/:id', label: 'Cetak', icon: 'printer', roles: ALL, group: 'jualan', hidden: true, bare: true, component: lazy(() => import('../pages/sales/PrintPage')) },

  // ---------- Pembekal & hutang kita (pemilik & admin sahaja)
  { key: 'payables', path: '/hutang', label: 'Hutang kita', icon: 'bill', roles: MANAGERS, group: 'hutang', component: lazy(() => import('../pages/payables/PayablesPage')) },
  { key: 'payable-new', path: '/hutang/baru', label: 'Rekod hutang', icon: 'bill', roles: MANAGERS, group: 'hutang', hidden: true, component: lazy(() => import('../pages/payables/PayableFormPage')) },
  { key: 'payable-edit', path: '/hutang/:id/ubah', label: 'Ubah hutang', icon: 'bill', roles: MANAGERS, group: 'hutang', hidden: true, component: lazy(() => import('../pages/payables/PayableFormPage')) },
  { key: 'payable', path: '/hutang/:id', label: 'Hutang', icon: 'bill', roles: MANAGERS, group: 'hutang', hidden: true, component: lazy(() => import('../pages/payables/PayableViewPage')) },
  { key: 'suppliers', path: '/pembekal', label: 'Pembekal', icon: 'truck', roles: MANAGERS, group: 'hutang', component: lazy(() => import('../pages/payables/SuppliersPage')) },
  { key: 'supplier', path: '/pembekal/:id', label: 'Pembekal', icon: 'truck', roles: MANAGERS, group: 'hutang', hidden: true, component: lazy(() => import('../pages/payables/SupplierDetailPage')) },
  { key: 'voucher', path: '/cetak-baucar/:id', label: 'Baucar bayaran', icon: 'printer', roles: MANAGERS, group: 'hutang', hidden: true, bare: true, component: lazy(() => import('../pages/payables/VoucherPrintPage')) },

  // ---------- Bil utiliti (Manage Utility Expenses)
  { key: 'utilities', path: '/bil-utiliti', label: 'Bil utiliti', icon: 'bolt', roles: ALL, group: 'hutang', component: lazy(() => import('../pages/staff/UtilitiesPage')) },

  // ---------- Pekerja & tuntutan (Manage Employee / Wages / Financial Claim)
  { key: 'employees', path: '/pekerja', label: 'Pekerja', icon: 'users', roles: ALL, group: 'pekerja', component: lazy(() => import('../pages/staff/EmployeesPage')) },
  { key: 'wages', path: '/gaji', label: 'Gaji pekerja', icon: 'wallet', roles: ALL, group: 'pekerja', component: lazy(() => import('../pages/staff/WagesPage')) },
  { key: 'payslip', path: '/cetak-slip/:id', label: 'Slip gaji', icon: 'printer', roles: ALL, group: 'pekerja', hidden: true, bare: true, component: lazy(() => import('../pages/staff/PayslipPage')) },
  { key: 'claims', path: '/tuntutan', label: 'Tuntutan kewangan', icon: 'claim', roles: ALL, group: 'pekerja', component: lazy(() => import('../pages/staff/ClaimsPage')) },

  // ---------- Sistem
  { key: 'settings', path: '/tetapan', label: 'Tetapan', icon: 'settings', roles: MANAGER, group: 'sistem', component: lazy(() => import('../pages/SettingsPage')) },
  { key: 'profile', path: '/akaun-saya', label: 'Akaun saya', icon: 'user', roles: ALL, group: 'sistem', component: lazy(() => import('../pages/ProfilePage')) },
  { key: 'menu', path: '/menu', label: 'Menu', icon: 'menu', roles: ALL, group: 'sistem', component: lazy(() => import('../pages/MenuPage')), mobileNav: true, mobileOnly: true },
]

export const modulesFor = (role: UserRole) => modules.filter((m) => m.roles.includes(role))
export const homePathFor = (role: UserRole) => modules.find((m) => m.homeFor?.includes(role))?.path ?? '/rekod'

// Jenis data yang sepadan dengan DTO backend (Fms.Api/Dtos/Dtos.cs)

export type UserRole = 'Manager' | 'Clerk'
export type AccountType = 'Cash' | 'Bank'
/** Label Tunai / Bank pada rekod duit (Domain/Enums.cs MoneyChannel) */
export type MoneyChannel = 'Cash' | 'Bank'
export type CategoryType = 'Income' | 'Expense'
export type TransactionType =
  | 'Income'
  | 'Expense'
  | 'Transfer'
  | 'OwnerWithdrawal'
  | 'OwnerCapital'
  | 'InternalLoan'
  | 'LoanIn'
  | 'LoanRepayment'

export interface User {
  id: number
  username: string
  fullName: string
  role: UserRole
  isActive: boolean
}

export interface LoginResponse {
  token: string
  expiresAt: string
  user: User
}

export interface BusinessUnit {
  id: number
  name: string
  description: string | null
  color: string | null
  sortOrder: number
  isActive: boolean
  // Maklumat dicetak pada dokumen jualan
  legalName: string | null
  registrationNo: string | null
  address: string | null
  phone: string | null
  email: string | null
  paymentInfo: string | null
  documentFooter: string | null
}

export interface Account {
  id: number
  name: string
  type: AccountType
  /** = openingCash + openingBank (dikira oleh server) */
  openingBalance: number
  openingCash: number
  openingBank: number
  businessUnitId: number | null
  sortOrder: number
  isActive: boolean
}

export interface Category {
  id: number
  name: string
  type: CategoryType
  businessUnitId: number | null
  sortOrder: number
  isActive: boolean
}

export interface FamilyMember {
  id: number
  name: string
  relationship: string | null
  isActive: boolean
}

export interface TransactionInput {
  date: string
  type: TransactionType
  amount: number
  businessUnitId: number | null
  toBusinessUnitId: number | null
  accountId: number
  toAccountId: number | null
  categoryId: number | null
  familyMemberId: number | null
  party: string | null
  reference: string | null
  description: string | null
  /** Tunai / Bank — wajib untuk Duit Masuk & Duit Keluar. Pindahan: bahagian asal */
  channel: MoneyChannel | null
  /** Pindahan sahaja: Tunai / Bank di destinasi (akaun sama dibenarkan, contoh Tunai → Bank) */
  toChannel: MoneyChannel | null
}

export interface Transaction extends TransactionInput {
  id: number
  businessUnitName: string | null
  toBusinessUnitName: string | null
  accountName: string
  toAccountName: string | null
  categoryName: string | null
  familyMemberName: string | null
  createdBy: string
  createdAt: string
  updatedAt: string | null
}

export interface PagedTransactions {
  items: Transaction[]
  total: number
  page: number
  pageSize: number
  totalIncome: number
  totalExpense: number
}

export interface TransactionFilter {
  from?: string
  to?: string
  type?: TransactionType
  businessUnitId?: number
  accountId?: number
  categoryId?: number
  channel?: MoneyChannel
  q?: string
  page?: number
  pageSize?: number
}

export interface Period {
  from: string
  to: string
}

export interface BusinessProfit {
  businessUnitId: number
  name: string
  color: string | null
  income: number
  expense: number
  profit: number
  withdrawals: number
}

export interface AccountBalance {
  id: number
  name: string
  type: AccountType
  /** = cash + bank + unlabelled */
  balance: number
  isLow: boolean
  cash: number
  bank: number
  /** Rekod lama tanpa label Tunai/Bank */
  unlabelled: number
  businessUnitId: number | null
}

export interface NamedAmount {
  name: string
  amount: number
}

export interface MonthlyPoint {
  month: string
  income: number
  expense: number
  profit: number
}

export interface InternalLoan {
  lenderId: number
  lender: string
  borrowerId: number
  borrower: string
  outstanding: number
}

export interface Dashboard {
  period: Period
  totals: {
    income: number
    expense: number
    profit: number
    withdrawals: number
    capital: number
    totalMoney: number
    totalCash: number
    totalBank: number
    totalUnlabelled: number
  }
  businesses: BusinessProfit[]
  accounts: AccountBalance[]
  expenseByCategory: NamedAmount[]
  trend: MonthlyPoint[]
  internalLoans: InternalLoan[]
  withdrawalsByMember: NamedAmount[]
  recent: Transaction[]
  receivables: Receivables
  payables: PayablesSummary
}

export interface CashflowReport {
  period: Period
  scope: string
  openingBalance: number
  moneyIn: { type: TransactionType; amount: number }[]
  moneyOut: { type: TransactionType; amount: number }[]
  totalIn: number
  totalOut: number
  netCashflow: number
  closingBalance: number
}

export interface ProfitReport {
  period: Period
  rows: BusinessProfit[]
  totalIncome: number
  totalExpense: number
  totalProfit: number
}

export interface CategoryReport {
  period: Period
  type: CategoryType
  rows: NamedAmount[]
  total: number
}

export interface MonthlyReport {
  year: number
  months: MonthlyPoint[]
  totalIncome: number
  totalExpense: number
  totalProfit: number
}

export interface AuditLog {
  id: number
  timestamp: string
  username: string
  action: string
  entity: string
  entityId: string
  oldValue: string | null
  newValue: string | null
}

// =====================================================================
// Jualan & pelanggan (sepadan dengan Dtos/SalesDtos.cs)
// =====================================================================

export type CustomerActivityType = 'Note' | 'Call' | 'WhatsApp' | 'Visit' | 'Email' | 'Meeting'
export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Converted'
export type InvoiceStatus = 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'Cancelled'
export type PaymentMethod = 'Cash' | 'BankTransfer' | 'DuitNow' | 'Cheque' | 'Card' | 'Other'

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  sumTotal: number
  sumOutstanding: number
}

export interface SalesFilter {
  q?: string
  customerId?: number
  businessUnitId?: number
  status?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface DocumentSettings {
  taxLabel: string
  defaultTaxRate: number
  quotationValidDays: number
  paymentTermDays: number
  defaultQuotationTerms: string | null
  defaultInvoiceTerms: string | null
  receiptPrefix: string
  payablePrefix: string
  paymentVoucherPrefix: string
  payslipPrefix: string
  utilityBillPrefix: string
  claimPrefix: string
  companyName: string
}

export interface Seller {
  businessUnitId: number
  name: string
  registrationNo: string | null
  address: string | null
  phone: string | null
  email: string | null
  paymentInfo: string | null
  footer: string | null
  color: string | null
}

export interface Buyer {
  customerId: number | null
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  registrationNo: string | null
}

export interface CustomerInput {
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  registrationNo: string | null
  tag: string | null
  notes: string | null
  isActive: boolean
}

export interface Customer extends CustomerInput {
  id: number
  createdAt: string
}

export interface CustomerListItem {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  tag: string | null
  isActive: boolean
  totalInvoiced: number
  totalPaid: number
  outstanding: number
  overdueInvoices: number
  openQuotations: number
  lastActivity: string | null
  /** Baki buku hutang kedai (555), semua perniagaan */
  creditBalance: number
}

export interface CustomerActivityInput {
  date: string
  type: CustomerActivityType
  note: string
  followUpDate: string | null
}

export interface CustomerActivity extends CustomerActivityInput {
  id: number
  customerId: number
  customerName: string
  followUpDone: boolean
  createdBy: string
  createdAt: string
}

export interface CustomerDetail {
  customer: Customer
  totalInvoiced: number
  totalPaid: number
  outstanding: number
  activities: CustomerActivity[]
  quotations: QuotationListItem[]
  invoices: InvoiceListItem[]
  payments: PaymentListItem[]
}

export interface DocumentLineInput {
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
}

export interface DocumentLine extends DocumentLineInput {
  id: number
  sortOrder: number
  amount: number
}

interface DocumentInputBase {
  businessUnitId: number
  customerId: number
  date: string
  subject: string | null
  notes: string | null
  terms: string | null
  discountAmount: number
  taxRate: number
  items: DocumentLineInput[]
}

export interface QuotationInput extends DocumentInputBase {
  validUntil: string
}

export interface PayNowInput {
  accountId: number
  categoryId: number
  method: PaymentMethod
  reference: string | null
}

export interface InvoiceInput extends DocumentInputBase {
  dueDate: string
  payNow: PayNowInput | null
}

interface DocumentBase {
  id: number
  number: string
  date: string
  businessUnitId: number
  customerId: number
  subject: string | null
  notes: string | null
  terms: string | null
  subtotal: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  items: DocumentLine[]
  seller: Seller
  buyer: Buyer
  createdBy: string
  createdAt: string
  updatedAt: string | null
}

export interface Quotation extends DocumentBase {
  validUntil: string
  status: QuotationStatus
  isExpired: boolean
  invoiceId: number | null
  invoiceNumber: string | null
}

export interface Invoice extends DocumentBase {
  dueDate: string
  status: InvoiceStatus
  isOverdue: boolean
  amountPaid: number
  balance: number
  quotationId: number | null
  quotationNumber: string | null
  cancelReason: string | null
  payments: PaymentListItem[]
}

export interface QuotationListItem {
  id: number
  number: string
  date: string
  validUntil: string
  customerId: number
  customerName: string
  businessUnitId: number
  businessUnitName: string
  subject: string | null
  total: number
  status: QuotationStatus
  isExpired: boolean
  invoiceId: number | null
}

export interface InvoiceListItem {
  id: number
  number: string
  date: string
  dueDate: string
  customerId: number
  customerName: string
  businessUnitId: number
  businessUnitName: string
  subject: string | null
  total: number
  amountPaid: number
  balance: number
  status: InvoiceStatus
  isOverdue: boolean
  quotationId: number | null
}

export interface PaymentInput {
  date: string
  businessUnitId: number
  customerId: number | null
  receivedFrom: string | null
  invoiceId: number | null
  accountId: number
  categoryId: number
  method: PaymentMethod
  amount: number
  reference: string | null
  description: string | null
}

export interface PaymentListItem {
  id: number
  number: string
  date: string
  amount: number
  method: PaymentMethod
  customerId: number | null
  receivedFrom: string
  invoiceId: number | null
  invoiceNumber: string | null
  businessUnitName: string
  accountName: string
  isVoided: boolean
}

export interface Receipt {
  id: number
  number: string
  date: string
  amount: number
  method: PaymentMethod
  businessUnitId: number
  customerId: number | null
  receivedFrom: string
  invoiceId: number | null
  invoiceNumber: string | null
  invoiceTotal: number | null
  balanceAfter: number | null
  accountId: number
  accountName: string
  categoryId: number
  categoryName: string
  reference: string | null
  description: string | null
  isVoided: boolean
  voidReason: string | null
  voidedAt: string | null
  transactionId: number | null
  items: DocumentLine[]
  seller: Seller
  buyer: Buyer
  createdBy: string
  createdAt: string
}

export interface Receivables {
  total: number
  overdue: number
  invoiceCount: number
  topCustomers: { customerId: number; name: string; outstanding: number; overdueCount: number }[]
  /** Buku hutang kedai (555) */
  creditBookTotal: number
  creditBookCustomers: number
}

// ---------- Buku hutang kedai / 555 (Dtos/CreditBookDtos.cs) ----------
export interface CreditBookFilter {
  q?: string
  businessUnitId?: number
  customerId?: number
  includeSettled?: boolean
}

export interface CreditBookRow {
  customerId: number
  customerName: string
  phone: string | null
  businessUnitId: number
  businessUnitName: string
  totalTaken: number
  totalPaid: number
  balance: number
  lastTakenDate: string | null
  lastPaidDate: string | null
  /** Barang tertua yang belum dibayar (FIFO) */
  oldestUnpaidDate: string | null
}

export interface CreditBookSummary {
  totalBalance: number
  customersOwing: number
  rows: CreditBookRow[]
}

/** Taken = ambil barang (hutang bertambah), Paid = bayaran / resit (hutang berkurang) */
export type CreditLineKind = 'Taken' | 'Paid'

export interface CreditLedgerLine {
  kind: CreditLineKind
  id: number
  date: string
  description: string
  amount: number
  /** Baki selepas baris ini; null jika dibatalkan */
  balance: number | null
  isVoided: boolean
  voidReason: string | null
  receiptNumber: string | null
  method: PaymentMethod | null
  createdBy: string
  createdAt: string
}

export interface CreditLedger {
  customerId: number
  customerName: string
  phone: string | null
  contactPerson: string | null
  businessUnitId: number
  businessUnitName: string
  totalTaken: number
  totalPaid: number
  balance: number
  oldestUnpaidDate: string | null
  /** Ikut tarikh, lama ke baru */
  lines: CreditLedgerLine[]
}

export interface CreditSaleInput {
  customerId: number
  businessUnitId: number
  date: string
  description: string
  amount: number
}

export interface CreditPaymentInput {
  customerId: number
  businessUnitId: number
  date: string
  accountId: number
  categoryId: number
  method: PaymentMethod
  amount: number
  reference: string | null
}

// ---------- Pembekal & hutang kita (Dtos/PayableDtos.cs) ----------
export type PayableKind = 'Bill' | 'Loan'
export type PayableStatus = 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'Cancelled'

export interface SupplierInput {
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  tag: string | null
  notes: string | null
  isActive: boolean
}

export interface Supplier extends SupplierInput {
  id: number
  createdAt: string
}

export interface SupplierListItem {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  tag: string | null
  isActive: boolean
  outstanding: number
  openCount: number
  overdueCount: number
  nextDueDate: string | null
}

export interface SupplierDetail {
  supplier: Supplier
  totalAmount: number
  totalPaid: number
  outstanding: number
  payables: PayableListItem[]
  payments: PayablePayment[]
}

export interface PayableFilter {
  q?: string
  supplierId?: number
  businessUnitId?: number
  kind?: PayableKind
  status?: string
  page?: number
  pageSize?: number
}

export interface PayableInput {
  kind: PayableKind
  supplierId: number
  businessUnitId: number
  categoryId: number | null
  date: string
  dueDate: string
  description: string
  supplierReference: string | null
  amount: number
  installmentAmount: number | null
  notes: string | null
  receivedAccountId: number | null
  receivedChannel: MoneyChannel | null
}

export interface PayableListItem {
  id: number
  number: string
  kind: PayableKind
  date: string
  dueDate: string
  supplierId: number
  supplierName: string
  businessUnitId: number
  businessUnitName: string
  description: string
  supplierReference: string | null
  amount: number
  amountPaid: number
  balance: number
  status: PayableStatus
  isOverdue: boolean
  daysToDue: number
}

export interface Payable extends PayableListItem {
  supplierPhone: string | null
  categoryId: number | null
  categoryName: string | null
  installmentAmount: number | null
  interestPaid: number
  notes: string | null
  cancelReason: string | null
  receivedTransactionId: number | null
  receivedAccountId: number | null
  receivedAccountName: string | null
  receivedChannel: MoneyChannel | null
  payments: PayablePayment[]
  createdBy: string
  createdAt: string
  updatedAt: string | null
}

export interface PayablePaymentInput {
  date: string
  amount: number
  interestAmount: number
  interestCategoryId: number | null
  accountId: number
  method: PaymentMethod
  reference: string | null
  notes: string | null
}

export interface PayablePayment {
  id: number
  number: string
  payableId: number
  payableNumber: string
  supplierName: string
  date: string
  amount: number
  interestAmount: number
  accountName: string
  method: PaymentMethod
  reference: string | null
  notes: string | null
  isVoided: boolean
  voidReason: string | null
  createdBy: string
  createdAt: string
}

export interface PaymentVoucher {
  payment: PayablePayment
  kind: PayableKind
  payableDescription: string
  supplierReference: string | null
  supplierPhone: string | null
  supplierAddress: string | null
  payableAmount: number
  balanceAfter: number
  seller: Seller
}

export interface PayablesSummary {
  total: number
  overdue: number
  count: number
  dueNext30Days: number
  upcoming: PayableListItem[]
}

// ---------- Modul FMS: pekerja, gaji, bil utiliti, tuntutan (Dtos/StaffDtos.cs) ----------
export type EmploymentType = 'Monthly' | 'Daily'
export type UtilityType = 'Electricity' | 'Water' | 'Internet' | 'Phone' | 'Rent' | 'Gas' | 'Other'
export type UtilityBillStatus = 'Unpaid' | 'Paid'
export type ClaimStatus = 'Pending' | 'Approved' | 'Rejected' | 'Paid'

export interface ListResult<T> {
  items: T[]
  count: number
  total: number
}

export interface EmployeeInput {
  name: string
  icNo: string | null
  phone: string | null
  position: string | null
  businessUnitId: number | null
  employmentType: EmploymentType
  basicRate: number
  joinDate: string | null
  bankName: string | null
  bankAccountNo: string | null
  notes: string | null
  isActive: boolean
}
export interface Employee extends EmployeeInput {
  id: number
  businessUnitName: string | null
  lastPaidPeriod: string | null
  paidThisYear: number
}

export interface WageInput {
  employeeId: number
  periodMonth: string
  daysWorked: number | null
  basicPay: number
  allowance: number
  overtime: number
  deduction: number
  payDate: string
  businessUnitId: number
  accountId: number
  categoryId: number
  method: PaymentMethod
  notes: string | null
}
export interface Wage {
  id: number
  number: string
  employeeId: number
  employeeName: string
  position: string | null
  icNo: string | null
  bankName: string | null
  bankAccountNo: string | null
  employmentType: EmploymentType
  periodMonth: string
  daysWorked: number | null
  basicPay: number
  allowance: number
  overtime: number
  deduction: number
  netPay: number
  payDate: string
  businessUnitId: number
  businessUnitName: string
  accountName: string
  categoryName: string
  method: PaymentMethod
  notes: string | null
  isVoided: boolean
  voidReason: string | null
  createdBy: string
  createdAt: string
  seller: Seller
}

export interface UtilityPayInput {
  paidDate: string
  accountId: number
  method: PaymentMethod
  reference: string | null
}
export interface UtilityInput {
  type: UtilityType
  provider: string | null
  accountNo: string | null
  businessUnitId: number
  categoryId: number
  billDate: string
  dueDate: string
  periodMonth: string
  amount: number
  notes: string | null
  payNow: UtilityPayInput | null
}
export interface UtilityBill {
  id: number
  number: string
  type: UtilityType
  provider: string | null
  accountNo: string | null
  businessUnitId: number
  businessUnitName: string
  categoryId: number
  categoryName: string
  billDate: string
  dueDate: string
  periodMonth: string
  amount: number
  status: UtilityBillStatus
  isOverdue: boolean
  paidDate: string | null
  paidAccountId: number | null
  paidAccountName: string | null
  method: PaymentMethod | null
  reference: string | null
  notes: string | null
  createdBy: string
  createdAt: string
}

export interface ClaimInput {
  employeeId: number | null
  claimDate: string
  businessUnitId: number
  categoryId: number
  description: string
  amount: number
}
export interface Claim {
  id: number
  number: string
  requestedById: number
  requestedBy: string
  employeeId: number | null
  claimantName: string
  claimDate: string
  businessUnitId: number
  businessUnitName: string
  categoryId: number
  categoryName: string
  description: string
  amount: number
  hasReceipt: boolean
  receiptOriginalName: string | null
  status: ClaimStatus
  reviewedBy: string | null
  reviewedAt: string | null
  reviewRemark: string | null
  paidDate: string | null
  paidAccountName: string | null
  method: PaymentMethod | null
  createdAt: string
}

export interface StatementLine {
  name: string
  amount: number
}
export interface StatementSection {
  title: string
  lines: StatementLine[]
  total: number
}
export interface StatementMonth {
  month: string
  label: string
  revenue: number
  expenses: number
  net: number
}
export interface ProfitLossStatement {
  from: string
  to: string
  businessUnitId: number | null
  scope: string
  revenue: StatementSection
  expenses: StatementSection
  netProfit: number
  netMarginPercent: number | null
  byBusiness: { businessUnitId: number; name: string; revenue: number; expenses: number; net: number }[]
  monthly: StatementMonth[]
  notCounted: StatementSection
  companyName: string
  generatedAt: string
}

export interface SalesReportRow {
  key: string
  label: string
  count: number
  total: number
}
export interface SalesReport {
  from: string
  to: string
  businessUnitId: number | null
  scope: string
  groupBy: 'day' | 'month'
  count: number
  total: number
  averagePerDay: number
  rows: SalesReportRow[]
  byCategory: SalesReportRow[]
  byBusiness: SalesReportRow[]
  byAccount: SalesReportRow[]
  invoicedInPeriod: number
  outstandingInvoices: number
  companyName: string
}

export interface StaffSummary {
  pendingClaims: number
  pendingClaimsTotal: number
  approvedUnpaidClaims: number
  approvedUnpaidTotal: number
  unpaidUtilities: number
  unpaidUtilitiesTotal: number
  overdueUtilities: number
  activeEmployees: number
  employeesNotPaidThisMonth: number
  recentPendingClaims: Claim[]
}

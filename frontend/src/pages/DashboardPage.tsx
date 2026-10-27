import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBusinessUnits, useDashboard } from '../api/hooks'
import { useStaffSummary } from '../api/staffHooks'
import { useAuth } from '../auth/AuthContext'
import { HorizontalBars, IncomeExpenseChart } from '../components/charts'
import { Icon } from '../components/Icon'
import { PeriodFilter, usePeriod } from '../components/PeriodFilter'
import { TransactionRow } from '../components/TransactionRow'
import { Card, Empty, ErrorBox, Money, Select, Spinner, cx } from '../components/ui'
import { chartColors } from '../config/chartColors'
import { formatDate, formatRM } from '../lib/format'

function Stat({ label, value, tone, sub }: { label: string; value: number; tone?: 'income' | 'expense' | 'profit'; sub?: string }) {
  const color = tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : tone === 'profit' ? (value < 0 ? 'text-expense' : 'text-gold-600') : 'text-ink'
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('mt-1 text-xl font-extrabold tabular-nums sm:text-2xl', color)}>{formatRM(value)}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [period, setPeriod] = usePeriod('month')
  const [businessUnitId, setBusinessUnitId] = useState<number | undefined>()
  const { data: units = [] } = useBusinessUnits()
  const { data: staff } = useStaffSummary()
  const { data, isLoading, error, isFetching } = useDashboard({ from: period.from, to: period.to, businessUnitId })

  const lowAccounts = data?.accounts.filter((a) => a.isLow) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Assalamualaikum, {user?.fullName}</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Ringkasan Kewangan</h1>
          {data && (
            <p className="mt-0.5 text-sm text-muted">
              {formatDate(data.period.from)} – {formatDate(data.period.to)}
              {isFetching && ' · mengemas kini…'}
            </p>
          )}
        </div>
        <Link to="/rekod-baru" className="hidden min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-flex">
          <Icon name="plus" /> Rekod baru
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <PeriodFilter value={period} onChange={setPeriod} />
        <Select value={businessUnitId ?? ''} onChange={(e) => setBusinessUnitId(e.target.value ? Number(e.target.value) : undefined)} className="lg:w-56">
          <option value="">Semua perniagaan</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </div>

      {error && <ErrorBox error={error} />}
      {isLoading && <Spinner />}

      {data && (
        <>
          {lowAccounts.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-gold-500/30 bg-gold-50 p-4 text-sm text-ink">
              <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <div>
                <b>Baki rendah:</b>{' '}
                {lowAccounts.map((a) => `${a.name} (${formatRM(a.balance)})`).join(', ')}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Jumlah duit ada" value={data.totals.totalMoney} sub="Semua akaun, hari ini" />
            <Stat label="Duit masuk" value={data.totals.income} tone="income" />
            <Stat label="Duit keluar" value={data.totals.expense} tone="expense" />
            <Stat label="Untung" value={data.totals.profit} tone="profit" sub={data.totals.withdrawals ? `Ambilan keluarga ${formatRM(data.totals.withdrawals)}` : undefined} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Untung ikut perniagaan" className="lg:col-span-2">
              {data.businesses.length === 0 ? (
                <Empty>Tiada rekod untuk tempoh ini.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 font-semibold">Perniagaan</th>
                        <th className="hidden py-2 text-right font-semibold sm:table-cell">Masuk</th>
                        <th className="hidden py-2 text-right font-semibold sm:table-cell">Keluar</th>
                        <th className="py-2 text-right font-semibold">Untung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.businesses.map((b) => (
                        <tr key={b.businessUnitId} className="border-b border-line/60 last:border-0">
                          <td className="py-2.5 font-semibold text-ink">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? '#999' }} />
                            {b.name}
                          </td>
                          <td className="hidden py-2.5 text-right sm:table-cell"><Money value={b.income} /></td>
                          <td className="hidden py-2.5 text-right sm:table-cell"><Money value={b.expense} /></td>
                          <td className="py-2.5 text-right font-bold"><Money value={b.profit} tone="auto" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Baki akaun">
              <ul className="divide-y divide-line/60">
                {data.accounts.map((a) => (
                  <li key={a.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-ink">
                        <Icon name="wallet" className="h-4 w-4 text-muted" />
                        {a.name}
                        {a.isLow && <Icon name="alert" className="h-4 w-4 text-gold-600" />}
                      </span>
                      <Money value={a.balance} className="font-semibold" />
                    </div>
                    <ChannelSplit cash={a.cash} bank={a.bank} unlabelled={a.unlabelled} />
                  </li>
                ))}
                <li className="pt-3 text-sm font-bold">
                  <div className="flex items-center justify-between">
                    <span>Jumlah</span>
                    <Money value={data.totals.totalMoney} />
                  </div>
                  <ChannelSplit cash={data.totals.totalCash} bank={data.totals.totalBank} unlabelled={data.totals.totalUnlabelled} />
                </li>
              </ul>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Trend 6 bulan" className="lg:col-span-2">
              <IncomeExpenseChart data={data.trend} />
            </Card>
            <Card title="Duit keluar untuk apa?">
              {data.expenseByCategory.length ? <HorizontalBars data={data.expenseByCategory} color={chartColors.expense} /> : <Empty>Tiada belanja.</Empty>}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card
              title="Rekod terkini"
              className="lg:col-span-2"
              action={<Link to="/rekod" className="text-sm font-semibold text-brand-600 hover:underline">Lihat semua</Link>}
            >
              {data.recent.length ? (
                <div className="-mx-2">
                  {data.recent.map((t) => (
                    <TransactionRow key={t.id} t={t} onClick={() => navigate(`/rekod?edit=${t.id}`)} />
                  ))}
                </div>
              ) : (
                <Empty>Belum ada rekod.</Empty>
              )}
            </Card>

            <div className="space-y-5">
              <Card
                title="Orang hutang kita"
                action={<Link to="/invois" className="text-sm font-semibold text-brand-600 hover:underline">Invois</Link>}
              >
                {data.receivables.invoiceCount === 0 && data.receivables.creditBookCustomers === 0 ? (
                  <Empty>Tiada invois atau buku hutang belum dibayar.</Empty>
                ) : (
                  <>
                    {data.receivables.invoiceCount > 0 && (
                    <>
                    <div className="mb-3 flex items-baseline justify-between">
                      <Money value={data.receivables.total} className="text-xl font-extrabold text-ink" />
                      {data.receivables.overdue > 0 && (
                        <span className="text-xs font-semibold text-expense">{formatRM(data.receivables.overdue)} tertunggak</span>
                      )}
                    </div>
                    <ul className="space-y-2 text-sm">
                      {data.receivables.topCustomers.map((c) => (
                        <li key={c.customerId}>
                          <Link to={`/pelanggan/${c.customerId}`} className="flex justify-between gap-2 hover:underline">
                            <span className="truncate">
                              {c.name}
                              {c.overdueCount > 0 && <span className="ml-1 text-xs text-expense">• tertunggak</span>}
                            </span>
                            <Money value={c.outstanding} className="shrink-0 font-semibold" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    </>
                    )}
                    {data.receivables.creditBookCustomers > 0 && (
                      <Link
                        to="/buku-hutang"
                        className={cx('flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100', data.receivables.invoiceCount > 0 && 'mt-3')}
                      >
                        <span>
                          <span className="block font-semibold text-ink">Buku hutang (555)</span>
                          <span className="block text-xs text-muted">{data.receivables.creditBookCustomers} pelanggan</span>
                        </span>
                        <Money value={data.receivables.creditBookTotal} className="shrink-0 font-bold text-expense" />
                      </Link>
                    )}
                  </>
                )}
              </Card>
              <Card
                title="Kita hutang orang"
                action={<Link to="/hutang" className="text-sm font-semibold text-brand-600 hover:underline">Hutang kita</Link>}
              >
                {data.payables.count === 0 ? (
                  <Empty>Tiada bil atau pinjaman belum lunas.</Empty>
                ) : (
                  <>
                    <div className="mb-1 flex items-baseline justify-between">
                      <Money value={data.payables.total} className="text-xl font-extrabold text-ink" />
                      {data.payables.overdue > 0 && (
                        <span className="text-xs font-semibold text-expense">{formatRM(data.payables.overdue)} lewat bayar</span>
                      )}
                    </div>
                    <p className="mb-3 text-xs text-muted">Perlu dibayar dalam 30 hari: <b className="text-ink">{formatRM(data.payables.dueNext30Days)}</b></p>
                    <ul className="space-y-2 text-sm">
                      {data.payables.upcoming.map((p) => (
                        <li key={p.id}>
                          <Link to={`/hutang/${p.id}`} className="flex justify-between gap-2 hover:underline">
                            <span className="min-w-0">
                              <span className="block truncate">{p.supplierName}</span>
                              <span className={cx('block text-xs', p.isOverdue ? 'font-semibold text-expense' : p.daysToDue <= 7 ? 'text-gold-600' : 'text-muted')}>
                                {p.isOverdue ? `Lewat ${-p.daysToDue} hari` : p.daysToDue === 0 ? 'Akhir hari ini' : `Akhir ${formatDate(p.dueDate)}`}
                              </span>
                            </span>
                            <Money value={p.balance} className="shrink-0 font-semibold" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
              {staff && (
                <Card title="Pekerja, bil & tuntutan" action={<Link to="/tuntutan" className="text-sm font-semibold text-brand-600 hover:underline">Tuntutan</Link>}>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Link to="/tuntutan" className="rounded-xl bg-gold-50 p-2.5 hover:opacity-90">
                      <div className="text-xs text-muted">Menunggu kelulusan</div>
                      <div className="font-bold">{staff.pendingClaims} · {formatRM(staff.pendingClaimsTotal)}</div>
                    </Link>
                    <Link to="/tuntutan" className="rounded-xl bg-gray-50 p-2.5 hover:opacity-90">
                      <div className="text-xs text-muted">Lulus, belum dibayar</div>
                      <div className="font-bold">{staff.approvedUnpaidClaims} · {formatRM(staff.approvedUnpaidTotal)}</div>
                    </Link>
                    <Link to="/bil-utiliti" className="rounded-xl bg-gray-50 p-2.5 hover:opacity-90">
                      <div className="text-xs text-muted">Bil utiliti belum bayar</div>
                      <div className={cx('font-bold', staff.overdueUtilities > 0 && 'text-expense')}>{staff.unpaidUtilities} · {formatRM(staff.unpaidUtilitiesTotal)}</div>
                    </Link>
                    <Link to="/gaji" className="rounded-xl bg-gray-50 p-2.5 hover:opacity-90">
                      <div className="text-xs text-muted">Gaji bulan ini belum dibayar</div>
                      <div className="font-bold">{staff.employeesNotPaidThisMonth} / {staff.activeEmployees} pekerja</div>
                    </Link>
                  </div>
                  {staff.recentPendingClaims.length > 0 && (
                    <ul className="mt-3 space-y-2 text-sm">
                      {staff.recentPendingClaims.map((c) => (
                        <li key={c.id} className="flex justify-between gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{c.description}</span>
                            <span className="text-xs text-muted">{c.claimantName} · {formatDate(c.claimDate)}</span>
                          </span>
                          <Money value={c.amount} className="shrink-0 font-semibold" />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              <Card title="Ambilan keluarga">
                {data.withdrawalsByMember.length ? (
                  <ul className="space-y-2 text-sm">
                    {data.withdrawalsByMember.map((w) => (
                      <li key={w.name} className="flex justify-between"><span>{w.name}</span><Money value={w.amount} className="font-semibold" /></li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Tiada ambilan.</Empty>
                )}
              </Card>
              <Card title="Pinjaman antara perniagaan">
                {data.internalLoans.length ? (
                  <ul className="space-y-2 text-sm">
                    {data.internalLoans.map((l) => (
                      <li key={`${l.lenderId}-${l.borrowerId}`} className="flex justify-between gap-2">
                        <span><b>{l.borrower}</b> hutang <b>{l.lender}</b></span>
                        <Money value={l.outstanding} className="font-semibold" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Tiada pinjaman tertunggak.</Empty>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Pecahan Tunai / Bank di bawah baki akaun. Baki tanpa label (rekod lama) dipapar jika ada. */
function ChannelSplit({ cash, bank, unlabelled }: { cash: number; bank: number; unlabelled: number }) {
  return (
    <div className="mt-0.5 flex flex-wrap justify-end gap-x-3 pl-6 text-xs font-normal text-muted">
      <span>Tunai <Money value={cash} className="font-semibold text-ink" /></span>
      <span>Bank <Money value={bank} className="font-semibold text-ink" /></span>
      {Math.abs(unlabelled) >= 0.005 && <span title="Rekod lama tanpa label Tunai/Bank">Belum dilabel <Money value={unlabelled} className="font-semibold text-ink" /></span>}
    </div>
  )
}

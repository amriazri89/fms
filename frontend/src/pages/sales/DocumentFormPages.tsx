import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useInvoice, useQuotation } from '../../api/salesHooks'
import { Icon } from '../../components/Icon'
import { DocumentEditor } from '../../components/sales/DocumentEditor'
import { PaymentForm } from '../../components/sales/PaymentForm'
import { Card, ErrorBox, Spinner } from '../../components/ui'

function Header({ back, title, subtitle }: { back: string; title: string; subtitle?: string }) {
  return (
    <div className="space-y-2">
      <Link to={back} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="back" className="h-4 w-4" /> Kembali
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  )
}

const customerFromQuery = (params: URLSearchParams) => Number(params.get('pelanggan')) || undefined

export function QuotationFormPage() {
  const id = Number(useParams().id) || undefined
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuotation(id)

  if (id && isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (data?.status === 'Converted') return <ErrorBox error={new Error('Sebut harga ini sudah ditukar ke invois dan tidak boleh diubah.')} />

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Header back={id ? `/sebut-harga/${id}` : '/sebut-harga'} title={id ? `Ubah ${data?.number ?? ''}` : 'Sebut harga baru'} />
      <DocumentEditor
        key={data?.id ?? 'new'}
        kind="quotation"
        existing={data}
        defaultCustomerId={customerFromQuery(params)}
        onSaved={(newId) => navigate(`/sebut-harga/${newId}`, { replace: true })}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}

export function InvoiceFormPage() {
  const id = Number(useParams().id) || undefined
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data, isLoading, error } = useInvoice(id)

  if (id && isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (data && (data.status === 'Cancelled' || data.payments.some((p) => !p.isVoided)))
    return <ErrorBox error={new Error('Invois ini sudah ada bayaran atau telah dibatalkan, jadi tidak boleh diubah.')} />

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Header back={id ? `/invois/${id}` : '/invois'} title={id ? `Ubah ${data?.number ?? ''}` : 'Invois baru'} />
      <DocumentEditor
        key={data?.id ?? 'new'}
        kind="invoice"
        existing={data}
        defaultCustomerId={customerFromQuery(params)}
        onSaved={(newId) => navigate(`/invois/${newId}`, { replace: true })}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}

/** /resit/baru?invois=12 atau ?pelanggan=3 */
export function ReceiptNewPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const invoiceId = Number(params.get('invois')) || undefined
  const { data: invoice, isLoading, error } = useInvoice(invoiceId)

  if (invoiceId && isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Header
        back={invoiceId ? `/invois/${invoiceId}` : '/resit'}
        title="Terima bayaran"
        subtitle="Resit dijana dan duit masuk direkod secara automatik."
      />
      <Card>
        <PaymentForm
          invoice={invoice}
          defaultCustomerId={customerFromQuery(params)}
          onSaved={(r) => navigate(`/resit/${r.id}`, { replace: true })}
          onCancel={() => navigate(-1)}
        />
      </Card>
    </div>
  )
}

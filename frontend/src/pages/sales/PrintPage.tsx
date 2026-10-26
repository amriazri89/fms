import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDocumentSettings, useInvoice, useQuotation, useReceipt } from '../../api/salesHooks'
import { Icon } from '../../components/Icon'
import { PrintableDocument, ThermalReceipt } from '../../components/sales/PrintableDocument'
import { Button, ErrorBox, Spinner, cx } from '../../components/ui'

const kinds = { 'sebut-harga': 'quotation', invois: 'invoice', resit: 'receipt' } as const
type Slug = keyof typeof kinds

/** Halaman cetak tanpa menu. Cetak → "Simpan sebagai PDF" untuk dapatkan fail PDF. */
export default function PrintPage() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const slug = params.kind as Slug
  const kind = kinds[slug]
  const id = Number(params.id) || undefined
  const thermal = kind === 'receipt' && search.get('format') === 'thermal'

  const { data: settings } = useDocumentSettings()
  const quotation = useQuotation(kind === 'quotation' ? id : undefined)
  const invoice = useInvoice(kind === 'invoice' ? id : undefined)
  const receipt = useReceipt(kind === 'receipt' ? id : undefined)
  const active = kind === 'quotation' ? quotation : kind === 'invoice' ? invoice : receipt
  const number = active.data?.number
  const sheetRef = useRef<HTMLDivElement>(null)
  const [thermalHeightMm, setThermalHeightMm] = useState(200)

  // Resit thermal: panjang kertas ikut panjang resit (pelayar tidak sokong "auto")
  useEffect(() => {
    if (!thermal || !active.data || !sheetRef.current) return
    const px = sheetRef.current.getBoundingClientRect().height
    setThermalHeightMm(Math.ceil((px * 25.4) / 96) + 6)
  }, [thermal, active.data])

  // Saiz kertas & nama fail PDF (tajuk halaman = no. dokumen)
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = thermal ? `@page { size: 80mm ${thermalHeightMm}mm; margin: 2mm 4mm; }` : '@page { size: A4; margin: 12mm; }'
    document.head.appendChild(style)
    const oldTitle = document.title
    if (number) document.title = number
    return () => {
      style.remove()
      document.title = oldTitle
    }
  }, [thermal, number, thermalHeightMm])

  if (!kind) return <ErrorBox error={new Error('Jenis dokumen tidak dikenali.')} />

  const backTo = `/${slug}/${id}`
  const taxLabel = settings?.taxLabel ?? 'SST'

  return (
    <div className={cx('min-h-screen py-4 print:bg-white print:py-0', thermal ? 'bg-gray-200' : 'bg-gray-100')}>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4 print:hidden">
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          <Icon name="back" className="h-4 w-4" /> Kembali
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          {kind === 'receipt' && (
            <Button
              variant="secondary"
              onClick={() => setSearch(thermal ? {} : { format: 'thermal' }, { replace: true })}
            >
              {thermal ? 'Format A4' : 'Resit kecil 80mm'}
            </Button>
          )}
          <Button onClick={() => window.print()} disabled={!active.data}>
            <Icon name="printer" className="h-4 w-4" /> Cetak / Simpan PDF
          </Button>
        </div>
        <p className="w-full text-xs text-muted">
          Untuk PDF: tekan Cetak, kemudian pilih destinasi “Simpan sebagai PDF”. {thermal && 'Untuk pencetak resit, tetapkan saiz kertas 80mm.'}
        </p>
      </div>

      {active.isLoading && <Spinner />}
      {active.error && <div className="mx-auto max-w-xl px-4"><ErrorBox error={active.error} /></div>}

      <div ref={sheetRef} className={cx('mx-auto print:shadow-none', thermal ? 'w-fit bg-white p-2 shadow print:p-0' : 'max-w-[210mm] shadow-lg print:max-w-none')}>
        {kind === 'quotation' && quotation.data && <PrintableDocument kind="quotation" doc={quotation.data} taxLabel={taxLabel} />}
        {kind === 'invoice' && invoice.data && <PrintableDocument kind="invoice" doc={invoice.data} taxLabel={taxLabel} />}
        {kind === 'receipt' && receipt.data && (thermal ? <ThermalReceipt r={receipt.data} /> : <PrintableDocument kind="receipt" doc={receipt.data} taxLabel={taxLabel} />)}
      </div>

      {!active.data && !active.isLoading && !active.error && (
        <div className="text-center print:hidden">
          <Button variant="secondary" onClick={() => navigate(-1)}>Kembali</Button>
        </div>
      )}
    </div>
  )
}

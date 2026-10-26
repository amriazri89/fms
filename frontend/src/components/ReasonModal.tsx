import { useState } from 'react'
import { Button, ErrorBox, Field, Modal, Textarea } from './ui'

/** Minta sebab sebelum batal (invois, resit, hutang, bayaran). */
export function ReasonModal({ open, title, confirmLabel, onClose, onConfirm, busy }: {
  open: boolean; title: string; confirmLabel: string; onClose: () => void; onConfirm: (reason: string) => Promise<void>; busy: boolean
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Sebab" required>
          <Textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        {!!error && <ErrorBox error={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setError(null)
              try {
                await onConfirm(reason.trim())
                setReason('')
                onClose()
              } catch (e) {
                setError(e)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

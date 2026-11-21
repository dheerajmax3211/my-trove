import { Field, Input, useToast } from '@platform/ui'
import { useState } from 'react'
import { useIdempotentMutation } from '../../../api/hooks'
import type { EntryView } from '../../../api/types'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { MoneyText } from '../../../components/MoneyText'
import { useHousehold } from '../../household/hooks/useHousehold'

/**
 * Confirms a reversal and explains what it does. Mounted only while open, so every opening is a new intent with its
 * own Idempotency-Key; confirming twice (double click, retry) is the same request and posts one reversal.
 */
export function ReverseDialog({ entry, onClose }: { entry: EntryView; onClose: () => void }) {
  const h = useHousehold()
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const { mutation, submit } = useIdempotentMutation<EntryView, { reason: string | null }>({
    run: (api, vars, key) => api.reverse(h.household.id, entry.id, vars.reason, key),
    householdId: h.household.id,
    onSuccess: () => {
      toast({
        title: 'Reversal recorded',
        description: 'A mirrored entry was added. The original is unchanged.',
        variant: 'success',
      })
      onClose()
    },
  })

  return (
    <ConfirmDialog
      title="Reverse this entry?"
      description="Entries are never edited or deleted. A reversal adds a new entry that mirrors this one."
      confirmLabel="Reverse entry"
      variant="danger"
      loading={mutation.isPending}
      onCancel={onClose}
      onConfirm={() => submit({ reason: reason.trim() === '' ? null : reason.trim() })}
    >
      <div className="ft-form">
        <p>
          <strong>{entry.description}</strong>
        </p>
        <table className="ft-table" aria-label="What will be mirrored">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col" className="ft-num">
                Now
              </th>
              <th scope="col" className="ft-num">
                Mirrored entry
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.postings.map((p, i) => (
              <tr key={`${p.accountId}-${i}`}>
                <td>{h.accountName(p.accountId)}</td>
                <td className="ft-num">
                  <MoneyText minor={p.amountMinor} currency={p.currency} signed />
                </td>
                <td className="ft-num">
                  <MoneyText minor={-p.amountMinor} currency={p.currency} signed />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ft-muted">
          Both entries stay in the history, and each account ends up where it was before. If an
          account has since been spent down, the reversal can be refused for lack of funds.
        </p>
        <Field label="Reason (optional)" description="Shown in the new entry's description.">
          <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {mutation.error ? <ErrorNotice error={mutation.error} currency={h.currency} /> : null}
      </div>
    </ConfirmDialog>
  )
}

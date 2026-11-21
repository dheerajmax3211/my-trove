import { Button, Dialog } from '@platform/ui'
import { useState } from 'react'
import { readStored, writeStored } from '../../../lib/storage'
import { useViewerUid } from '../../../viewer'

export const introKey = (uid: string) => `ft:intro-seen:${uid}`

/** Said once per person: this is a ledger of money the family already has, not a way to move money. */
export function FirstUseNotice() {
  const uid = useViewerUid() ?? ''
  const [open, setOpen] = useState(() => uid !== '' && readStored(introKey(uid)) === null)
  const dismiss = () => {
    writeStored(introKey(uid), 'yes')
    setOpen(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss()
      }}
      title="Before you start: this is bookkeeping, not a bank"
      description="Family Treasury keeps a trustworthy record of money your family already holds."
      dismissible={false}
      footer={<Button onClick={dismiss}>I understand</Button>}
    >
      <ul className="ft-list">
        <li>
          It does <strong>not</strong> move real money. There is no bank, card or payment
          connection.
        </li>
        <li>
          &ldquo;Spend&rdquo; means &ldquo;record that we spent&rdquo;, and a deposit records money
          you already put somewhere.
        </li>
        <li>
          Entries are never edited or deleted. A mistake is fixed by a reversal that mirrors it, so
          the history stays honest.
        </li>
      </ul>
    </Dialog>
  )
}

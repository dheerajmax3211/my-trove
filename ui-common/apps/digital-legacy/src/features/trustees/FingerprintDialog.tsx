import { Button, Checkbox, Dialog, DialogClose } from '@platform/ui'
import type { TrusteeView } from '../../api/types'
import { Callout } from '../../components/Callout'
import { Fingerprint } from '../../components/Fingerprint'

/** Shows the full fingerprint and records that the owner compared it with the trustee. */
export function FingerprintDialog({
  trustee,
  verified,
  onVerified,
  open,
  onOpenChange,
}: {
  trustee: TrusteeView
  verified: boolean
  onVerified: (value: boolean) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Compare ${trustee.label}'s key fingerprint`}
      description="Do this by phone, in person or over a channel you already trust, not in the same message thread as the invite."
      size="lg"
      footer={
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      }
    >
      <div className="stack-3">
        <Fingerprint
          value={trustee.keyFingerprint ?? ''}
          label={`${trustee.label} key fingerprint`}
        />
        <Callout tone="info" title="Why this matters">
          <p>
            Your shares are locked to the public key the server hands you. A compromised server
            could hand you its own key instead of {trustee.label}&apos;s, and then read the share.
            If this fingerprint matches what {trustee.label} sees on their screen, you are sealing
            to their key and nobody else&apos;s. The server cannot fake this match.
          </p>
        </Callout>
        <Checkbox
          checked={verified}
          onCheckedChange={(c) => onVerified(c === true)}
          label={`${trustee.label} read me the same fingerprint, and it matches`}
        />
      </div>
    </Dialog>
  )
}

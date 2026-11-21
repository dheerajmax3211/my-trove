import { useApiMutation } from '@platform/api-client'
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogClose,
  useToast,
  type BadgeVariant,
} from '@platform/ui'
import { useState } from 'react'
import { ownerPaths } from '../../api/paths'
import type { TrusteeView } from '../../api/types'
import { ErrorNotice } from '../../components/ErrorNotice'
import { shortFingerprint } from '../../crypto'
import { formatDateTime } from '../../lib/format'
import { OWNER_KEYS } from '../queries'
import { FingerprintDialog } from './FingerprintDialog'

const STATUS: Record<TrusteeView['status'], { label: string; variant: BadgeVariant }> = {
  INVITED: { label: 'Invited, no key yet', variant: 'neutral' },
  ACCEPTED: { label: 'Key registered', variant: 'info' },
  SHARE_UPLOADED: { label: 'Holds a share', variant: 'accent' },
  CONFIRMED: { label: 'Confirmed their share', variant: 'success' },
  REVOKED: { label: 'Revoked', variant: 'danger' },
}

export function TrusteeCard({
  trustee,
  verified,
  onVerified,
}: {
  trustee: TrusteeView
  verified: boolean
  onVerified: (value: boolean) => void
}) {
  const { toast } = useToast()
  const [compareOpen, setCompareOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const revoke = useApiMutation<void>({
    method: 'DELETE',
    path: ownerPaths.trustee(trustee.id),
    invalidate: OWNER_KEYS,
    onSuccess: () => {
      setRevokeOpen(false)
      toast({
        title: `${trustee.label} revoked`,
        description: 'Their access token no longer works.',
        variant: 'success',
      })
    },
  })
  const status = STATUS[trustee.status]
  const hasKey = trustee.keyFingerprint !== null

  return (
    <li className="entry-card" aria-label={trustee.label}>
      <div className="row-wrap">
        <Avatar name={trustee.label} size="sm" decorative />
        <strong>{trustee.label}</strong>
        <Badge variant={status.variant} dot>
          {status.label}
        </Badge>
        {hasKey ? (
          <Badge variant={verified ? 'success' : 'warning'}>
            {verified ? 'Fingerprint verified' : 'Fingerprint not verified'}
          </Badge>
        ) : null}
        {trustee.shareUploaded ? (
          <Badge variant={trustee.shareCurrent ? 'success' : 'warning'}>
            {trustee.shareCurrent ? 'Share is current' : 'Share is outdated'}
          </Badge>
        ) : null}
      </div>
      <div className="small muted">
        {trustee.status === 'INVITED'
          ? `Invite expires ${formatDateTime(trustee.inviteExpiresAt)}.`
          : trustee.status === 'REVOKED'
            ? 'No longer a trustee.'
            : `Registered ${formatDateTime(trustee.acceptedAt)} with a ${trustee.keyAlgorithm ?? ''} key.`}
      </div>
      {hasKey && trustee.status !== 'REVOKED' ? (
        <div className="row-wrap">
          <span className="mono" aria-label={`Short fingerprint of ${trustee.label}`}>
            {shortFingerprint(trustee.keyFingerprint ?? '')}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setCompareOpen(true)}>
            Compare fingerprint
          </Button>
        </div>
      ) : null}
      {trustee.status !== 'REVOKED' ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setRevokeOpen(true)}>
            Revoke
          </Button>
        </div>
      ) : null}
      {hasKey ? (
        <FingerprintDialog
          trustee={trustee}
          verified={verified}
          onVerified={onVerified}
          open={compareOpen}
          onOpenChange={setCompareOpen}
        />
      ) : null}
      <Dialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={`Revoke ${trustee.label}?`}
        description="They lose access to the portal and their share stops counting toward the quorum. This cannot be undone; invite them again to restore access."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Keep trustee</Button>
            </DialogClose>
            <Button variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate()}>
              Revoke {trustee.label}
            </Button>
          </>
        }
      >
        {revoke.error ? <ErrorNotice error={revoke.error} title="Could not revoke" /> : null}
      </Dialog>
    </li>
  )
}

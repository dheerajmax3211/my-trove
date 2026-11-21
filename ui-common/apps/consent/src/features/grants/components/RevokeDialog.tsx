import { useToast } from '@platform/ui'
import type { Grant } from '../../../shared/api/types'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { useRevokeGrant } from '../hooks/useGrants'

export interface RevokeDialogProps {
  grant: Grant | null
  onOpenChange: (open: boolean) => void
}

export function RevokeDialog({ grant, onOpenChange }: RevokeDialogProps) {
  const { toast } = useToast()
  const revoke = useRevokeGrant()

  const handleOpenChange = (open: boolean) => {
    if (!open) revoke.reset()
    onOpenChange(open)
  }

  const confirm = () => {
    if (!grant) return
    revoke.mutate(grant.id, {
      onSuccess: () => {
        toast({
          title: 'Access revoked',
          description: `${grant.clientName} can no longer read your data.`,
          variant: 'success',
        })
        handleOpenChange(false)
      },
    })
  }

  return (
    <ConfirmDialog
      open={grant !== null}
      onOpenChange={handleOpenChange}
      title={grant ? `Revoke access for ${grant.clientName}?` : 'Revoke access'}
      description={
        grant
          ? `${grant.clientName} loses access to ${grant.scopes.join(', ')} immediately, even if it holds a token that has not expired. It would have to ask again.`
          : ''
      }
      confirmLabel="Revoke access"
      destructive
      pending={revoke.isPending}
      error={revoke.error}
      onConfirm={confirm}
    />
  )
}

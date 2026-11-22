import { isApiError, useApiClient, useApiQuery, type ApiError } from '@platform/api-client'
import { Badge, Button, Callout } from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Confirm } from '../../developer/Confirm'
import { paths, type ConnectedGrant } from '../../developer/contract'
import { when } from '../../developer/format'
import styles from '../../developer/Developer.module.css'

/**
 * Apps other developers built that you have let read your data. You can see what each one may read and disconnect it;
 * disconnecting revokes the grant at once, and the app must ask you again to get access back.
 */
export function ConnectedApps() {
  const session = useWorkspaceSession()
  const canManage = session.can('connections:manage')
  const grants = useApiQuery<ConnectedGrant[]>(paths.grants, { enabled: canManage })
  const client = useApiClient()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<ConnectedGrant | null>(null)
  const disconnect = useMutation<ConnectedGrant, ApiError, ConnectedGrant>({
    mutationFn: (grant) => client.post<ConnectedGrant>(paths.revokeGrant(grant.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [paths.grants] }),
  })

  if (!canManage) {
    return (
      <Callout variant="note" title="Not part of your role">
        Your role does not include connections:manage, so connected apps are not shown here.
      </Callout>
    )
  }
  if (grants.isPending) return <p className={styles.muted}>Loading connected apps.</p>
  if (grants.isError) {
    return (
      <Callout variant="danger" title="We could not load connected apps">
        {isApiError(grants.error) ? grants.error.title : 'Check your connection and try again.'}
      </Callout>
    )
  }

  const list = grants.data

  return (
    <>
      {list.length === 0 ? (
        <p className={styles.muted}>Nothing is connected to your account.</p>
      ) : (
        <ul aria-label="Apps with access to your data" className={styles.list}>
          {list.map((grant) => (
            <li key={grant.id} className={styles.listItem}>
              <div className={styles.stack}>
                <strong>{grant.clientName}</strong>
                {grant.purpose ? <span className={styles.muted}>{grant.purpose}</span> : null}
                <span className={styles.muted}>
                  Can read:{' '}
                  {grant.scopes.map((scope) => (
                    <code key={scope}>{scope} </code>
                  ))}
                </span>
                <span className={styles.muted}>Until {when(grant.expiresAt)}</span>
              </div>
              <div className={styles.stack}>
                <Badge variant={grant.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {grant.status === 'ACTIVE' ? 'Active' : grant.status.toLowerCase()}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => setPending(grant)}>
                  Disconnect {grant.clientName}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Confirm
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null)
            disconnect.reset()
          }
        }}
        title={`Disconnect ${pending?.clientName ?? 'this app'}?`}
        description="It loses access to your data straight away. This cannot be undone, but the app can ask you again."
        confirmLabel="Disconnect"
        danger
        busy={disconnect.isPending}
        error={disconnect.isError ? (disconnect.error.detail ?? disconnect.error.title) : undefined}
        onConfirm={() => {
          if (!pending) return
          disconnect.mutate(pending, { onSuccess: () => setPending(null) })
        }}
      />
    </>
  )
}

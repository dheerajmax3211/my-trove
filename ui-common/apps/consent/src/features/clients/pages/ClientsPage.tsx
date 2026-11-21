import { Button, EmptyState, InboxIcon, PageHeader, PlusIcon, useToast } from '@platform/ui'
import { useState } from 'react'
import type { Client, ClientWithSecret } from '../../../shared/api/types'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingBlock } from '../../../shared/components/LoadingBlock'
import { useGrants } from '../../grants/hooks/useGrants'
import { ClientCard } from '../components/ClientCard'
import { RegisterClientDialog } from '../components/RegisterClientDialog'
import { SecretDialog, type SecretDialogProps } from '../components/SecretDialog'
import { useClients, useDisableClient, useRotateSecret } from '../hooks/useClients'

export function ClientsPage() {
  const { toast } = useToast()
  const clients = useClients()
  const activeGrants = useGrants(false)
  const rotate = useRotateSecret()
  const disable = useDisableClient()
  const [registering, setRegistering] = useState(false)
  const [rotating, setRotating] = useState<Client | null>(null)
  const [disabling, setDisabling] = useState<Client | null>(null)
  const [reveal, setReveal] = useState<SecretDialogProps['reveal']>(null)

  const show = (result: ClientWithSecret, kind: 'registered' | 'rotated') =>
    setReveal({ result, kind })

  const confirmRotate = () => {
    if (!rotating) return
    rotate.mutate(rotating.clientId, {
      onSuccess: (result) => {
        show(result, 'rotated')
        rotate.reset() // the page state now holds the only copy of the secret
        setRotating(null)
      },
    })
  }

  const confirmDisable = () => {
    if (!disabling) return
    disable.mutate(disabling.clientId, {
      onSuccess: () => {
        toast({
          title: 'App disabled',
          description: `${disabling.name} has no access any more.`,
          variant: 'success',
        })
        setDisabling(null)
      },
    })
  }

  const grantCount = (client: Client | null) =>
    client ? (activeGrants.data ?? []).filter((g) => g.clientId === client.clientId).length : 0
  const disablingGrants = grantCount(disabling)

  let content
  if (clients.isPending) content = <LoadingBlock label="Loading apps" />
  else if (clients.isError)
    content = <ErrorState error={clients.error} onRetry={() => void clients.refetch()} />
  else if (clients.data.length === 0)
    content = (
      <EmptyState
        icon={<InboxIcon size={24} />}
        title="No apps registered"
        description="Register an app to let it ask for access to parts of your vault."
        action={<Button onClick={() => setRegistering(true)}>Register your first app</Button>}
      />
    )
  else
    content = (
      <ul className="card-list" aria-label="Registered apps">
        {clients.data.map((client) => (
          <li key={client.clientId}>
            <ClientCard client={client} onRotate={setRotating} onDisable={setDisabling} />
          </li>
        ))}
      </ul>
    )

  return (
    <>
      <PageHeader
        title="Apps"
        description="The apps you have registered. Each one needs your approval before it can read anything."
        actions={
          <Button leftIcon={<PlusIcon size={18} />} onClick={() => setRegistering(true)}>
            Register app
          </Button>
        }
      />
      {content}
      <RegisterClientDialog
        open={registering}
        onOpenChange={setRegistering}
        onRegistered={(result) => show(result, 'registered')}
      />
      <SecretDialog reveal={reveal} onClose={() => setReveal(null)} />
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRotating(null)
            rotate.reset()
          }
        }}
        title={rotating ? `Rotate the secret for ${rotating.name}?` : 'Rotate secret'}
        description="The current secret stops working immediately. You will see the new one once, and must give it to the app."
        confirmLabel="Rotate secret"
        pending={rotate.isPending}
        error={rotate.error}
        onConfirm={confirmRotate}
      />
      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDisabling(null)
            disable.reset()
          }
        }}
        title={disabling ? `Disable ${disabling.name}?` : 'Disable app'}
        description={
          disabling
            ? `${disabling.name} loses all access now: ${disablingGrants} active ${disablingGrants === 1 ? 'grant is' : 'grants are'} revoked and its tokens stop working. A disabled app cannot be turned back on; you would register it again.`
            : ''
        }
        confirmLabel="Disable app"
        destructive
        pending={disable.isPending}
        error={disable.error}
        onConfirm={confirmDisable}
      />
    </>
  )
}

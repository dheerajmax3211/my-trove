import { isApiError } from '@platform/api-client'
import { Button, EmptyState, PageHeader, PlusIcon } from '@platform/ui'
import { useState } from 'react'
import { ModuleLink } from '@platform/workspace-kit'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { useStateQuery, useTrusteesQuery, useVaultQuery } from '../queries'
import { InviteDialog } from './InviteDialog'
import { QuorumCard } from './QuorumCard'
import { SealSharesCard } from './SealSharesCard'
import { TrusteeCard } from './TrusteeCard'
import { useVerifiedFingerprints } from './verifiedFingerprints'

export function TrusteesPage() {
  const vault = useVaultQuery()
  const state = useStateQuery()
  const trustees = useTrusteesQuery()
  const verified = useVerifiedFingerprints()
  const [inviteOpen, setInviteOpen] = useState(false)

  if (vault.isPending || state.isPending || trustees.isPending)
    return <PageSkeleton label="Loading your trustees" />
  if (vault.error || state.error || trustees.error) {
    const error = vault.error ?? state.error ?? trustees.error
    if (isApiError(error) && error.status === 404)
      return (
        <EmptyState
          title="Create your vault first"
          description="Trustees hold pieces of your vault's key, so there has to be a vault."
          action={
            <Button asChild>
              <ModuleLink to="/vault">Create your vault</ModuleLink>
            </Button>
          }
        />
      )
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          void vault.refetch()
          void state.refetch()
          void trustees.refetch()
        }}
      />
    )
  }

  const active = trustees.data.filter((t) => t.status !== 'REVOKED')
  return (
    <div className="page-stack">
      <PageHeader
        title="Trustees"
        description="The people who, together, can open your vault if you stop checking in."
        actions={
          <Button leftIcon={<PlusIcon size={16} />} onClick={() => setInviteOpen(true)}>
            Invite a trustee
          </Button>
        }
      />
      <Callout tone="info" title="Why you compare fingerprints">
        <p>
          When a trustee registers, their browser makes a key pair and the server hands you the
          public half. A compromised server could swap in its own. Each key has a short fingerprint;
          read it out to the trustee over the phone. If it matches what they see, the key is theirs.
          You cannot seal shares until each fingerprint is marked as verified.
        </p>
      </Callout>
      {trustees.data.length === 0 ? (
        <EmptyState
          title="No trustees yet"
          description="Invite the people you would trust with this. Two or three is typical."
          action={<Button onClick={() => setInviteOpen(true)}>Invite a trustee</Button>}
        />
      ) : (
        <ul
          className="stack-3"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
          aria-label="Trustees"
        >
          {trustees.data.map((t) => (
            <TrusteeCard
              key={t.id}
              trustee={t}
              verified={verified.isVerified(t.keyFingerprint)}
              onVerified={(value) => t.keyFingerprint && verified.mark(t.keyFingerprint, value)}
            />
          ))}
        </ul>
      )}
      <div className="grid-2">
        <QuorumCard state={state.data} trusteeCount={active.length} />
        <SealSharesCard
          vault={vault.data}
          state={state.data}
          trustees={trustees.data}
          isVerified={verified.isVerified}
        />
      </div>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}

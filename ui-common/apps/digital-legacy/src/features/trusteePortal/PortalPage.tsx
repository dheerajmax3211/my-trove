import { apiQueryKey, isApiError, useApiMutation, useApiQuery } from '@platform/api-client'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  PageHeader,
  useToast,
} from '@platform/ui'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { trusteePaths } from '../../api/paths'
import type { Decision, TrusteeStateView, VoteResponse } from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { Fingerprint } from '../../components/Fingerprint'
import { PageSkeleton } from '../../components/PageSkeleton'
import { useTrusteeSession } from './TrusteeSession'
import { UnsealCard } from './UnsealCard'

const ME_KEY = apiQueryKey(trusteePaths.me)

function VoteCard({ me }: { me: TrusteeStateView }) {
  const { toast } = useToast()
  const [pending, setPending] = useState<Decision | null>(null)
  const vote = useApiMutation<VoteResponse, { decision: Decision }>({
    path: trusteePaths.approval,
    invalidate: [ME_KEY],
    onSuccess: (res) => {
      setPending(null)
      toast({
        title: res.decision === 'APPROVE' ? 'You approved' : 'You declined',
        description: 'You can change your answer until the vault is released.',
        variant: 'success',
      })
    },
  })
  return (
    <Card aria-labelledby="vote-title">
      <CardHeader>
        <CardTitle as="h2" id="vote-title">
          Should the vault be released?
        </CardTitle>
        <CardDescription>
          The owner has missed their check-ins and every reminder. {me.approvalsRequired} trustees
          must approve. Even then, release waits for a cool-off period during which the owner can
          still check in and cancel it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="stack-3">
          <Callout tone="warning" title="Approve only if you believe the owner cannot respond">
            <p>
              Try to reach them first. Approving does not hand anything over by itself; it counts
              toward the quorum. Declining keeps the vault sealed. You can change your mind until it
              is released.
            </p>
          </Callout>
          {me.myDecision ? (
            <p role="status" style={{ margin: 0 }}>
              Your current answer:{' '}
              <strong>{me.myDecision === 'APPROVE' ? 'approve' : 'decline'}</strong>.
            </p>
          ) : null}
          {!me.shareUploaded ? (
            <Callout tone="danger" title="You cannot vote">
              <p>The owner has not sealed a share for you, so you are not part of the quorum.</p>
            </Callout>
          ) : null}
          {vote.error ? (
            <ErrorNotice error={vote.error} title="Your vote was not recorded" />
          ) : null}
          <div className="row-wrap">
            <Button disabled={!me.shareUploaded} onClick={() => setPending('APPROVE')}>
              Approve release
            </Button>
            <Button
              variant="secondary"
              disabled={!me.shareUploaded}
              loading={vote.isPending && pending === 'DECLINE'}
              onClick={() => vote.mutate({ decision: 'DECLINE' })}
            >
              Decline
            </Button>
          </div>
        </div>
        <Dialog
          open={pending === 'APPROVE'}
          onOpenChange={(open) => !open && setPending(null)}
          title="Approve release of this vault?"
          description="You are telling the system you believe the owner can no longer check in."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Not yet</Button>
              </DialogClose>
              <Button loading={vote.isPending} onClick={() => vote.mutate({ decision: 'APPROVE' })}>
                Yes, approve
              </Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Release still needs {me.approvalsRequired} approvals and the full cool-off. A check-in
            from the owner cancels it at any point before then.
          </p>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function ConfirmCard({ me }: { me: TrusteeStateView }) {
  const { toast } = useToast()
  const confirm = useApiMutation<TrusteeStateView, { shareDigest: string }>({
    path: trusteePaths.confirm,
    invalidate: [ME_KEY],
    onSuccess: () =>
      toast({
        title: 'Receipt confirmed',
        description: 'The owner can see you hold a share.',
        variant: 'success',
      }),
  })
  const confirmed = me.status === 'CONFIRMED'
  return (
    <Card aria-labelledby="share-title">
      <CardHeader>
        <CardTitle as="h2" id="share-title">
          Your share
        </CardTitle>
        <CardDescription>
          The owner locks a piece of their vault key to your public key. Confirming receipt tells
          them it arrived. It does not prove your key file works, so keep it safe and test it if
          they ask.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="stack-3">
          {me.shareUploaded ? (
            <p style={{ margin: 0 }}>
              A sealed share is waiting for you (key version {me.shareVaultVersion}).{' '}
              {confirmed ? (
                <Badge variant="success">Receipt confirmed</Badge>
              ) : (
                <Badge variant="warning">Not confirmed yet</Badge>
              )}
            </p>
          ) : (
            <p style={{ margin: 0 }}>The owner has not sealed a share for you yet.</p>
          )}
          {confirm.error ? <ErrorNotice error={confirm.error} title="Could not confirm" /> : null}
          <div>
            <Button
              variant="secondary"
              disabled={!me.shareUploaded || me.shareDigest === null || confirmed}
              loading={confirm.isPending}
              onClick={() => me.shareDigest && confirm.mutate({ shareDigest: me.shareDigest })}
            >
              Confirm I received my share
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function PortalPage() {
  const { session, forget } = useTrusteeSession()
  const me = useApiQuery<TrusteeStateView>(trusteePaths.me, { enabled: session !== null })

  if (!session) return <Navigate to="/trustee" replace />
  if (me.isPending) return <PageSkeleton label="Loading your portal" />
  if (me.error) {
    if (isApiError(me.error) && me.error.status === 401)
      return (
        <div className="page-stack">
          <Callout tone="danger" title="This access token no longer works" role="alert">
            <p>
              It may have been revoked by the owner. Forget this device and ask them for a new
              invite.
            </p>
            <div>
              <Button variant="secondary" onClick={forget}>
                Forget this device
              </Button>
            </div>
          </Callout>
        </div>
      )
    return <ErrorNotice error={me.error} onRetry={() => void me.refetch()} />
  }

  const s = me.data
  const phaseText =
    s.phase === 'WAITING'
      ? 'The owner is checking in as normal, or has only just missed one. There is nothing for you to do. You will be contacted if that changes.'
      : s.phase === 'VOTING'
        ? 'The owner has been silent through every reminder. Trustees are being asked whether to release the vault.'
        : 'The vault has been released to the trustees.'

  return (
    <div className="page-stack">
      <PageHeader
        title={`Hello, ${s.label}`}
        description="You are a trustee of someone's digital legacy."
        actions={
          <Button variant="secondary" loading={me.isFetching} onClick={() => void me.refetch()}>
            Refresh
          </Button>
        }
      />
      <Card aria-labelledby="phase-title">
        <CardHeader>
          <div className="row-wrap">
            <CardTitle as="h2" id="phase-title">
              Where things stand
            </CardTitle>
            <Badge
              variant={
                s.phase === 'WAITING' ? 'success' : s.phase === 'VOTING' ? 'warning' : 'danger'
              }
              dot
            >
              {s.phase === 'WAITING'
                ? 'Waiting'
                : s.phase === 'VOTING'
                  ? 'Voting open'
                  : 'Released'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p style={{ margin: 0 }}>{phaseText}</p>
        </CardContent>
      </Card>
      {s.phase === 'VOTING' ? <VoteCard me={s} /> : null}
      {s.phase === 'RELEASED' ? <UnsealCard /> : null}
      <ConfirmCard me={s} />
      {s.keyFingerprint ? (
        <Card aria-labelledby="fp-title">
          <CardHeader>
            <CardTitle as="h2" id="fp-title">
              Your registered key
            </CardTitle>
            <CardDescription>
              This is the fingerprint of the key the owner locked your share to. It should match the
              one shown when you registered. If the owner asks, read it to them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Fingerprint value={s.keyFingerprint} label="Your registered key fingerprint" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

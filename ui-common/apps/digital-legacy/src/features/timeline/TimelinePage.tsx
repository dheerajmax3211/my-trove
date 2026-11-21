import { isApiError } from '@platform/api-client'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Illustration,
  PageHeader,
  Timeline,
  type TimelineTone,
} from '@platform/ui'
import type { ChainView } from '../../api/types'
import { Callout } from '../../components/Callout'
import { CopyButton } from '../../components/CopyButton'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { formatDateTime } from '../../lib/format'
import { useMutation } from '@tanstack/react-query'
import { useOwnerApi, useTimelineQuery } from '../queries'
import { describeEvent } from './events'

function toneOf(eventType: string): TimelineTone {
  if (eventType === 'RELEASED' || eventType === 'QUORUM_REACHED') return 'danger'
  if (eventType === 'STATE_CHANGED' || eventType === 'ESCALATION_STEP_EXECUTED') return 'warning'
  if (eventType === 'CHECK_IN' || eventType === 'ARMED') return 'success'
  if (eventType.startsWith('VAULT_') || eventType.startsWith('SHARE_')) return 'brass'
  return 'neutral'
}

function VerifyCard() {
  const api = useOwnerApi()
  const verify = useMutation<ChainView, Error>({ mutationFn: () => api.verifyAudit() })
  const result = verify.data
  return (
    <Card aria-labelledby="verify-title">
      <CardHeader>
        <CardTitle as="h2" id="verify-title">
          Verify the audit trail
        </CardTitle>
        <CardDescription>
          Every event is chained to the one before it with a SHA-256 hash. If anyone edits or
          deletes history, the chain breaks. Verifying asks the server to recompute it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="stack-3">
          <div>
            <Button variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
              Verify the chain
            </Button>
          </div>
          {verify.error ? <ErrorNotice error={verify.error} title="Could not verify" /> : null}
          {result?.intact ? (
            <Callout tone="success" title="The chain is intact" role="status">
              <p>{result.length} events, none altered or removed.</p>
              {result.headHash ? (
                <>
                  <p className="small">
                    Head hash (keep a copy somewhere the server cannot reach, so a later rewrite of
                    history can be spotted):
                  </p>
                  <p className="mono" style={{ margin: 0 }}>
                    {result.headHash}
                  </p>
                  <div>
                    <CopyButton text={result.headHash} label="Copy head hash" />
                  </div>
                </>
              ) : null}
            </Callout>
          ) : null}
          {result && !result.intact ? (
            <Callout tone="danger" title="The chain is broken" role="alert">
              <p>
                History was altered at or before event {result.firstBadSeq ?? 'unknown'}. Treat the
                trail after that point as untrustworthy and investigate.
              </p>
            </Callout>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function TimelinePage() {
  const timeline = useTimelineQuery(100)
  if (timeline.isPending) return <PageSkeleton label="Loading the timeline" />
  if (timeline.error) {
    if (isApiError(timeline.error) && timeline.error.status === 404)
      return (
        <EmptyState
          illustration={<Illustration name="empty" size={200} />}
          title="Nothing to show yet"
          description="The trail starts when you create your vault."
        />
      )
    return <ErrorNotice error={timeline.error} onRetry={() => void timeline.refetch()} />
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Timeline"
        description="Everything that has happened to your vault, newest first. Nobody can change this record without it showing."
      />
      <VerifyCard />
      <Card aria-labelledby="events-title">
        <CardHeader>
          <CardTitle as="h2" id="events-title">
            Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.data.length === 0 ? (
            <EmptyState headingAs="h3" title="No events yet" />
          ) : (
            <Timeline
              label="Audit events"
              items={timeline.data.map((entry) => {
                const e = describeEvent(entry)
                return {
                  id: String(entry.seq),
                  title: e.title,
                  time: formatDateTime(entry.at),
                  dateTime: entry.at,
                  tone: toneOf(entry.eventType),
                  ...(e.summary ? { description: e.summary } : {}),
                  meta: <Badge>{e.actor}</Badge>,
                }
              })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

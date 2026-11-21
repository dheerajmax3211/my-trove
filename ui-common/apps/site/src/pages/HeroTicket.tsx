import { Badge, Button, KeyValueList, Timeline, type TimelineItem } from '@platform/ui'
import { useState } from 'react'
import styles from './HeroTicket.module.css'

type Phase = 'pending' | 'granted' | 'denied' | 'revoked'

const STATUS: Record<
  Phase,
  { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  pending: { label: 'Waiting for you', variant: 'warning' },
  granted: { label: 'Granted', variant: 'success' },
  denied: { label: 'Denied', variant: 'danger' },
  revoked: { label: 'Revoked', variant: 'neutral' },
}

const SUMMARY: Record<Phase, string> = {
  pending: 'Shoe Finder asked for your shoe size. You can approve it, approve less, or say no.',
  granted:
    'Shoe Finder can read your shoe size and nothing else. Each read is checked against this grant and logged.',
  denied: 'Shoe Finder gets nothing. The request is logged.',
  revoked: 'Access ended on the next read, even though the app still holds a token.',
}

function logFor(phase: Phase): TimelineItem[] {
  if (phase === 'granted' || phase === 'revoked') {
    const items: TimelineItem[] = []
    if (phase === 'revoked') {
      items.push({
        id: 'after-revoke',
        title: 'Read profile.sizes.shoe',
        description: 'Denied: GRANT_REVOKED',
        tone: 'danger',
      })
      items.push({
        id: 'revoke',
        title: 'You revoked the grant',
        tone: 'brass',
      })
    }
    items.push(
      {
        id: 'address',
        title: 'Read profile.address',
        description: 'Denied: SCOPE_NOT_GRANTED',
        tone: 'danger',
      },
      {
        id: 'shoe',
        title: 'Read profile.sizes.shoe',
        description: 'Allowed. 4 reads left.',
        tone: 'success',
      },
      { id: 'approve', title: 'You approved the request', tone: 'brass' },
    )
    return items
  }
  if (phase === 'denied') return [{ id: 'deny', title: 'You denied the request', tone: 'danger' }]
  return []
}

/**
 * The idea of the product in one small interaction: an app asks, you decide, the app is held to
 * exactly that, and you can take it back. It is a sample, so nothing is sent anywhere.
 */
export function HeroTicket() {
  const [phase, setPhase] = useState<Phase>('pending')
  const status = STATUS[phase]
  const log = logFor(phase)

  return (
    <section className={styles.ticket} aria-label="Example access request">
      <div className={styles.head}>
        <p className={styles.app}>Shoe Finder</p>
        <Badge variant={status.variant} dot>
          {status.label}
        </Badge>
      </div>

      <KeyValueList
        dense
        items={[
          { id: 'wants', label: 'Wants to read', value: 'profile.sizes.shoe', mono: true },
          { id: 'why', label: 'To', value: 'Find shoes that fit' },
          { id: 'for', label: 'For', value: '30 days, up to 5 reads' },
        ]}
      />

      <p className={styles.summary} aria-live="polite">
        {SUMMARY[phase]}
      </p>

      {log.length > 0 ? (
        <Timeline compact label="Access log" items={log} className={styles.log} />
      ) : null}

      <div className={styles.actions}>
        {phase === 'pending' ? (
          <>
            <Button size="md" onClick={() => setPhase('granted')}>
              Approve
            </Button>
            <Button size="md" variant="secondary" onClick={() => setPhase('denied')}>
              Deny
            </Button>
          </>
        ) : null}
        {phase === 'granted' ? (
          <Button size="md" variant="secondary" onClick={() => setPhase('revoked')}>
            Revoke access
          </Button>
        ) : null}
        {phase === 'denied' || phase === 'revoked' ? (
          <Button size="md" variant="ghost" onClick={() => setPhase('pending')}>
            Start again
          </Button>
        ) : null}
      </div>

      <p className={styles.caption}>A sample request. Nothing here is sent or stored.</p>
    </section>
  )
}

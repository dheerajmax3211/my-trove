import { BentoCard, Button, Field, Input, InboxIcon, Textarea } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { describeError } from '../../../lib/errors'
import { useRecordReply } from '../hooks/useItems'
import type { ReplyClassification, ReplyResult } from '../api/types'

const TEXT_MAX = 20000

/** What the backend did with the reply, in the owner's words. The stage itself moves through the follow-up workflow. */
export function replyOutcomeText(result: ReplyResult): string {
  if (!result.applied) {
    return 'Saved on the timeline. The item is already closed, so nothing about it changed.'
  }
  const reading: Record<ReplyClassification, string> = {
    PAID: 'Read as paid or approved. Follow-ups are stopping and the item will close.',
    REJECTED: 'Read as a refusal. The item is moving to escalation.',
    NEEDS_INFO: 'Read as a request for information. Follow-ups wait 7 days before the next letter.',
    UNKNOWN:
      'Saved on the timeline. It is not clear what it means, so the schedule is unchanged. Read it and decide.',
  }
  return reading[result.classification ?? 'UNKNOWN']
}

/** Paste in what the counterparty said, so the follow-up can react to it. */
export function ReplyCard({ itemId, counterparty }: { itemId: string; counterparty: string }) {
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReplyResult | null>(null)
  const record = useRecordReply(itemId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (body === '') {
      setError('Paste what they said first.')
      return
    }
    setError(null)
    setResult(null)
    record.mutate(
      {
        from: from.trim() || counterparty,
        ...(subject.trim() ? { subject: subject.trim() } : {}),
        text: body,
      },
      {
        onSuccess: (saved) => {
          setResult(saved)
          setText('')
        },
        onError: (failure) => setError(describeError(failure)),
      },
    )
  }

  return (
    <BentoCard span={5} title="Their reply" icon={<InboxIcon size={18} />}>
      <p className="wo-detail-note">
        Waiting On does not read your inbox. Paste in what they said, and it is classified, kept on
        the timeline, and used to move the follow-up.
      </p>
      <form className="wo-stack" onSubmit={submit} noValidate aria-label="Record a reply">
        <Field label="What did they say?" required>
          <Textarea
            rows={4}
            maxLength={TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="wo-form-row">
          <Field label="From" description="Optional. Defaults to the counterparty.">
            <Input value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Subject" description="Optional. Helps the reading.">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        </div>
        <div className="wo-form-actions">
          <Button type="submit" loading={record.isPending}>
            Record reply
          </Button>
        </div>
      </form>
      {error ? (
        <p className="wo-alert" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="wo-fineprint" role="status" data-testid="reply-outcome">
          {replyOutcomeText(result)}
        </p>
      ) : null}
    </BentoCard>
  )
}

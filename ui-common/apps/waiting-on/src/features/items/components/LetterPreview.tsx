import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@platform/ui'
import { useState } from 'react'
import { CopyButton } from '../../../components/CopyButton'
import { ErrorState } from '../../../components/ErrorState'
import { TONES, type Tone } from '../api/types'
import { useDraft } from '../hooks/useItems'
import { TONE_BLURB, TONE_LABEL } from '../logic/labels'

function LetterPanel({ itemId, tone }: { itemId: string; tone: Tone }) {
  const draft = useDraft(itemId, tone)
  if (draft.isPending)
    return (
      <div className="wo-stack" role="status" aria-label="Loading letter">
        <Skeleton height={20} width="60%" />
        <Skeleton height={160} />
      </div>
    )
  if (draft.isError)
    return (
      <ErrorState
        title="We could not draft this letter"
        error={draft.error}
        onRetry={() => void draft.refetch()}
      />
    )
  const { subject, body, note } = draft.data
  return (
    <div className="wo-stack">
      <p className="wo-muted">{TONE_BLURB[tone]}</p>
      <div>
        <p className="wo-label">Subject</p>
        <p data-testid="letter-subject">{subject}</p>
      </div>
      <div>
        <p className="wo-label">Letter</p>
        <pre className="wo-pre" data-testid="letter-body">
          {body}
        </pre>
      </div>
      <div className="wo-row-actions">
        <CopyButton text={`Subject: ${subject}\n\n${body}`} what="letter" />
      </div>
      <p className="wo-fineprint">{note}</p>
    </div>
  )
}

/** Previews each letter as of today. Nothing is sent or stored by looking at it. */
export function LetterPreview({ itemId }: { itemId: string }) {
  const [tone, setTone] = useState<Tone>('NUDGE')
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Draft letters</CardTitle>
        <CardDescription>
          Preview what each follow-up says as of today. Replace [Your name] before you send.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tone} onValueChange={(next) => setTone(next as Tone)}>
          <TabsList aria-label="Letter type">
            {TONES.map((t) => (
              <TabsTrigger key={t} value={t}>
                {TONE_LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          {TONES.map((t) => (
            <TabsContent key={t} value={t}>
              <LetterPanel itemId={itemId} tone={t} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

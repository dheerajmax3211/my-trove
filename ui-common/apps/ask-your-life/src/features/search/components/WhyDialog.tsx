import { Button, Callout, Dialog, DialogClose, KeyValueList, Timeline } from '@platform/ui'
import { explainHit } from '../lib/explain'
import type { SearchDebug, SearchHit, SearchMode } from '../api/types'
import { MODE_OPTIONS } from './ModeToggle'

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** "Why this result": the ranks behind a hit, in plain language. */
export function WhyDialog({
  hit,
  mode,
  debug,
}: {
  hit: SearchHit
  mode: SearchMode
  debug: SearchDebug | null | undefined
}) {
  const explanation = explainHit(hit, mode, debug)
  const modeLabel = MODE_OPTIONS.find((m) => m.value === mode)?.label ?? mode
  return (
    <Dialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Why this result: ${hit.title}`}>
          Why this result?
        </Button>
      }
      title="Why this result"
      description={`${hit.title}, found with ${modeLabel} search.`}
      footer={
        <DialogClose asChild>
          <Button variant="secondary">Close</Button>
        </DialogClose>
      }
    >
      <div className="ayl-why">
        <Callout variant="info" title={explanation.summary} />
        <Timeline
          label="How it was found"
          compact
          items={explanation.steps.map((step) => ({
            id: step.id,
            title: step.label || 'Best passage',
            description: sentence(step.text),
            tone: step.found === null ? 'accent' : step.found ? 'success' : 'neutral',
          }))}
        />
        <KeyValueList
          dense
          layout="stacked"
          items={[
            ...(mode !== 'semantic'
              ? [
                  {
                    id: 'keyword',
                    label: 'Keyword rank',
                    value: hit.explain?.ftsRank == null ? 'Not listed' : `#${hit.explain.ftsRank}`,
                  },
                ]
              : []),
            ...(mode !== 'keyword'
              ? [
                  {
                    id: 'meaning',
                    label: 'Meaning rank',
                    value:
                      hit.explain?.semanticRank == null
                        ? 'Not listed'
                        : `#${hit.explain.semanticRank}`,
                  },
                ]
              : []),
            { id: 'score', label: 'Combined score', value: hit.score.toFixed(4), mono: true },
          ]}
        />
        <p className="ayl-why-score">{explanation.scoreLine}</p>
      </div>
    </Dialog>
  )
}

import { Button, Dialog, DialogClose } from '@platform/ui'
import { explainHit } from '../lib/explain'
import type { SearchDebug, SearchHit, SearchMode } from '../api/types'
import { MODE_OPTIONS } from './ModeToggle'

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
        <p className="ayl-why-summary">{explanation.summary}</p>
        <ul className="ayl-why-list">
          {explanation.details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <dl className="ayl-why-ranks">
          {mode !== 'semantic' ? (
            <div>
              <dt>Keyword rank</dt>
              <dd>{hit.explain?.ftsRank == null ? 'Not listed' : `#${hit.explain.ftsRank}`}</dd>
            </div>
          ) : null}
          {mode !== 'keyword' ? (
            <div>
              <dt>Meaning rank</dt>
              <dd>
                {hit.explain?.semanticRank == null ? 'Not listed' : `#${hit.explain.semanticRank}`}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Combined score</dt>
            <dd>{hit.score.toFixed(4)}</dd>
          </div>
        </dl>
        <p className="ayl-why-score">{explanation.scoreLine}</p>
      </div>
    </Dialog>
  )
}

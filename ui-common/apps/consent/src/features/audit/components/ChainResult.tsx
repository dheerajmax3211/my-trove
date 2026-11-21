import { CheckCircleIcon, XCircleIcon } from '@platform/ui'
import type { ChainReport } from '../../../shared/api/types'
import { CopyButton } from '../../../shared/components/CopyButton'
import { describeBreak } from '../../../shared/lib/audit'
import { formatDateTime } from '../../../shared/lib/format'

export interface ChainResultProps {
  report: ChainReport
  /** Epoch ms of the check, shown so a stale result is not mistaken for a fresh one. */
  checkedAt: number
}

/** The outcome of walking the audit chain: intact, or exactly where it first breaks. */
export function ChainResult({ report, checkedAt }: ChainResultProps) {
  const when = formatDateTime(new Date(checkedAt).toISOString())
  if (report.valid) {
    return (
      <div className="chain chain-ok" role="status">
        <CheckCircleIcon size={28} />
        <div className="stack-sm">
          <h3 className="chain-title">Audit log intact</h3>
          <p>
            All {report.entriesChecked} entries were re-checked. None was changed, removed or
            reordered.
          </p>
          <p className="muted">Checked {when}.</p>
          <p className="muted">
            Newest entry: #{report.headSeq}. Its fingerprint is{' '}
            <code className="mono hash">{report.headHash}</code>{' '}
            <CopyButton text={report.headHash} what="fingerprint" />
          </p>
        </div>
      </div>
    )
  }
  const problem =
    report.reason && report.firstBrokenSeq !== null
      ? describeBreak(report.reason, report.firstBrokenSeq)
      : { headline: 'The audit log does not verify', explanation: 'The chain is broken.' }
  return (
    <div className="chain chain-broken" role="alert">
      <XCircleIcon size={28} />
      <div className="stack-sm">
        <h3 className="chain-title">Audit log broken</h3>
        <p>
          <strong>{problem.headline}.</strong> {problem.explanation}
        </p>
        <dl className="facts">
          <div>
            <dt>First broken entry</dt>
            <dd>{report.firstBrokenSeq === null ? 'Unknown' : `#${report.firstBrokenSeq}`}</dd>
          </div>
          <div>
            <dt>Entries that checked out</dt>
            <dd>{report.entriesChecked}</dd>
          </div>
          <div>
            <dt>Failure type</dt>
            <dd>
              <code className="mono">{report.reason ?? 'UNKNOWN'}</code>
            </dd>
          </div>
        </dl>
        <p className="muted">
          Everything before the broken entry is still trustworthy. Treat anything after it with
          suspicion. Checked {when}.
        </p>
      </div>
    </div>
  )
}

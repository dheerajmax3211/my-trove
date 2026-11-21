import {
  Button,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { describeBreak } from '../../../shared/lib/audit'
import { formatDateTime } from '../../../shared/lib/format'
import { ErrorState } from '../../../shared/components/ErrorState'
import { useChainVerification } from '../../audit/hooks/useChain'

/** Is the record of who read what still intact? Verified on load, and again whenever you ask. */
export function ChainPanel() {
  const chain = useChainVerification({ autoRun: true })
  const verify = (
    <Button
      size="sm"
      variant="secondary"
      loading={chain.isFetching && !chain.isPending}
      onClick={() => void chain.refetch()}
    >
      Verify again
    </Button>
  )
  const report = chain.data
  const checked = report ? formatDateTime(new Date(chain.dataUpdatedAt).toISOString()) : ''
  const problem =
    report && !report.valid && report.reason && report.firstBrokenSeq !== null
      ? describeBreak(report.reason, report.firstBrokenSeq)
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Audit log</CardTitle>
        <CardDescription>Every read and decision is written to a hash-chained log.</CardDescription>
      </CardHeader>
      <CardContent>
        {chain.isPending ? (
          <Skeleton height="5rem" />
        ) : chain.isError ? (
          <ErrorState error={chain.error} onRetry={() => void chain.refetch()} />
        ) : report?.valid ? (
          <Callout variant="success" role="status" title="Audit log intact" action={verify}>
            <p>
              All {report.entriesChecked} entries were re-checked. None was changed, removed or
              reordered.
            </p>
            <p className="muted">Checked {checked}.</p>
          </Callout>
        ) : report ? (
          <Callout variant="danger" title="Audit log broken" action={verify}>
            <p>
              <strong>{problem?.headline ?? 'The audit log does not verify'}.</strong>{' '}
              {problem?.explanation ?? 'The chain is broken.'}
            </p>
            <p className="muted">Checked {checked}.</p>
          </Callout>
        ) : null}
        <div className="row-wrap">
          <Button variant="secondary" asChild>
            <ModuleLink to="/audit">Open audit</ModuleLink>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

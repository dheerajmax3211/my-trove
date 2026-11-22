import { BentoCard, Button, CheckCircleIcon, ShieldIcon, Skeleton, XCircleIcon } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { describeBreak } from '../../../shared/lib/audit'
import { formatDateTime } from '../../../shared/lib/format'
import { ErrorState } from '../../../shared/components/ErrorState'
import { useChainVerification } from '../../audit/hooks/useChain'

/** Is the record of who read what still intact? Verified on load, and again whenever you ask. */
export function ChainPanel() {
  const chain = useChainVerification({ autoRun: true })
  const report = chain.data
  const checked = report ? formatDateTime(new Date(chain.dataUpdatedAt).toISOString()) : ''
  const problem =
    report && !report.valid && report.reason && report.firstBrokenSeq !== null
      ? describeBreak(report.reason, report.firstBrokenSeq)
      : null
  const broken = report ? !report.valid : false

  return (
    <BentoCard
      span={5}
      tone={broken ? 'light' : 'lime'}
      title="Audit log"
      icon={<ShieldIcon size={18} />}
    >
      {chain.isPending ? (
        <Skeleton height="5rem" />
      ) : chain.isError ? (
        <ErrorState error={chain.error} onRetry={() => void chain.refetch()} />
      ) : report?.valid ? (
        <div className="chain-card" role="status">
          <p className="chain-big">
            <CheckCircleIcon size={28} style={{ verticalAlign: '-4px', marginInlineEnd: 8 }} />
            Audit log intact
          </p>
          <p>
            All {report.entriesChecked} entries were re-checked. None was changed, removed or
            reordered.
          </p>
          <p className="muted">Checked {checked}.</p>
        </div>
      ) : report ? (
        <div className="chain-card chain-broken-card" role="alert">
          <p className="chain-big">
            <XCircleIcon size={28} style={{ verticalAlign: '-4px', marginInlineEnd: 8 }} />
            Audit log broken
          </p>
          <p>
            <strong>{problem?.headline ?? 'The audit log does not verify'}.</strong>{' '}
            {problem?.explanation ?? 'The chain is broken.'}
          </p>
          <p className="muted">Checked {checked}.</p>
        </div>
      ) : null}
      <div className="card-actions">
        <Button
          size="sm"
          variant={broken ? 'secondary' : 'primary'}
          loading={chain.isFetching && !chain.isPending}
          onClick={() => void chain.refetch()}
        >
          Verify again
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <ModuleLink to="/audit">Open audit</ModuleLink>
        </Button>
      </div>
    </BentoCard>
  )
}

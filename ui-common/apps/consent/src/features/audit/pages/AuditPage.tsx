import { BentoCard, BentoGrid, Button, FileIcon, PageHeader, ShieldIcon } from '@platform/ui'
import { ErrorState } from '../../../shared/components/ErrorState'
import { ChainResult } from '../components/ChainResult'
import { useChainVerification } from '../hooks/useChain'

const HOW = [
  'Every read, refusal and change is written to the log as one entry.',
  'Each entry stores a fingerprint of the entry before it.',
  'Edit or delete any entry and every fingerprint after it stops matching.',
]

export function AuditPage() {
  const chain = useChainVerification({ autoRun: false })
  const running = chain.isFetching

  return (
    <>
      <PageHeader
        title="Audit"
        description="Every access is written to a log where each entry contains a fingerprint of the one before it. If anyone edits or deletes an entry, the chain stops adding up."
      />
      <BentoGrid>
        <BentoCard span={8} title="Verify the chain" icon={<ShieldIcon size={18} />}>
          <p className="muted">
            This re-computes every fingerprint from the first entry onwards and reports the first
            entry that does not match.
          </p>
          <div className="stack" style={{ marginTop: 'var(--pp-space-5)' }}>
            <div>
              <Button loading={running} onClick={() => void chain.refetch()}>
                {chain.data ? 'Verify again' : 'Verify chain'}
              </Button>
            </div>
            {chain.isError && !running ? (
              <ErrorState error={chain.error} onRetry={() => void chain.refetch()} />
            ) : chain.data ? (
              <ChainResult report={chain.data} checkedAt={chain.dataUpdatedAt} />
            ) : (
              <p className="muted">Not checked yet. Press the button to run the check.</p>
            )}
          </div>
        </BentoCard>
        <BentoCard span={4} tone="dark" title="How the chain works" icon={<FileIcon size={18} />}>
          <ol className="firstrun-steps">
            {HOW.map((line) => (
              <li key={line}>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </BentoCard>
      </BentoGrid>
    </>
  )
}

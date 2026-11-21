import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@platform/ui'
import { ErrorState } from '../../../shared/components/ErrorState'
import { ChainResult } from '../components/ChainResult'
import { useChainVerification } from '../hooks/useChain'

export function AuditPage() {
  const chain = useChainVerification({ autoRun: false })
  const running = chain.isFetching

  return (
    <>
      <PageHeader
        title="Audit"
        description="Every access is written to a log where each entry contains a fingerprint of the one before it. If anyone edits or deletes an entry, the chain stops adding up."
      />
      <Card>
        <CardHeader>
          <CardTitle as="h2">Verify the chain</CardTitle>
          <CardDescription>
            This re-computes every fingerprint from the first entry onwards and reports the first
            entry that does not match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack">
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
        </CardContent>
      </Card>
    </>
  )
}

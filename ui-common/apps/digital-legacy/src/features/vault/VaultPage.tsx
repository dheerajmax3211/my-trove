import { isApiError } from '@platform/api-client'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@platform/ui'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { formatBytes, formatDateTime } from '../../lib/format'
import { useStateQuery, useVaultQuery } from '../queries'
import { LocalEncryptionNotice } from './LocalEncryptionNotice'
import { UnlockVaultCard } from './UnlockVaultCard'
import { useVaultKey } from './VaultKeyContext'
import { VaultEditor } from './VaultEditor'

export function VaultPage() {
  const vault = useVaultQuery()
  const state = useStateQuery()
  const { key, lock } = useVaultKey()

  if (vault.isPending) return <PageSkeleton label="Loading your vault" />
  const missing = isApiError(vault.error) && vault.error.status === 404
  if (vault.error && !missing)
    return <ErrorNotice error={vault.error} onRetry={() => void vault.refetch()} />

  const summary = missing ? null : (vault.data ?? null)
  const editable = missing || state.data?.state === 'ACTIVE'

  return (
    <div className="page-stack">
      <PageHeader
        title="Vault"
        description="The secrets and instructions you leave behind. Written, encrypted and read only on your device."
        actions={
          key ? (
            <Button variant="secondary" onClick={lock}>
              Lock vault
            </Button>
          ) : null
        }
      />
      <LocalEncryptionNotice />
      {summary && !key ? <UnlockVaultCard /> : <VaultEditor vault={summary} editable={editable} />}
      {summary ? (
        <Card aria-labelledby="stored-title">
          <CardHeader>
            <CardTitle as="h2" id="stored-title">
              What the server holds
            </CardTitle>
            <CardDescription>
              This is everything the server knows about the contents. It is ciphertext, so it tells
              nothing about what you wrote beyond roughly how much.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="status-grid">
              <div>
                <dt>Encrypted size</dt>
                <dd>{formatBytes(summary.ciphertextBytes)}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{summary.contentRevision}</dd>
              </div>
              <div>
                <dt>Key version</dt>
                <dd>{summary.vaultVersion}</dd>
              </div>
              <div>
                <dt>Algorithm</dt>
                <dd>{summary.metadata.alg}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDateTime(summary.updatedAt)}</dd>
              </div>
              <div>
                <dt>Ciphertext SHA-256</dt>
                <dd className="mono">{summary.ciphertextSha256.slice(0, 16)}...</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

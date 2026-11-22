import { isApiError } from '@platform/api-client'
import { BentoCard, BentoGrid, Button, ChartIcon, PageHeader } from '@platform/ui'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { formatBytes, formatDateTime } from '../../lib/format'
import { useStateQuery, useVaultQuery } from '../queries'
import { BackupStepsCard, LocalEncryptionNotice } from './LocalEncryptionNotice'
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
    <>
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
      <BentoGrid>
        {summary && !key ? (
          <UnlockVaultCard />
        ) : (
          <VaultEditor vault={summary} editable={editable} />
        )}
        <LocalEncryptionNotice unlocked={key !== null} />
        <BackupStepsCard />
        {summary ? (
          <BentoCard span={12} title="What the server holds" icon={<ChartIcon size={18} />}>
            <div className="stack-3">
              <p className="small muted" style={{ margin: 0 }}>
                This is everything the server knows about the contents. It is ciphertext, so it
                tells nothing about what you wrote beyond roughly how much.
              </p>
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
            </div>
          </BentoCard>
        ) : null}
      </BentoGrid>
    </>
  )
}

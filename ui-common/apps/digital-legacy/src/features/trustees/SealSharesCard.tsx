import { useMutation } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from '@platform/ui'
import { useState } from 'react'
import { ModuleLink } from '@platform/workspace-kit'
import type { StateView, TrusteeView, VaultSummary } from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { describeError } from '../../lib/errors'
import { useOwnerApi, useRefreshOwnerData } from '../queries'
import { useVaultKey } from '../vault/VaultKeyContext'
import { eligibleForShare, sealAndUploadShares, type SealOutcome } from './sealing'

type Progress = Record<string, 'sealing' | 'uploaded' | 'failed'>

/** Splits the vault key and uploads one sealed share per trustee. All cryptography runs here. */
export function SealSharesCard({
  vault,
  state,
  trustees,
  isVerified,
}: {
  vault: VaultSummary
  state: StateView
  trustees: TrusteeView[]
  isVerified: (fingerprint: string | null) => boolean
}) {
  const api = useOwnerApi()
  const { toast } = useToast()
  const refresh = useRefreshOwnerData()
  const { key } = useVaultKey()
  const [progress, setProgress] = useState<Progress>({})
  const [outcomes, setOutcomes] = useState<SealOutcome[] | null>(null)

  const holders = eligibleForShare(trustees)
  const threshold = state.policy?.quorum ?? 0
  const unverified = holders.filter((t) => !isVerified(t.keyFingerprint))
  const blockers: string[] = []
  if (state.state !== 'ACTIVE')
    blockers.push('Check in first: shares can only be sealed while the switch is quiet.')
  if (!state.policy) blockers.push('Set your check-in policy (it holds the quorum).')
  else if (holders.length < threshold)
    blockers.push(`You need ${threshold} trustees with a registered key; ${holders.length} so far.`)
  if (unverified.length > 0)
    blockers.push(`Compare the fingerprint of ${unverified.map((t) => t.label).join(', ')} first.`)

  const seal = useMutation({
    mutationFn: async () => {
      if (!key) throw new Error('The vault key is locked')
      if (!vault.id) throw new Error('There is no vault yet')
      setProgress({})
      setOutcomes(null)
      return sealAndUploadShares({
        api,
        vaultId: vault.id,
        vaultVersion: vault.vaultVersion,
        vaultKey: key,
        trustees,
        threshold,
        onProgress: (id, status) => setProgress((p) => ({ ...p, [id]: status })),
      })
    },
    onSuccess: async (results) => {
      setOutcomes(results)
      await refresh()
      const failed = results.filter((r) => !r.ok)
      if (failed.length === 0)
        toast({
          title: 'Shares sealed and uploaded',
          description: `${results.length} trustees now hold a share. Any ${threshold} can rebuild the key.`,
          variant: 'success',
        })
    },
  })

  const failed = outcomes?.filter((o) => !o.ok) ?? []

  return (
    <Card aria-labelledby="seal-title">
      <CardHeader>
        <CardTitle as="h2" id="seal-title">
          Seal shares
        </CardTitle>
        <CardDescription>
          Splits your vault key into {holders.length || 'n'} pieces so that any {threshold || 't'}{' '}
          of them rebuild it, locks each piece to one trustee&apos;s public key in this browser, and
          uploads only the locked pieces. Run this again whenever you add or revoke a trustee or
          change the quorum, because every trustee needs a piece from the same split.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="stack-3">
          {!key ? (
            <Callout tone="info" title="Unlock your vault key first">
              <p>
                The key is only in memory while you work. Load your key file on the{' '}
                <ModuleLink to="/vault">Vault</ModuleLink> page, then return here.
              </p>
            </Callout>
          ) : null}
          {blockers.map((b) => (
            <Callout key={b} tone="warning">
              <p>{b}</p>
            </Callout>
          ))}
          {holders.length > 0 ? (
            <ul className="stack-2" style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {holders.map((t) => (
                <li key={t.id}>
                  {t.label}{' '}
                  {progress[t.id] === 'sealing' ? <Badge variant="info">Sealing</Badge> : null}
                  {progress[t.id] === 'uploaded' ? <Badge variant="success">Uploaded</Badge> : null}
                  {progress[t.id] === 'failed' ? <Badge variant="danger">Failed</Badge> : null}
                  {!progress[t.id] && t.shareCurrent ? (
                    <Badge variant="success">Current share</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {seal.error ? <ErrorNotice error={seal.error} title="Could not seal the shares" /> : null}
          {failed.length > 0 ? (
            <Callout tone="danger" title="Some shares did not upload" role="alert">
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {failed.map((f) => (
                  <li key={f.trusteeId}>
                    {f.label}: {describeError(f.error)}
                  </li>
                ))}
              </ul>
              <p>
                The trustees are now holding shares from different splits. Press the button again to
                redo all of them together.
              </p>
            </Callout>
          ) : null}
          <div>
            <Button
              loading={seal.isPending}
              disabled={!key || blockers.length > 0}
              onClick={() => seal.mutate()}
            >
              Seal and upload shares
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

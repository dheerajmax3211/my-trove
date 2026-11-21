import { useApiQuery } from '@platform/api-client'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  PageHeader,
  Textarea,
} from '@platform/ui'
import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { trusteePaths } from '../../api/paths'
import type { TrusteeStateView, TrusteeCiphertextView } from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { setIdLabel, shareFromText, type Share, type VaultDocument } from '../../crypto'
import { useTrusteeSession } from './TrusteeSession'
import { decryptReleasedVault } from './trusteeService'

interface Slot {
  id: number
  text: string | null
}

function parseSlot(text: string): { share: Share | null; error: string | null } {
  if (text.trim() === '') return { share: null, error: null }
  try {
    return { share: shareFromText(text), error: null }
  } catch (e) {
    return { share: null, error: e instanceof Error ? e.message : 'Not a valid share' }
  }
}

/** Where t trustees bring their shares together. The vault key is rebuilt and used in this browser only. */
export function CombinePage() {
  const { api, session, myShare } = useTrusteeSession()
  const me = useApiQuery<TrusteeStateView>(trusteePaths.me, { enabled: session !== null })
  // `null` means "untouched": the first box then shows the share opened earlier in this session
  const [edits, setEdits] = useState<Slot[]>([
    { id: 1, text: null },
    { id: 2, text: null },
  ])
  const slots = edits.map((s) => ({
    ...s,
    text: s.text ?? (s.id === 1 ? (myShare?.text ?? '') : ''),
  }))
  const [document, setDocument] = useState<VaultDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const parsed = useMemo(() => slots.map((s) => parseSlot(s.text)), [slots])
  const shares = parsed.flatMap((p) => (p.share ? [p.share] : []))
  const threshold = shares[0]?.threshold ?? null

  if (!session) return <Navigate to="/trustee" replace />
  if (me.isPending) return <PageSkeleton label="Loading" />
  if (me.error) return <ErrorNotice error={me.error} onRetry={() => void me.refetch()} />
  if (me.data.phase !== 'RELEASED')
    return (
      <EmptyState
        title="Nothing to combine yet"
        description="Shares can only be combined once the vault has been released. Check your status page for where things stand."
        action={
          <Button asChild>
            <Link to="/trustee/portal">Back to my portal</Link>
          </Button>
        }
      />
    )

  const combine = async () => {
    setBusy(true)
    setError(null)
    setDocument(null)
    try {
      const ciphertext: TrusteeCiphertextView = await api.getCiphertext()
      setDocument(await decryptReleasedVault(shares, ciphertext))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Combine shares"
        description="Bring together the shares of enough trustees to open the vault."
      />
      <Card aria-labelledby="slots-title">
        <CardHeader>
          <CardTitle as="h2" id="slots-title">
            Shares
          </CardTitle>
          <CardDescription>
            Each trustee opens their own share on their portal page and sends you the line of text
            starting DLSHARE1:. Paste yours and the others here.
            {threshold
              ? ` This vault needs ${threshold} shares; you have ${shares.length} valid.`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            {!myShare ? (
              <Callout tone="info">
                <p>
                  Your own share is not open in this session. Open it on your{' '}
                  <Link to="/trustee/portal">portal page</Link>, or paste it below.
                </p>
              </Callout>
            ) : null}
            {slots.map((slot, i) => {
              const p = parsed[i]
              return (
                <Field
                  key={slot.id}
                  label={`Share ${i + 1}`}
                  error={p?.error ?? undefined}
                  description={
                    p?.share
                      ? `Share number ${p.share.x} of set ${setIdLabel(p.share)}, needs ${p.share.threshold}.`
                      : undefined
                  }
                >
                  <Textarea
                    rows={2}
                    className="mono"
                    spellCheck={false}
                    autoComplete="off"
                    value={slot.text}
                    onChange={(e) =>
                      setEdits(
                        edits.map((s) => (s.id === slot.id ? { ...s, text: e.target.value } : s)),
                      )
                    }
                  />
                </Field>
              )
            })}
            <div className="row-wrap">
              <Button
                variant="secondary"
                onClick={() => setEdits([...edits, { id: edits.length + 1, text: '' }])}
              >
                Add another share
              </Button>
              <Button loading={busy} disabled={shares.length === 0} onClick={() => void combine()}>
                Combine and decrypt
              </Button>
            </div>
            {error ? <ErrorNotice error={error} title="Could not open the vault" /> : null}
          </div>
        </CardContent>
      </Card>
      {document ? (
        <Card aria-labelledby="plain-title">
          <CardHeader>
            <CardTitle as="h2" id="plain-title">
              The vault
            </CardTitle>
            <CardDescription>
              Decrypted in this browser. Nothing here is stored; closing or clearing removes it from
              the screen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="stack-3">
              {document.entries.length === 0 ? <p>The vault is empty.</p> : null}
              {document.entries.map((entry) => (
                <section key={entry.id} className="entry-card" aria-label={entry.title}>
                  <h3 style={{ margin: 0 }}>{entry.title}</h3>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{entry.body}</p>
                </section>
              ))}
              <div>
                <Button variant="secondary" onClick={() => setDocument(null)}>
                  Clear from screen
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

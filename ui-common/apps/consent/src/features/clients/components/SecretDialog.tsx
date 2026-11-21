import { Button, Dialog } from '@platform/ui'
import type { ClientWithSecret } from '../../../shared/api/types'
import { CopyButton } from '../../../shared/components/CopyButton'

export interface SecretDialogProps {
  /** The credentials to reveal. Null keeps the dialog closed and the secret out of the page. */
  reveal: { result: ClientWithSecret; kind: 'registered' | 'rotated' } | null
  onClose: () => void
}

/**
 * Shows the client id and secret exactly once. The secret exists only in the `reveal` prop: it is
 * not stored, not logged and not in the query cache, so closing this dialog (or reloading) loses it.
 */
export function SecretDialog({ reveal, onClose }: SecretDialogProps) {
  return (
    <Dialog
      open={reveal !== null}
      onOpenChange={(open) => !open && onClose()}
      dismissible={false}
      title={reveal?.kind === 'rotated' ? 'Your new client secret' : 'Save your client secret'}
      description={
        reveal ? `Credentials for ${reveal.result.client.name}.` : 'Credentials for the new app.'
      }
      footer={<Button onClick={onClose}>I have saved the secret</Button>}
    >
      {reveal ? (
        <div className="stack">
          <p className="warning-box" role="alert">
            <strong>This is the only time the secret is shown.</strong> We keep just a hash, so it
            cannot be recovered. If you lose it, rotate the secret to get a new one.
            {reveal.kind === 'rotated' ? ' The old secret has already stopped working.' : ''}
          </p>
          <div className="credential">
            <span className="credential-label" id="client-id-label">
              Client ID
            </span>
            <code className="credential-value mono" aria-labelledby="client-id-label">
              {reveal.result.client.clientId}
            </code>
            <CopyButton text={reveal.result.client.clientId} what="client ID" />
          </div>
          <div className="credential">
            <span className="credential-label" id="client-secret-label">
              Client secret
            </span>
            <code className="credential-value mono" aria-labelledby="client-secret-label">
              {reveal.result.clientSecret}
            </code>
            <CopyButton text={reveal.result.clientSecret} what="client secret" />
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}

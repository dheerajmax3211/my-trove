import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../../components/ErrorNotice'
import { useTrusteeSession } from './TrusteeSession'

export function TrusteeHome() {
  const { session, signInWithToken } = useTrusteeSession()
  const navigate = useNavigate()
  const [invite, setInvite] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (session) return <Navigate to="/trustee/portal" replace />

  const onSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signInWithToken(token)
      void navigate('/trustee/portal')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Trustee portal"
        description="Someone trusted you with a piece of their digital legacy. This is where you take part."
      />
      <div className="grid-2">
        <Card aria-labelledby="invite-title">
          <CardHeader>
            <CardTitle as="h2" id="invite-title">
              I have an invite
            </CardTitle>
            <CardDescription>
              Opening the link you were sent brings you straight to registration. If you only have
              the invite code, paste it here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="stack-3"
              onSubmit={(e) => {
                e.preventDefault()
                void navigate('/trustee/accept', { state: { invite: invite.trim() } })
              }}
            >
              <Field label="Invite code" required>
                <Input
                  value={invite}
                  autoComplete="off"
                  onChange={(e) => setInvite(e.target.value)}
                  className="mono"
                />
              </Field>
              <div>
                <Button type="submit" disabled={invite.trim() === ''}>
                  Start registration
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card aria-labelledby="token-title">
          <CardHeader>
            <CardTitle as="h2" id="token-title">
              I already registered
            </CardTitle>
            <CardDescription>
              Paste the access token you were shown after registering. It is not your key; it only
              lets you see the status and vote.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="stack-3" onSubmit={(e) => void onSignIn(e)}>
              <Field label="Access token" required>
                <Input
                  type="password"
                  value={token}
                  autoComplete="off"
                  onChange={(e) => setToken(e.target.value)}
                  className="mono"
                />
              </Field>
              {error ? <ErrorNotice error={error} title="That token did not work" /> : null}
              <div>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={busy}
                  disabled={token.trim() === ''}
                >
                  Open my portal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

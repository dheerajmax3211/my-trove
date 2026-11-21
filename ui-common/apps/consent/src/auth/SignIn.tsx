import { useAuth } from '@platform/auth-web'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import type { AuthMode } from '../runtime'

export function SignIn({ mode }: { mode: AuthMode }) {
  const {
    signInWithGoogle,
    sendEmailLink,
    completeEmailLinkSignIn,
    emailLinkPending,
    error,
    clearError,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)

  const onEmail = async (event: FormEvent) => {
    event.preventDefault()
    setBusy('email')
    clearError()
    if (emailLinkPending) await completeEmailLinkSignIn(email)
    else setSent(await sendEmailLink(email))
    setBusy(null)
  }

  return (
    <main className="signin">
      <Card className="signin-card" variant="elevated">
        <CardHeader>
          <CardTitle as="h1">Sign in to Consent</CardTitle>
          <CardDescription>
            Your vault, and exactly who may read it.{' '}
            {mode === 'stub' ? (
              <>
                <Badge variant="warning">Demo mode</Badge> Nothing leaves this browser.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack">
            <Button
              loading={busy === 'google'}
              onClick={async () => {
                setBusy('google')
                clearError()
                await signInWithGoogle()
                setBusy(null)
              }}
            >
              {mode === 'stub' ? 'Continue as the demo user' : 'Continue with Google'}
            </Button>
            <form className="stack" onSubmit={onEmail} noValidate>
              <Field
                label="Email"
                description={
                  emailLinkPending
                    ? 'Confirm the address the link was sent to.'
                    : 'We will email you a one-time sign-in link.'
                }
                error={error?.message}
              >
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <Button
                type="submit"
                variant="secondary"
                loading={busy === 'email'}
                disabled={!email}
              >
                {emailLinkPending ? 'Finish sign-in' : 'Email me a link'}
              </Button>
              {sent ? <p role="status">Check your inbox for the sign-in link.</p> : null}
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

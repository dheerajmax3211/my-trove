import { useAuth } from '@platform/auth-web'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Badge,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import type { AuthMode } from './runtime'

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
          <CardTitle as="h1">Sign in to the demo</CardTitle>
          <CardDescription>
            Auth mode: <Badge variant={mode === 'stub' ? 'warning' : 'success'}>{mode}</Badge>
            {mode === 'stub' ? ' (no Firebase config: in-memory stub)' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            <Button
              loading={busy === 'google'}
              onClick={async () => {
                setBusy('google')
                clearError()
                await signInWithGoogle()
                setBusy(null)
              }}
            >
              Continue with Google
            </Button>
            <form className="stack-3" onSubmit={onEmail} noValidate>
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

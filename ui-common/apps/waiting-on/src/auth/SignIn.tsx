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

export function SignIn({ demo }: { demo: boolean }) {
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
    <main className="wo-signin">
      <Card className="wo-signin-card" variant="elevated">
        <CardHeader>
          <CardTitle as="h1">Sign in to Waiting On</CardTitle>
          <CardDescription>
            Keep track of everything you are waiting for, and let us do the chasing.{' '}
            {demo ? <Badge variant="warning">Demo mode: no real account needed</Badge> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="wo-stack">
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
            <form className="wo-stack" onSubmit={onEmail} noValidate>
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

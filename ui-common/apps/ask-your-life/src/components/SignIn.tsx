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
import type { Runtime } from '../runtime'

export function SignIn({ mode }: { mode: Runtime['mode'] }) {
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
    <main className="ayl-signin">
      <Card variant="elevated" className="ayl-signin-card">
        <CardHeader>
          <CardTitle as="h1">Sign in to Ask your life</CardTitle>
          <CardDescription>
            Your notes, documents and receipts are private. Only you can see them.{' '}
            {mode === 'demo' ? <Badge variant="warning">Demo mode</Badge> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="ayl-form">
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
            <form className="ayl-form" onSubmit={onEmail} noValidate>
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

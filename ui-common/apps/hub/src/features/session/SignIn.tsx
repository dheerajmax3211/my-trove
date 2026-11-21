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
} from '@platform/ui'
import { useState, type FormEvent } from 'react'

/** Sign-in for live mode: Google or a one-time email link, through Firebase. */
export function SignIn() {
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
    <main className="hub-center">
      <Card className="hub-center-card" variant="elevated">
        <CardHeader>
          <CardTitle as="h1">Sign in to your hub</CardTitle>
          <CardDescription>One place for your households, reminders and files.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hub-stack-sm">
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
            <form className="hub-stack-sm" onSubmit={(e) => void onEmail(e)} noValidate>
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

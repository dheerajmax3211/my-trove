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
  KeyCut,
  ProductMark,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useRuntime } from '../runtime'

export function SignIn() {
  const { mode } = useRuntime()
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
    <main className="hp-signin">
      <div className="hp-signin-pitch" data-surface="vault">
        <span className="hp-brand">
          <ProductMark product="home-pulse" variant="solid" size={32} />
          Home Pulse
        </span>
        <p aria-hidden="true" className="hp-signin-keycut">
          <KeyCut />
        </p>
        <p className="hp-signin-promise">
          Smart plugs report how much power each appliance draws. Home Pulse learns what normal
          looks like, then tells you in plain words when a fridge, pump or air conditioner drifts
          away from it.
        </p>
      </div>
      <div className="hp-signin-form">
        <Card className="hp-signin-card" variant="elevated">
          <CardHeader>
            <CardTitle as="h1">Sign in to Home Pulse</CardTitle>
            <CardDescription>
              {mode === 'demo' ? (
                <>
                  <Badge variant="warning">Demo</Badge> Sample data only. Nothing is sent anywhere.
                </>
              ) : (
                'Keep an eye on your appliances before they fail.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="hp-stack-3">
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
              <form className="hp-stack-3" onSubmit={onEmail} noValidate>
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
      </div>
    </main>
  )
}

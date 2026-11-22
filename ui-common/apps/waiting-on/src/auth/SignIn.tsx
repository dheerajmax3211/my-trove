import { useAuth } from '@platform/auth-web'
import { Badge, Button, Field, Input, ProductMark } from '@platform/ui'
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
      <div className="wo-signin-card">
        <div className="wo-signin-mark" aria-hidden="true">
          <ProductMark product="waiting-on" size={44} variant="solid" />
        </div>
        <h1 className="wo-signin-title">Sign in to Waiting On</h1>
        <p className="wo-signin-lede">
          Keep track of refunds, claims and approvals you are waiting for. A follow-up schedule
          drafts the letters, and you send them.{' '}
          {demo ? <Badge variant="warning">Demo mode: no real account needed</Badge> : null}
        </p>
        <div>
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
        </div>
      </div>
    </main>
  )
}

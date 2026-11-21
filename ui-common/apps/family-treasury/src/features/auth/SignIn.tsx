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
import { useRuntime } from '../../runtimeContext'

function DemoSignIn() {
  const { demo } = useRuntime()
  if (!demo) return null
  return (
    <div className="ft-stack">
      <p className="ft-muted">
        Demo mode: everything runs in your browser with made-up data, no sign-up needed. Pick who to
        be. You can switch person at any time from the top bar to see how each role experiences the
        household.
      </p>
      <ul className="ft-stack ft-plain-list">
        {demo.personas.map((p) => (
          <li key={p.uid}>
            <Button fullWidth variant="secondary" onClick={() => demo.auth.switchTo(p.uid)}>
              Continue as {p.name}
            </Button>
            <span className="ft-muted">{p.blurb}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LiveSignIn() {
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
    <div className="ft-stack">
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
      <form className="ft-form" onSubmit={onEmail} noValidate>
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
        <Button type="submit" variant="secondary" loading={busy === 'email'} disabled={!email}>
          {emailLinkPending ? 'Finish sign-in' : 'Email me a link'}
        </Button>
        {sent ? <p role="status">Check your inbox for the sign-in link.</p> : null}
      </form>
    </div>
  )
}

export function SignIn() {
  const { mode } = useRuntime()
  return (
    <main className="ft-signin">
      <Card className="ft-signin-card" variant="elevated">
        <CardHeader>
          <CardTitle as="h1">Family Treasury</CardTitle>
          <CardDescription>
            A shared household money pool with approvals, allowances and a ledger that cannot
            silently go wrong.{' '}
            <Badge variant={mode === 'demo' ? 'warning' : 'success'}>
              {mode === 'demo' ? 'Demo mode' : 'Live'}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>{mode === 'demo' ? <DemoSignIn /> : <LiveSignIn />}</CardContent>
      </Card>
    </main>
  )
}

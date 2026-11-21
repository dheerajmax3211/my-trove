import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Illustration,
  Input,
  ProductMark,
  SidebarNav,
  SidebarSection,
  Spinner,
} from '@platform/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { DemoControls } from './components/DemoControls'
import { NavItem } from './components/NavItem'
import { ThemeSelect } from './components/ThemeSelect'
import { VaultKeyProvider, useVaultKey } from './features/vault/VaultKeyContext'
import { OwnerRoutes } from './OwnerRoutes'
import type { AuthMode, Runtime } from './runtime'

function SignIn({ mode }: { mode: AuthMode }) {
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
      <div className="signin-intro">
        <Illustration name="locked" size={180} />
        <p>
          Digital Legacy hands what you leave behind to the people you trust, only if you stop
          checking in. It is locked in your browser first, so nobody else can read it.
        </p>
      </div>
      <Card className="signin-card" variant="elevated">
        <CardHeader>
          <CardTitle as="h1">Sign in to Digital Legacy</CardTitle>
          <CardDescription>
            Signing in only proves who owns the vault; the key never leaves this browser.{' '}
            <Badge variant={mode === 'stub' ? 'warning' : 'success'}>
              {mode === 'stub' ? 'demo mode' : mode}
            </Badge>
            {mode === 'stub' ? ' (no Firebase config: in-memory demo)' : ''}
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
            <form className="stack-3" onSubmit={(e) => void onEmail(e)} noValidate>
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
            <p className="small muted" style={{ margin: 0 }}>
              Are you a trustee? <Link to="/trustee">Use the trustee portal</Link>, no account
              needed.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

function KeyStatus() {
  const { key, lock } = useVaultKey()
  return key ? (
    <>
      <Badge variant="success" dot>
        Vault key unlocked
      </Badge>
      <Button size="sm" variant="secondary" onClick={lock}>
        Lock
      </Button>
    </>
  ) : (
    <Badge variant="neutral">Vault key locked</Badge>
  )
}

function Shell({ runtime }: { runtime: Runtime }) {
  const { user, signOut } = useAuth()
  const queryClient = useQueryClient()
  useEffect(() => () => queryClient.clear(), [queryClient])
  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  return (
    <AppShell
      brand={
        <span className="brand-lockup">
          <ProductMark product="digital-legacy" size={28} />
          <span className="brand-name">Digital Legacy</span>
        </span>
      }
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection title="Your switch">
            <NavItem to="/" end>
              Overview
            </NavItem>
            <NavItem to="/vault">Vault</NavItem>
            <NavItem to="/trustees">Trustees</NavItem>
            <NavItem to="/policy">Check-in policy</NavItem>
            <NavItem to="/timeline">Timeline</NavItem>
          </SidebarSection>
        </SidebarNav>
      }
      sidebarFooter={runtime.mock ? <DemoControls mock={runtime.mock} /> : null}
      topbar={
        <>
          <KeyStatus />
          <ThemeSelect />
          <div className="user-chip hide-sm">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span>{user?.email}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      }
    >
      <OwnerRoutes />
    </AppShell>
  )
}

/** The owner app: Firebase-authenticated, bearer-token API client. */
export function OwnerApp({ runtime }: { runtime: Runtime }) {
  return (
    <AuthProvider client={runtime.authClient}>
      <ApiProvider client={runtime.ownerClient}>
        <RequireAuth
          loading={
            <div className="signin">
              <Spinner size={32} label="Checking your session" />
            </div>
          }
          fallback={<SignIn mode={runtime.authMode} />}
        >
          <VaultKeyProvider>
            <Shell runtime={runtime} />
          </VaultKeyProvider>
        </RequireAuth>
      </ApiProvider>
    </AuthProvider>
  )
}

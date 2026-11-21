import { useAuth, useIdToken } from '@platform/auth-web'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  Spinner,
} from '@platform/ui'
import type { DemoRuntime } from './runtime'

export function AccountPage({ runtime }: { runtime: DemoRuntime }) {
  const { user, signOut } = useAuth()
  const { token, loading, refresh } = useIdToken()

  return (
    <>
      <PageHeader
        eyebrow="Demo app"
        title="Account"
        description="Read from useAuth() and useIdToken()."
      />
      <Card>
        <CardHeader>
          <CardTitle as="h2">{user?.displayName ?? user?.email ?? 'Signed in'}</CardTitle>
          <CardDescription>
            {user?.email} <Badge variant="neutral">{runtime.mode}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            <div>
              <strong>ID token</strong>
              <div className="mono" aria-live="polite">
                {loading ? (
                  <Spinner size={14} label="Loading token" />
                ) : token ? (
                  `${token.slice(0, 24)}${token.length > 24 ? '...' : ''}`
                ) : (
                  'none'
                )}
              </div>
            </div>
            <div className="row-wrap">
              <Button variant="secondary" onClick={() => void refresh()}>
                Force refresh token
              </Button>
              <Button variant="danger" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

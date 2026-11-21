import { apiQueryKey } from '@platform/api-client'
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
  PageHeader,
  Select,
  useToast,
} from '@platform/ui'
import { useQueryClient } from '@tanstack/react-query'
import { authPaths } from '../../session/authPaths'
import { CopyButton } from '../../../components/CopyButton'
import { ThemeSelect } from '../../../components/ThemeSelect'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useRuntime } from '../../../runtime/context'
import { useProfile } from '../../session/profile'

const DAY_MS = 86_400_000

function DemoTools() {
  const { demo } = useRuntime()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  if (!demo) return null

  const advance = (days: number) => {
    demo.advanceClock(days * DAY_MS)
    void queryClient.invalidateQueries()
    toast({
      title: `Moved the demo clock forward ${days === 1 ? 'a day' : `${days} days`}`,
      description: 'Reminders that came due have fired.',
      variant: 'info',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Demo tools</CardTitle>
        <CardDescription>
          Only in demo mode. Try both sides of an invite, or watch reminders fire.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hub-stack-sm">
          <Field label="Signed in as" description="Switching user keeps the demo data.">
            <Select value={user?.uid ?? ''} onChange={(e) => void demo.signInAs(e.target.value)}>
              {demo.users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="hub-row">
            <Button variant="secondary" onClick={() => advance(1)}>
              Advance the clock one day
            </Button>
            <Button variant="secondary" onClick={() => advance(7)}>
              Advance one week
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function AccountPage() {
  usePageTitle('Account')
  const profile = useProfile()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: apiQueryKey(authPaths.me) })
    toast({ title: 'Profile refreshed', variant: 'success', duration: 2500 })
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Account"
        description="Who you are signed in as, how the app looks, and signing out."
      />
      <div className="hub-stack">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{profile.displayName ?? profile.email ?? 'Signed in'}</CardTitle>
            <CardDescription>{profile.email ?? 'No email on this account'}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="hub-stack-sm" style={{ margin: 0 }}>
              <div>
                <dt className="hub-muted">Roles</dt>
                <dd style={{ margin: 0 }} className="hub-row">
                  {profile.roles.map((role) => (
                    <Badge key={role} variant={role === 'ADMIN' ? 'accent' : 'neutral'}>
                      {role}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="hub-muted">User ID</dt>
                <dd style={{ margin: 0 }} className="hub-row">
                  <span className="hub-mono">{profile.id}</span>
                  <CopyButton value={profile.id} label="Copy user ID" />
                </dd>
              </div>
              <div>
                <dt className="hub-muted">Sign-in ID</dt>
                <dd style={{ margin: 0 }} className="hub-mono">
                  {user?.uid}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Appearance</CardTitle>
            <CardDescription>Follow your device, or pick light or dark.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSelect showLabel={false} />
          </CardContent>
        </Card>

        <DemoTools />

        <div className="hub-row">
          <Button variant="secondary" onClick={() => void refresh()}>
            Refresh profile
          </Button>
          <Button variant="danger" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </>
  )
}

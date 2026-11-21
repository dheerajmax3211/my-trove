import { useAuth } from '@platform/auth-web'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { scopeName } from '../../components/ScopeSelect'
import { formatDateTime, formatRelative } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'
import { useRuntime } from '../../runtime/context'
import { actionLabel, describeDetails } from '../activity/describe'
import { useAudit } from '../activity/hooks'
import { useHouseholds } from '../households/hooks'
import { describeRecurrence } from '../reminders/recurrence'
import { useReminders } from '../reminders/hooks'
import { useProfile } from '../session/profile'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function Launcher() {
  const { apps } = useRuntime()
  return (
    <section aria-labelledby="launcher-heading" className="hub-stack-sm">
      <h2 id="launcher-heading" className="hub-h2">
        Your apps
      </h2>
      <div className="hub-grid">
        {apps.map((app) => (
          <Card key={app.id} interactive className="hub-launcher-card">
            <CardHeader>
              <CardTitle as="h3">
                <a href={app.url}>{app.name}</a>
              </CardTitle>
              <CardDescription>{app.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="hub-muted">Opens in this tab</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function UpcomingReminders() {
  const { now } = useRuntime()
  const reminders = useReminders({ status: 'ACTIVE' })
  const households = useHouseholds()
  const upcoming = reminders.data?.slice(0, 5) ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Upcoming reminders</CardTitle>
        <CardDescription>The next things due, across you and your households.</CardDescription>
      </CardHeader>
      <CardContent>
        {reminders.isPending ? (
          <div className="hub-stack-sm" aria-busy="true" aria-label="Loading reminders">
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={18} />
          </div>
        ) : reminders.isError ? (
          <ErrorState
            error={reminders.error}
            onRetry={() => void reminders.refetch()}
            headingAs="h3"
          />
        ) : upcoming.length === 0 ? (
          <EmptyState
            headingAs="h3"
            title="Nothing due"
            description="Add a reminder and it will show up here."
            action={
              <Button asChild>
                <Link to="/reminders">Add a reminder</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul className="hub-list">
              {upcoming.map((r) => (
                <li key={r.id}>
                  <strong>{r.title}</strong>
                  <span className="hub-muted">
                    {formatDateTime(r.dueAt)} ({formatRelative(r.dueAt, now())}) ·{' '}
                    {scopeName(r.householdId, households.data ?? [])} ·{' '}
                    {describeRecurrence(r.recurrence)}
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/reminders">All reminders</Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RecentActivity() {
  const { user } = useAuth()
  const audit = useAudit({ size: 5 })
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Recent activity</CardTitle>
        <CardDescription>
          Your latest personal actions. Household activity has its own view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {audit.isPending ? (
          <div className="hub-stack-sm" aria-busy="true" aria-label="Loading activity">
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={18} />
          </div>
        ) : audit.isError ? (
          <ErrorState error={audit.error} onRetry={() => void audit.refetch()} headingAs="h3" />
        ) : audit.data.items.length === 0 ? (
          <EmptyState
            headingAs="h3"
            title="No activity yet"
            description="Personal reminders and files you add will be listed here."
            action={
              <Button variant="secondary" asChild>
                <Link to="/activity">Open activity</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul className="hub-list">
              {audit.data.items.map((e) => (
                <li key={e.id}>
                  <strong>
                    {e.actorUid === user?.uid ? 'You' : e.actorUid}: {actionLabel(e.action)}
                  </strong>
                  <span className="hub-muted">
                    {formatDateTime(e.createdAt)}
                    {describeDetails(e) ? ` · ${describeDetails(e)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/activity">All activity</Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function HomePage() {
  usePageTitle('Home')
  const profile = useProfile()
  const { now } = useRuntime()
  const name = (profile.displayName ?? profile.email ?? 'there').split(' ')[0]
  return (
    <>
      <PageHeader
        eyebrow="Home"
        title={`${greeting(new Date(now()).getHours())}, ${name}`}
        description={
          <span className="hub-row">
            <span>Your roles:</span>
            {profile.roles.map((role) => (
              <Badge key={role} variant={role === 'ADMIN' ? 'accent' : 'neutral'}>
                {role}
              </Badge>
            ))}
          </span>
        }
      />
      <div className="hub-stack">
        <Launcher />
        <div className="hub-two-col">
          <UpcomingReminders />
          <RecentActivity />
        </div>
      </div>
    </>
  )
}

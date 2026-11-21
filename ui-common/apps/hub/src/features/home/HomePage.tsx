import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ProductMark,
  type ProductMarkId,
} from '@platform/ui'
import { useRuntime } from '../../runtime/context'
import { OverviewPage } from '../overview/OverviewPage'
import { useProfile } from '../session/profile'

/** Standalone only: links to the six product apps, which the workspace replaces with its own launcher. */
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
              <span className="hub-launcher-mark">
                <ProductMark product={app.id as ProductMarkId} size={36} />
              </span>
              <CardTitle as="h3">
                <a href={app.url}>{app.name}</a>
              </CardTitle>
              <CardDescription>{app.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  )
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The standalone hub's home: a greeting, the household overview, and the product launcher underneath. */
export function HomePage() {
  const profile = useProfile()
  const { now } = useRuntime()
  const name = (profile.displayName ?? profile.email ?? 'there').split(' ')[0]
  return (
    <OverviewPage
      header={{
        title: `${greeting(new Date(now()).getHours())}, ${name}`,
        description: (
          <span className="hub-row">
            <span>Your roles:</span>
            {profile.roles.map((role) => (
              <Badge key={role} variant={role === 'ADMIN' ? 'accent' : 'neutral'}>
                {role}
              </Badge>
            ))}
          </span>
        ),
      }}
      footer={<Launcher />}
    />
  )
}

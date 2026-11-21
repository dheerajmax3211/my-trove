import { Card, CardDescription, CardHeader, CardTitle, ProductMark, type ProductMarkId } from '@platform/ui'
import { useRuntime } from '../../runtime/context'
import { OverviewPage } from '../overview/OverviewPage'

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

/** The standalone hub's home: the household overview, with the product launcher underneath. */
export function HomePage() {
  return <OverviewPage footer={<Launcher />} />
}

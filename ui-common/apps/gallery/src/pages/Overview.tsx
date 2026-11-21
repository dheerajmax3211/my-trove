import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { componentDocs } from '../registry'

export function Overview() {
  return (
    <>
      <PageHeader
        eyebrow="Platform UI"
        title="Calm, high-contrast components"
        description="The shared design system for every product web app: tokens, accessible components, Firebase auth and a typed API client. Each component below is shown in light and dark with live controls."
        actions={
          <Button asChild>
            <Link to="/demo">Open the signed-in demo</Link>
          </Button>
        }
      />
      <div className="pg-stack">
        <div className="pg-grid">
          <Card>
            <CardHeader>
              <CardTitle>@platform/tokens</CardTitle>
              <CardDescription>Color, type, spacing, radius, shadow, motion.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/tokens">Browse tokens and contrast ratios</Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>@platform/ui</CardTitle>
              <CardDescription>{componentDocs.length} documented components.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to={`/components/${componentDocs[0]?.slug ?? 'button'}`}>
                Start with Button
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>@platform/auth-web + api-client</CardTitle>
              <CardDescription>
                Firebase auth, Bearer tokens, 401 refresh, problem+json errors.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/demo">See them wired together</Link>
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="all-components">
          <h2 id="all-components" className="pg-h2">
            All components
          </h2>
          <div className="row-wrap">
            {componentDocs.map((doc) => (
              <Link key={doc.slug} to={`/components/${doc.slug}`}>
                <Badge variant="neutral">{doc.title}</Badge>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

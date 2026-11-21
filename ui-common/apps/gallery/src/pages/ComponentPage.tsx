import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Button,
} from '@platform/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Playground } from '../components/Playground'
import { componentDocs } from '../registry'

function ResponsivePreview() {
  const [width, setWidth] = useState<'desktop' | 'mobile'>('mobile')
  return (
    <section aria-labelledby="responsive-preview" className="pg-stack">
      <h2 id="responsive-preview" className="pg-h2">
        Responsive preview
      </h2>
      <div className="row-wrap">
        <Button
          size="sm"
          variant={width === 'mobile' ? 'primary' : 'secondary'}
          aria-pressed={width === 'mobile'}
          onClick={() => setWidth('mobile')}
        >
          Mobile (375px)
        </Button>
        <Button
          size="sm"
          variant={width === 'desktop' ? 'primary' : 'secondary'}
          aria-pressed={width === 'desktop'}
          onClick={() => setWidth('desktop')}
        >
          Desktop
        </Button>
      </div>
      <div className="frame-wrap">
        <iframe
          className="frame"
          title="AppShell responsive preview"
          src="#/preview"
          style={{ maxWidth: width === 'mobile' ? 375 : '100%' }}
        />
      </div>
    </section>
  )
}

export function ComponentPage() {
  const { slug } = useParams()
  const doc = componentDocs.find((d) => d.slug === slug)

  if (!doc) {
    return (
      <EmptyState
        title="Component not found"
        description={`There is no documented component called "${slug ?? ''}".`}
        action={
          <Button asChild>
            <Link to="/">Back to overview</Link>
          </Button>
        }
      />
    )
  }

  return (
    <>
      <PageHeader eyebrow="Component" title={doc.title} description={doc.description} />
      <div className="pg-stack">
        <Playground
          key={doc.slug}
          controls={doc.controls}
          render={doc.render}
          {...(doc.block !== undefined ? { block: doc.block } : {})}
        />
        {doc.slug === 'app-shell' ? <ResponsivePreview /> : null}
        <div className="pg-grid">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="pg-code">
                <code>{doc.usage}</code>
              </pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">
                Accessibility <Badge variant="success">tested</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="pg-notes">
                {doc.a11y.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

import { productIds, productNames, productVar, type ProductId } from '@platform/tokens'
import {
  ArrowRightIcon,
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Illustration,
  KeyCut,
  Logo,
  PersonaBadge,
  ProductMark,
  Section,
  SectionHeader,
  Stat,
  Timeline,
  type IllustrationName,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { componentDocs } from '../registry'

const tagline: Record<ProductId, string> = {
  'waiting-on': 'Follow-ups and who still owes you',
  consent: 'Decide what each app may see',
  'home-pulse': 'Power, water and air at home',
  'ask-your-life': 'Ask questions of your own records',
  'digital-legacy': 'A sealed vault for what you hand on',
  'family-treasury': 'The household ledger',
}

const art: { name: IllustrationName; caption: string }[] = [
  { name: 'empty', caption: 'Nothing here yet' },
  { name: 'search', caption: 'No results' },
  { name: 'letter', caption: 'Waiting for a reply' },
  { name: 'key', caption: 'Access, scoped' },
  { name: 'allClear', caption: 'All caught up' },
  { name: 'locked', caption: 'Not for you' },
]

const palette = [
  { name: 'Paper', token: 'canvas', note: 'the page' },
  { name: 'Card', token: 'surface', note: 'raised paper' },
  { name: 'Ink', token: 'text', note: 'text' },
  { name: 'Patina', token: 'accent', note: 'trust, actions' },
  { name: 'Brass', token: 'brass', note: 'what is lent or sealed' },
  { name: 'Vault', token: 'vault', note: 'depth, sidebar, hero' },
]

export function Overview() {
  return (
    <div className="pg-stack ov">
      <Section
        tone="vault"
        container={false}
        pattern="rings"
        size="md"
        className="ov-hero"
        aria-labelledby="ov-title"
      >
        <div className="ov-hero-inner">
          <Logo size="md" />
          <SectionHeader
            as="h1"
            scale="hero"
            headingId="ov-title"
            eyebrow="Design language"
            title="A vault you can lend from"
            description="My-Trove keeps a household's life data safe and lets you hand out exactly as much as you mean to. The interface is calm, confident and precise: a grey canvas, white cards, one black card, and lime and lilac for what matters."
            actions={
              <>
                <Button asChild size="lg">
                  <Link to="/tokens">See the tokens</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/demo">Open the signed-in demo</Link>
                </Button>
              </>
            }
          />
          <ul className="ov-marks" aria-label="Products">
            {productIds.map((id) => (
              <li key={id} data-product={id}>
                <ProductMark product={id} variant="solid" size={44} />
                <span className="ov-mark-name">{productNames[id]}</span>
                <span className="ov-mark-note">{tagline[id]}</span>
              </li>
            ))}
          </ul>
        </div>
        <KeyCut className="ov-keycut" />
      </Section>

      <section aria-labelledby="ov-palette" className="pg-stack">
        <SectionHeader
          scale="md"
          headingId="ov-palette"
          title="Paper, ink, patina and brass"
          description="Stone-green paper, near-black green ink, a patina accent for anything you can act on, brass held back for what is lent or sealed, and a dark vault that stays dark in both themes."
        />
        <ul className="ov-palette">
          {palette.map((p) => (
            <li key={p.token}>
              <span
                className="ov-chip"
                style={{ background: `var(--pp-color-${p.token})` }}
                aria-hidden="true"
              />
              <strong>{p.name}</strong>
              <span className="pg-muted">{p.note}</span>
            </li>
          ))}
        </ul>
        <ul className="ov-accents" aria-label="Product accents">
          {productIds.map((id) => (
            <li key={id}>
              <span
                className="ov-accent-chip"
                style={{ background: productVar(id), color: productVar(id, 'on') }}
              >
                Aa
              </span>
              <span
                className="ov-accent-chip"
                style={{ background: productVar(id, 'subtle'), color: productVar(id, 'text') }}
              >
                Aa
              </span>
              <span>{productNames[id]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ov-type" className="ov-type">
        <div>
          <SectionHeader
            scale="md"
            headingId="ov-type"
            title="A display serif and a quiet sans"
            description="Plus Jakarta Sans carries the whole app, set tight and medium for headlines and figures. Young Serif is the public site's editorial voice. JetBrains Mono is for ids and keys."
          />
        </div>
        <div className="ov-specimen">
          <p className="ov-spec-display">Three replies are still waiting</p>
          <p className="ov-spec-lead">
            Priya has until Friday to send the signed addendum. We will remind her on Thursday.
          </p>
          <p className="ov-spec-mono">key_01J9F3A8-7C2E · scope: read:transactions</p>
        </div>
      </section>

      <section aria-labelledby="ov-use" className="pg-stack">
        <SectionHeader scale="md" headingId="ov-use" title="In use" />
        <div className="ov-use">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>This week</CardTitle>
              <CardDescription>Across every product</CardDescription>
            </CardHeader>
            <CardContent className="ov-stats">
              <Stat
                label="Requests"
                value="1,284"
                delta="+12%"
                trend="up"
                sparkline={[12, 14, 13, 18, 16, 21, 19, 24, 22, 29, 27, 33]}
                sparklineLabel="Requests per day"
              />
              <Stat
                label="Error rate"
                value="0.4%"
                delta="-0.2 pts"
                trend="down"
                goodDirection="down"
                hint="vs. last week"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                compact
                items={[
                  {
                    id: 'a',
                    title: 'Access granted to Budget Buddy',
                    time: 'Today',
                    dateTime: '2026-11-21',
                    tone: 'brass',
                  },
                  {
                    id: 'b',
                    title: 'Reminder sent to Marcus',
                    time: 'Yesterday',
                    dateTime: '2026-11-20',
                    tone: 'warning',
                  },
                  {
                    id: 'c',
                    title: 'W-9 received',
                    time: '12 Nov',
                    dateTime: '2026-11-12',
                    tone: 'success',
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent className="stack-3">
              {[
                { name: 'Dheeraj S.', persona: 'OWNER' as const },
                { name: 'Priya Natarajan', persona: 'ADMIN' as const },
                { name: 'Marcus Webb', persona: 'MEMBER' as const },
              ].map((p) => (
                <div className="ov-person" key={p.name}>
                  <Avatar name={p.name} size="sm" decorative />
                  <span>{p.name}</span>
                  <PersonaBadge persona={p.persona} size="sm" />
                </div>
              ))}
              <Callout variant="note" title="Brass means lent or sealed">
                Used sparingly, so it stays meaningful.
              </Callout>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="ov-art" className="pg-stack">
        <SectionHeader
          scale="md"
          headingId="ov-art"
          title="Drawn from the same parts"
          description="One-weight ink, flat tints of the page palette, one brass detail each. They recolor with the theme and with the product they appear in."
        />
        <ul className="ov-art">
          {art.map((a) => (
            <li key={a.name}>
              <Illustration name={a.name} size={140} />
              <span>{a.caption}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="all-components" className="pg-stack">
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
        <p>
          <Link to={`/components/${componentDocs[0]?.slug ?? 'button'}`} className="ov-link">
            Start with Button <ArrowRightIcon size={16} />
          </Link>
        </p>
      </section>
    </div>
  )
}

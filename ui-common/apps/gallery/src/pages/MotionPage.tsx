import {
  AnimatedList,
  AnimatedListItem,
  Aurora,
  BarList,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CountUp,
  Donut,
  GlassPanel,
  GradientBorder,
  Grain,
  GridGlow,
  IndicatorGroup,
  LayoutIndicator,
  Magnetic,
  Marquee,
  PageHeader,
  Reveal,
  Skeleton,
  SpotlightCard,
  SplitText,
  Stagger,
  PlusIcon,
} from '@platform/ui'
import { useState, type ReactNode } from 'react'

const products = [
  'Waiting On',
  'Consent',
  'Home Pulse',
  'Ask Your Life',
  'Digital Legacy',
  'Family Treasury',
]

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="mo-block">
      <header>
        <h2>{title}</h2>
        <p>{note}</p>
      </header>
      {children}
    </section>
  )
}

function NavDemo() {
  const [active, setActive] = useState('Overview')
  const items = ['Overview', 'Requests', 'Keys', 'Activity']
  return (
    <IndicatorGroup id="nav-demo">
      <nav className="mo-nav" aria-label="Layout indicator demo">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className="mo-nav-item"
            aria-current={active === item ? 'page' : undefined}
            onClick={() => setActive(item)}
          >
            <LayoutIndicator
              active={active === item}
              variant="pill"
              name="nav-demo-pill"
              className="mo-pill"
            />
            <span className="mo-nav-label">{item}</span>
          </button>
        ))}
      </nav>
    </IndicatorGroup>
  )
}

function ListDemo() {
  const [items, setItems] = useState([
    { id: 1, text: 'Vendor W-9 from Sam' },
    { id: 2, text: 'Insurance renewal' },
    { id: 3, text: 'School forms' },
  ])
  const [next, setNext] = useState(4)
  return (
    <div className="mo-list-demo">
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<PlusIcon size={16} />}
        onClick={() => {
          setItems((l) => [{ id: next, text: `New request ${next}` }, ...l])
          setNext((n) => n + 1)
        }}
      >
        Add a request
      </Button>
      <AnimatedList className="mo-list">
        {items.map((item) => (
          <AnimatedListItem key={item.id} className="mo-list-item">
            <span>{item.text}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setItems((l) => l.filter((i) => i.id !== item.id))}
            >
              Remove
            </Button>
          </AnimatedListItem>
        ))}
      </AnimatedList>
    </div>
  )
}

/** Every motion primitive and surface, live, with the rule for when to use it. */
export function MotionPage() {
  const [replay, setReplay] = useState(0)
  return (
    <div className="pg-stack mo">
      <PageHeader
        eyebrow="Motion and surfaces"
        title="Moving parts"
        description="Every primitive animates transform and opacity only, starts on scroll or on a person's action, and switches itself off under reduced motion."
        actions={
          <Button variant="secondary" onClick={() => setReplay((n) => n + 1)}>
            Replay entrances
          </Button>
        }
      />

      <Block
        title="Reveal and Stagger"
        note="One orchestrated entrance per view. Children rise in 70 ms apart; nothing loops."
      >
        <Stagger key={replay} className="mo-grid" interval={0.08} distance={28}>
          {[
            'Request sent',
            'Key issued',
            'Reminder due',
            'Document sealed',
            'Access revoked',
            'Reply received',
          ].map((t) => (
            <Card key={t}>
              <CardHeader>
                <CardTitle>{t}</CardTitle>
                <CardDescription>Priya, a moment ago</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </Stagger>
        <Reveal key={`r-${replay}`} direction="left" scale={0.96} delay={0.1}>
          <p className="mo-note">A single Reveal, sliding in from the left with a soft scale.</p>
        </Reveal>
      </Block>

      <Block
        title="SplitText and CountUp"
        note="A headline that sets itself, and figures that land."
      >
        <div className="mo-split">
          <SplitText key={`s-${replay}`} as="h3" className="mo-headline" immediate>
            Your household, kept safe and lent with care.
          </SplitText>
          <div className="mo-counts">
            <div>
              <CountUp key={`c1-${replay}`} className="mo-count" value={12840} />
              <span>documents sealed</span>
            </div>
            <div>
              <CountUp
                key={`c2-${replay}`}
                className="mo-count"
                value={98.6}
                suffix="%"
                format={{ maximumFractionDigits: 1 }}
              />
              <span>on-time replies</span>
            </div>
            <div>
              <CountUp
                key={`c3-${replay}`}
                className="mo-count"
                value={3120}
                locale="en-US"
                format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
              />
              <span>spent in November</span>
            </div>
          </div>
        </div>
      </Block>

      <Block
        title="SpotlightCard and Magnetic"
        note="Hover feedback that follows the pointer: a light on the card, a pull on the button."
      >
        <div className="mo-grid">
          {['Consent', 'Waiting On', 'Family Treasury'].map((name, i) => (
            <SpotlightCard key={name} tone={i === 1 ? 'brass' : i === 2 ? 'lilac' : 'accent'}>
              <CardHeader>
                <CardTitle>{name}</CardTitle>
                <CardDescription>Move the pointer across the card.</CardDescription>
              </CardHeader>
              <CardContent>
                <Magnetic>
                  <Button variant="glow">Open {name}</Button>
                </Magnetic>
              </CardContent>
            </SpotlightCard>
          ))}
        </div>
      </Block>

      <Block
        title="Marquee"
        note="An infinite strip that pauses on hover and when it leaves the screen."
      >
        <Marquee duration={28}>
          {products.map((p) => (
            <span key={p} className="mo-chip">
              {p}
            </span>
          ))}
        </Marquee>
      </Block>

      <Block title="Shared layout indicator" note="One pill that glides between items on a spring.">
        <NavDemo />
      </Block>

      <Block title="Animated list" note="Items enter and leave without the list jumping.">
        <ListDemo />
      </Block>

      <Block title="Skeleton shimmer" note="A single light sweeps across the placeholder.">
        <div className="mo-skel">
          <Skeleton width={56} height={56} circle />
          <div style={{ flex: 1, display: 'grid', gap: 10 }}>
            <Skeleton height={16} width="60%" />
            <Skeleton height={14} />
            <Skeleton height={14} width="82%" />
          </div>
        </div>
      </Block>

      <Block
        title="Aurora, glass, grid, grain and gradient borders"
        note="Backgrounds that pause off-screen. Place the glass over something that gives it a reason."
      >
        <div className="mo-stage" data-theme="dark">
          <Aurora intensity="vivid" />
          <GridGlow />
          <Grain />
          <div className="mo-stage-inner">
            <GlassPanel glow>
              <h3 className="mo-glass-title">Glass panel</h3>
              <p className="mo-glass-text">Frosted fill, backdrop blur and a hairline edge.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                <Button variant="glow">Glow</Button>
                <Button variant="brass">Brass</Button>
                <Button variant="secondary">Secondary</Button>
              </div>
            </GlassPanel>
            <GradientBorder animated className="mo-gb">
              <div className="mo-gb-inner">Gradient border, sweeping slowly</div>
            </GradientBorder>
          </div>
        </div>
      </Block>

      <Block title="Chart primitives" note="Draw-in on scroll; values are always printed.">
        <div className="mo-grid">
          <Card>
            <CardContent>
              <BarList
                label="Spending by category"
                format={(v) => `$${v.toLocaleString()}`}
                items={[
                  { label: 'Groceries', value: 820, hint: '31 purchases' },
                  { label: 'Utilities', value: 460, hint: '6 bills', tone: 'lilac' },
                  { label: 'School', value: 310, hint: '4 items', tone: 'lime' },
                  { label: 'Other', value: 140, tone: 'brass' },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Donut
                label="Documents by status"
                size={150}
                thickness={14}
                center={<strong style={{ fontSize: 28 }}>42</strong>}
                segments={[
                  { label: 'Sealed', value: 24 },
                  { label: 'Shared', value: 11 },
                  { label: 'Draft', value: 7 },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </Block>
    </div>
  )
}

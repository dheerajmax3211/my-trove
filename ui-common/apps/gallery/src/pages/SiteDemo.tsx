import { productIds, productNames, type ProductId } from '@platform/tokens'
import {
  ArrowRightIcon,
  Aurora,
  Button,
  CloseIcon,
  CountUp,
  GridGlow,
  Grain,
  Logo,
  Magnetic,
  Marquee,
  Parallax,
  PauseIcon,
  PlayIcon,
  ProductMark,
  Reveal,
  ScrollProgress,
  SmoothScroll,
  SpotlightCard,
  SplitText,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useScrollSmooth,
  useScrollStory,
} from '@platform/ui'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './site.css'

const pitch: Record<ProductId, { line: string; body: string }> = {
  'waiting-on': {
    line: 'Know who still owes you.',
    body: 'Follow-ups that remind people for you, and stop when the thing arrives.',
  },
  consent: {
    line: 'Decide what each app may see.',
    body: 'Lend one record to one app, for as long as you choose. End it in a tap.',
  },
  'home-pulse': {
    line: 'Hear the house before it breaks.',
    body: 'Power, water and air, read quietly, with a word when something drifts.',
  },
  'ask-your-life': {
    line: 'Ask your own records.',
    body: 'Questions answered from your documents, with the page it came from.',
  },
  'digital-legacy': {
    line: 'Hand on what matters.',
    body: 'A sealed vault that opens for the people you name, when you say so.',
  },
  'family-treasury': {
    line: 'One ledger for the household.',
    body: 'Spending, subscriptions and who paid, without a spreadsheet.',
  },
}

function Announcement({ onClose }: { onClose: () => void }) {
  // Time-boxed: render only until the end date. Real sites read this from config.
  const [live] = useState(() => new Date() <= new Date('2026-12-31T23:59:59'))
  if (!live) return null
  return (
    <div className="site-announce" role="region" aria-label="Announcement">
      <p>
        New: Consent now lends a document for as little as one hour. <a href="#showcase">See how</a>
      </p>
      <button type="button" aria-label="Dismiss announcement" onClick={onClose}>
        <CloseIcon size={16} />
      </button>
    </div>
  )
}

function Story() {
  const ref = useRef<HTMLDivElement>(null)
  useScrollStory(ref, ({ gsap, root }) => {
    const track = root.querySelector<HTMLElement>('[data-track]')
    if (!track) return
    const distance = () => track.scrollWidth - root.clientWidth
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: root,
        pin: true,
        scrub: 0.6,
        start: 'top top',
        end: () => `+=${distance()}`,
        invalidateOnRefresh: true,
      },
    })
  })
  const steps = [
    ['Keep', 'Everything the house needs to remember goes into one vault, sealed with your key.'],
    ['Lend', 'Hand one document to one person or app, for as long as you choose.'],
    ['Know', 'See who opened what and when. Close access with a tap, whenever you like.'],
    ['Hand on', 'Name the people who inherit the vault, and the day it opens for them.'],
  ] as const
  return (
    <section ref={ref} className="site-story" aria-labelledby="story-title">
      <h2 id="story-title" className="site-story-title">
        How it works
      </h2>
      <div className="site-story-track" data-track>
        {steps.map(([title, body], i) => (
          <article key={title} className="site-story-panel">
            <span className="site-story-index" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function Landing() {
  const [playing, setPlaying] = useState(true)
  const [banner, setBanner] = useState(true)
  const [tab, setTab] = useState<ProductId>('consent')
  const { scrollTo } = useScrollSmooth()
  return (
    <div className="site" data-theme="dark" data-surface="vault">
      <ScrollProgress />
      {banner ? <Announcement onClose={() => setBanner(false)} /> : null}
      <header className="site-header">
        <Link to="/" aria-label="My-Trove, home">
          <Logo size="md" tone="inverse" title="" />
        </Link>
        <nav aria-label="Primary" className="site-nav">
          <a href="#showcase">Products</a>
          <a href="#story">How it works</a>
          <a href="#catalog">Catalog</a>
        </nav>
        <Button size="sm" variant="glow">
          Get started
        </Button>
      </header>

      <section className="site-hero" aria-labelledby="hero-title">
        <Aurora intensity="vivid" animated={playing} palette="brand" />
        <GridGlow fade="spot" />
        <Grain opacity={0.09} />
        <Parallax distance={-80} className="site-hero-orb">
          <div aria-hidden="true" />
        </Parallax>
        <div className="site-hero-inner">
          <Reveal direction="none" duration={1}>
            <p className="site-kicker">
              <span className="site-dot" aria-hidden="true" /> A vault you can lend from
            </p>
          </Reveal>
          <SplitText as="h1" id="hero-title" className="site-h1" immediate delay={0.15}>
            Keep it safe. Lend it with care.
          </SplitText>
          <Reveal delay={0.7} className="site-lead">
            <p>
              My-Trove holds your household&apos;s documents, keys and records, and lets you hand
              out exactly as much as you mean to.
            </p>
          </Reveal>
          <Reveal delay={0.9} className="site-cta">
            <Magnetic>
              <Button size="lg" variant="glow" rightIcon={<ArrowRightIcon size={18} />}>
                Open your vault
              </Button>
            </Magnetic>
            <Button size="lg" variant="secondary">
              Watch it work
            </Button>
          </Reveal>
        </div>
        <div className="site-hero-foot">
          <button type="button" className="site-cue" onClick={() => scrollTo('#showcase')}>
            Scroll to explore
            <span className="site-cue-line" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="site-play"
            aria-pressed={!playing}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            <span>{playing ? 'Pause motion' : 'Play motion'}</span>
          </button>
        </div>
      </section>

      <div className="site-strip">
        <Marquee duration={40}>
          {[
            'Bank statements',
            'Insurance',
            'Tax records',
            'Property deeds',
            'School forms',
            'Wills',
            'Warranties',
            'Medical letters',
          ].map((t) => (
            <span key={t} className="site-strip-item">
              {t}
            </span>
          ))}
        </Marquee>
      </div>

      <section id="showcase" className="site-section" aria-labelledby="showcase-title">
        <Reveal>
          <h2 id="showcase-title" className="site-h2">
            Six products. One vault.
          </h2>
        </Reveal>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ProductId)}>
          <TabsList aria-label="Products">
            {productIds.map((id) => (
              <TabsTrigger key={id} value={id}>
                {productNames[id]}
              </TabsTrigger>
            ))}
          </TabsList>
          {productIds.map((id) => (
            <TabsContent key={id} value={id}>
              <div className="site-showcase" data-product={id}>
                <div className="site-showcase-copy">
                  <ProductMark product={id} size={56} variant="solid" />
                  <h3>{pitch[id].line}</h3>
                  <p>{pitch[id].body}</p>
                  <Button variant="glow" rightIcon={<ArrowRightIcon size={18} />}>
                    Explore {productNames[id]}
                  </Button>
                </div>
                <div className="site-showcase-art" aria-hidden="true">
                  <Aurora palette={id === 'waiting-on' ? 'warm' : 'cool'} intensity="medium" />
                  <Grain />
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <Story />

      <section id="catalog" className="site-section" aria-labelledby="catalog-title">
        <Reveal>
          <h2 id="catalog-title" className="site-h2">
            Choose what you need
          </h2>
        </Reveal>
        <ol className="site-cards">
          {productIds.map((id, i) => (
            <Reveal as="li" key={id} delay={(i % 3) * 0.08} distance={36}>
              <SpotlightCard tilt={0} className="site-card" data-product={id}>
                <a href={`#${id}`} className="site-card-link">
                  <span className="site-card-num" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <ProductMark product={id} size={44} variant="solid" />
                  <span className="site-card-name">{productNames[id]}</span>
                  <span className="site-card-line">{pitch[id].line}</span>
                  <span className="site-card-go" aria-hidden="true">
                    <ArrowRightIcon size={18} />
                  </span>
                </a>
              </SpotlightCard>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="site-section site-numbers" aria-label="In numbers">
        {[
          [12840, 'documents sealed', ''],
          [98, 'on-time replies', '%'],
          [6, 'products, one vault', ''],
        ].map(([n, label, suffix]) => (
          <div key={String(label)}>
            <CountUp value={Number(n)} suffix={String(suffix)} className="site-num" />
            <p>{label}</p>
          </div>
        ))}
      </section>

      <footer className="site-footer">
        <Logo size="sm" tone="inverse" title="My-Trove" />
        <p>Built to be lent from, never to be lost.</p>
      </footer>
    </div>
  )
}

/** The public site direction: a dark, cinematic page with generative motion in place of video. */
export function SiteDemo() {
  return (
    <SmoothScroll>
      <Landing />
    </SmoothScroll>
  )
}

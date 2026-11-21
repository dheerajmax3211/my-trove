import { productIds, productNames } from '@platform/tokens'
import * as UI from '@platform/ui'
import {
  Avatar,
  Button,
  Callout,
  CommandPalette,
  Container,
  Illustration,
  KeyCut,
  KeyValueList,
  Logo,
  PersonaBadge,
  ProductMark,
  Section,
  SectionHeader,
  Sparkline,
  Stat,
  Stepper,
  Timeline,
  personas,
  type AvatarSize,
  type CalloutVariant,
  type CommandItem,
  type IllustrationName,
  type LogoSize,
  type LogoTone,
  type LogoVariant,
  type ProductMarkId,
  type ProductMarkVariant,
  type SectionPattern,
  type SectionSize,
  type SectionTone,
  type StatTrend,
} from '@platform/ui'
import { useState, type ReactNode } from 'react'
import type { ComponentDoc } from './index'

const markIds = [...productIds, 'core', 'admin'] as const

function CommandPaletteDemo() {
  const [open, setOpen] = useState(false)
  const [last, setLast] = useState('Nothing run yet')
  const run = (label: string) => () => setLast(`Ran: ${label}`)
  const items: CommandItem[] = [
    { id: 'today', label: 'Today', group: 'Go to', hint: 'Home', onSelect: run('Today') },
    {
      id: 'waiting',
      label: 'Waiting On',
      group: 'Go to',
      keywords: ['follow up', 'requests'],
      onSelect: run('Waiting On'),
    },
    {
      id: 'consent',
      label: 'Consent',
      group: 'Go to',
      keywords: ['access', 'permissions'],
      onSelect: run('Consent'),
    },
    {
      id: 'account',
      label: 'Account',
      group: 'Go to',
      keywords: ['settings', 'profile'],
      onSelect: run('Account'),
    },
    {
      id: 'new-request',
      label: 'New request',
      group: 'Actions',
      hint: 'Waiting On',
      onSelect: run('New request'),
    },
    {
      id: 'grant',
      label: 'Grant access to an app',
      group: 'Actions',
      hint: 'Consent',
      onSelect: run('Grant access'),
    },
    { id: 'theme', label: 'Switch theme', group: 'Actions', onSelect: run('Switch theme') },
  ]
  return (
    <div className="stack-3">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open palette
      </Button>
      <p className="pg-muted" role="status">
        {last}
      </p>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={items}
        placeholder="Jump to a page or run an action"
      />
    </div>
  )
}

const allIcons = Object.entries(UI)
  .filter(([name]) => name.endsWith('Icon') && name !== 'IconButton')
  .sort(([a], [b]) => a.localeCompare(b)) as [string, (props: { size?: number }) => ReactNode][]

const demoSeries = [12, 14, 13, 18, 16, 21, 19, 24, 22, 29, 27, 33, 31, 38]

export const identityDocs: readonly ComponentDoc[] = [
  {
    slug: 'logo',
    title: 'Logo',
    description:
      'The My-Trove mark and wordmark as SVG. A vault-green tile with a brass keyhole whose stem is cut like a key bit. Three tones, four sizes, mark-only and wordmark-only variants.',
    controls: [
      { name: 'variant', type: 'select', options: ['full', 'mark', 'wordmark'], default: 'full' },
      { name: 'tone', type: 'select', options: ['color', 'mono', 'inverse'], default: 'color' },
      { name: 'size', type: 'select', options: ['sm', 'md', 'lg', 'xl'], default: 'lg' },
    ],
    render: (v) => (
      <div
        data-surface={v.tone === 'inverse' ? 'vault' : undefined}
        style={{ padding: 20, borderRadius: 12, width: '100%' }}
      >
        <Logo
          variant={v.variant as LogoVariant}
          tone={v.tone as LogoTone}
          size={v.size as LogoSize}
        />
      </div>
    ),
    a11y: [
      'role="img" with the title "My-Trove" by default; pass title="" to hide it when the name is written beside it.',
      'Forced-colors mode swaps to system colors.',
    ],
    usage: `<Logo size="lg" />\n<Logo variant="mark" tone="mono" />\n<Logo tone="inverse" /> {/* on vault surfaces */}`,
  },
  {
    slug: 'product-mark',
    title: 'ProductMark',
    description:
      'One glyph and one accent per product. Always uses the product’s own colors, so a list of products keeps six identities. core and admin cover the workspace modules.',
    controls: [
      { name: 'product', type: 'select', options: markIds, default: 'consent' },
      { name: 'variant', type: 'select', options: ['tile', 'solid', 'glyph'], default: 'tile' },
      { name: 'size', type: 'number', default: 48, min: 16, max: 96 },
    ],
    render: (v) => (
      <>
        <ProductMark
          product={v.product as ProductMarkId}
          variant={v.variant as ProductMarkVariant}
          size={Number(v.size)}
          title={String(v.product)}
        />
        <div className="row-wrap" style={{ width: '100%' }}>
          {markIds.map((id) => (
            <ProductMark
              key={id}
              product={id}
              variant={v.variant as ProductMarkVariant}
              size={36}
              title={id in productNames ? productNames[id as keyof typeof productNames] : id}
            />
          ))}
        </div>
      </>
    ),
    a11y: ['Decorative unless you pass title, which sets role="img" and the accessible name.'],
    usage: `<ProductMark product="waiting-on" size={40} />\n<ProductMark product="consent" variant="solid" title="Consent" />`,
  },
  {
    slug: 'section',
    title: 'Section',
    description:
      'A full-width band of a page with its own tone, rhythm and pattern. Hero-capable: size="hero" with pattern="rings" is the front-door opener. SectionHeader sets eyebrow, headline, standfirst and actions.',
    block: true,
    controls: [
      {
        name: 'tone',
        type: 'select',
        options: ['plain', 'paper', 'sunken', 'vault'],
        default: 'vault',
      },
      { name: 'size', type: 'select', options: ['sm', 'md', 'lg', 'hero'], default: 'sm' },
      { name: 'pattern', type: 'select', options: ['none', 'rings', 'keycut'], default: 'rings' },
    ],
    render: (v) => (
      <div style={{ margin: -20 }}>
        <Section
          tone={v.tone as SectionTone}
          size={v.size as SectionSize}
          pattern={v.pattern as SectionPattern}
          aria-label="Section example"
        >
          <SectionHeader
            eyebrow="Waiting On"
            title="Know who still owes you a reply"
            description="Follow-ups, due dates and nudges in one calm list."
            actions={<Button>Open the workspace</Button>}
            scale="md"
          />
        </Section>
      </div>
    ),
    a11y: [
      'Renders a <section>; give it aria-label or aria-labelledby to make it a named landmark.',
      'Patterns are decorative and hidden from assistive tech; the dial turn is skipped under reduced motion.',
    ],
    usage: `<Section tone="vault" size="hero" pattern="rings" aria-labelledby="hero-title">\n  <SectionHeader as="h1" scale="hero" headingId="hero-title" title="..." />\n</Section>`,
  },
  {
    slug: 'container',
    title: 'Container',
    description:
      'Centered page width with responsive gutters (16, 24, 40px). Four widths: narrow for reading, content for pages, wide for galleries, full.',
    block: true,
    controls: [
      {
        name: 'size',
        type: 'select',
        options: ['narrow', 'content', 'wide', 'full'],
        default: 'narrow',
      },
    ],
    render: (v) => (
      <Container
        size={v.size as 'narrow' | 'content' | 'wide' | 'full'}
        style={{ padding: 0, background: 'var(--pp-color-accent-subtle)', borderRadius: 8 }}
      >
        <p style={{ padding: 16 }}>
          Content column: {String(v.size)}. Resize the window to see it track the viewport.
        </p>
      </Container>
    ),
    a11y: ['Layout only. Pass as="main" | "article" | "nav" to choose the element.'],
    usage: `<Container size="narrow" as="article">...</Container>`,
  },
  {
    slug: 'stat',
    title: 'Stat',
    description:
      'A number with its context: label, change, optional trend line. The figure is set in the display face with lining tabular numerals.',
    controls: [
      { name: 'label', type: 'text', default: 'Requests this week' },
      { name: 'value', type: 'text', default: '1,284' },
      { name: 'delta', type: 'text', default: '+12%' },
      { name: 'trend', type: 'select', options: ['up', 'down', 'flat'], default: 'up' },
      { name: 'goodDirection', type: 'select', options: ['up', 'down'], default: 'up' },
      { name: 'sparkline', type: 'boolean', default: true },
    ],
    render: (v) => (
      <div style={{ width: '100%', maxWidth: 320 }}>
        <Stat
          label={String(v.label)}
          value={String(v.value)}
          delta={String(v.delta)}
          trend={v.trend as StatTrend}
          goodDirection={v.goodDirection as 'up' | 'down'}
          hint="vs. last week"
          {...(v.sparkline ? { sparkline: demoSeries, sparklineLabel: 'Requests per day' } : {})}
        />
      </div>
    ),
    a11y: [
      'A role="group" labelled by its label; the change is spoken as "Up, +12%" so the arrow and color are never the only signal.',
    ],
    usage: `<Stat label="Error rate" value="0.4%" delta="-0.2 pts" trend="down" goodDirection="down" />`,
  },
  {
    slug: 'sparkline',
    title: 'Sparkline',
    description:
      'A word-sized trend line with an optional area and end dot. Draws in once when animate is set, and not at all under reduced motion.',
    controls: [
      {
        name: 'tone',
        type: 'select',
        options: ['accent', 'success', 'danger', 'muted', 'brass'],
        default: 'accent',
      },
      { name: 'area', type: 'boolean', default: true },
      { name: 'showLast', type: 'boolean', default: true },
      { name: 'animate', type: 'boolean', default: false },
    ],
    render: (v) => (
      <Sparkline
        data={demoSeries}
        width={220}
        height={56}
        tone={v.tone as 'accent'}
        area={Boolean(v.area)}
        showLast={Boolean(v.showLast)}
        animate={Boolean(v.animate)}
        label="Requests per day, last 14 days"
      />
    ),
    a11y: [
      'Hidden from AT unless you pass label, then role="img".',
      'The draw-in animation is disabled when prefers-reduced-motion is set.',
    ],
    usage: `<Sparkline data={[3, 5, 4, 8]} label="Requests per day" />`,
  },
  {
    slug: 'avatar',
    title: 'Avatar',
    description:
      'A person, as an image or as initials on one of the six product tints chosen from the name, so a list of people has variety without a new palette.',
    controls: [
      { name: 'name', type: 'text', default: 'Priya Natarajan' },
      { name: 'size', type: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl'], default: 'lg' },
      { name: 'shape', type: 'select', options: ['circle', 'square'], default: 'circle' },
    ],
    render: (v) => (
      <>
        <Avatar name={String(v.name)} size={v.size as AvatarSize} shape={v.shape as 'circle'} />
        {['Marcus Webb', 'Aiko Tanaka', 'sam@example.com', 'Dee'].map((n) => (
          <Avatar key={n} name={n} size="md" shape={v.shape as 'circle'} />
        ))}
      </>
    ),
    a11y: [
      'role="img" named after the person; pass decorative when the name is written next to it.',
      'A broken image URL falls back to initials.',
    ],
    usage: `<Avatar name="Priya Natarajan" src={url} size="md" />`,
  },
  {
    slug: 'persona-badge',
    title: 'PersonaBadge',
    description:
      'Who someone is on the platform. Each persona has a glyph and a tint: Owner is brass, Admin patina, Developer blue, Member neutral, Auditor ochre.',
    controls: [
      { name: 'size', type: 'select', options: ['sm', 'md'], default: 'md' },
      { name: 'hideIcon', type: 'boolean', default: false },
    ],
    render: (v) => (
      <>
        {personas.map((p) => (
          <PersonaBadge
            key={p}
            persona={p}
            size={v.size as 'sm' | 'md'}
            hideIcon={Boolean(v.hideIcon)}
          />
        ))}
      </>
    ),
    a11y: ['The persona name is always text; glyph and color only reinforce it.'],
    usage: `<PersonaBadge persona="OWNER" />`,
  },
  {
    slug: 'stepper',
    title: 'Stepper',
    description:
      'Progress through a wizard or onboarding. Each step states done, current or ahead in text; completed steps can be clickable to go back. Horizontal collapses to vertical on phones.',
    block: true,
    controls: [
      { name: 'current', type: 'number', default: 1, min: 0, max: 4 },
      {
        name: 'orientation',
        type: 'select',
        options: ['horizontal', 'vertical'],
        default: 'horizontal',
      },
    ],
    render: (v) => (
      <Stepper
        current={Number(v.current)}
        orientation={v.orientation as 'horizontal'}
        onStepSelect={() => undefined}
        steps={[
          { id: 'welcome', label: 'Welcome' },
          { id: 'pin', label: 'Pin products', description: 'Choose what you use daily' },
          { id: 'tips', label: 'Quick tips' },
          { id: 'done', label: 'Done' },
        ]}
      />
    ),
    a11y: [
      'An ordered list named "Progress"; the current step has aria-current="step".',
      'Hidden status text: Completed, Current step, Not started.',
    ],
    usage: `<Stepper current={1} steps={[{ id: 'a', label: 'Account' }, ...]} onStepSelect={setStep} />`,
  },
  {
    slug: 'command-palette',
    title: 'CommandPalette',
    description:
      'A keyboard-first launcher. Controlled: you own open state and the hotkey (useHotkey("mod+k", ...)). Arrow keys move, Enter runs, Escape closes, typing filters across label, hint, group and keywords.',
    controls: [],
    render: () => <CommandPaletteDemo />,
    a11y: [
      'A modal dialog containing a combobox + listbox with aria-activedescendant.',
      'Focus is trapped while open and returns to the element that had it when closed.',
      'A polite live region announces the result count; scrolling the active option respects reduced motion.',
    ],
    usage: `useHotkey('mod+k', () => setOpen(true))\n<CommandPalette open={open} onOpenChange={setOpen} items={[{ id: 'home', label: 'Today', group: 'Go to', onSelect: goHome }]} />`,
  },
  {
    slug: 'callout',
    title: 'Callout',
    description:
      'An in-page message with a title, body and optional action. Five variants; warning and danger announce themselves.',
    block: true,
    controls: [
      {
        name: 'variant',
        type: 'select',
        options: ['info', 'success', 'warning', 'danger', 'note'],
        default: 'info',
      },
      { name: 'title', type: 'text', default: 'Access is read-only' },
    ],
    render: (v) => (
      <Callout
        variant={v.variant as CalloutVariant}
        title={String(v.title)}
        action={
          <Button size="sm" variant="secondary">
            Review access
          </Button>
        }
      >
        Only the owner can change who can see this household. Ask them to promote you.
      </Callout>
    ),
    a11y: ['danger and warning use role="alert"; others role="note". Override with role.'],
    usage: `<Callout variant="warning" title="Token expires soon">Renew it before Friday.</Callout>`,
  },
  {
    slug: 'key-value-list',
    title: 'KeyValueList',
    description:
      'A description list for facts: account details, request metadata, keys and ids (mono).',
    block: true,
    controls: [
      { name: 'layout', type: 'select', options: ['inline', 'stacked'], default: 'inline' },
      { name: 'dense', type: 'boolean', default: false },
    ],
    render: (v) => (
      <KeyValueList
        layout={v.layout as 'inline'}
        dense={Boolean(v.dense)}
        items={[
          { label: 'Name', value: 'Priya Natarajan' },
          { label: 'Role', value: <PersonaBadge persona="ADMIN" size="sm" /> },
          { label: 'User id', value: '0192f3a8-7c2e-7b1d-9a44-3f6e2c1d8b05', mono: true },
          { label: 'Plan', value: 'Pro', hint: '600 requests a minute, 200,000 a month' },
        ]}
      />
    ),
    a11y: ['A real <dl> with <dt>/<dd> pairs, so screen readers announce term and definition.'],
    usage: `<KeyValueList items={[{ label: 'Plan', value: 'Pro' }]} />`,
  },
  {
    slug: 'timeline',
    title: 'Timeline',
    description: 'A vertical record of what happened, each node toned by meaning.',
    block: true,
    controls: [{ name: 'compact', type: 'boolean', default: false }],
    render: (v) => (
      <Timeline
        compact={Boolean(v.compact)}
        items={[
          {
            id: '1',
            title: 'Access granted to Budget Buddy',
            description: 'Scopes: read transactions',
            time: 'Today, 9:14 am',
            dateTime: '2026-11-21T09:14',
            tone: 'accent',
          },
          {
            id: '2',
            title: 'Reminder sent to Marcus',
            time: 'Yesterday',
            dateTime: '2026-11-20',
            tone: 'warning',
          },
          {
            id: '3',
            title: 'W-9 received',
            description: 'Marked done by you',
            time: '12 Nov',
            dateTime: '2026-11-12',
            tone: 'success',
          },
          { id: '4', title: 'Request created', time: '3 Nov', dateTime: '2026-11-03' },
        ]}
      />
    ),
    a11y: ['An ordered list; times are <time> elements with machine-readable dateTime.'],
    usage: `<Timeline items={[{ id: '1', title: 'Created', time: 'Today', tone: 'success' }]} />`,
  },
  {
    slug: 'illustrations',
    title: 'Illustrations',
    description:
      'Six drawings in one language: single-weight ink outlines on flat tints of the page palette, one brass detail each, a soft floor shadow. They follow the theme and the product accent. Use with EmptyState.',
    block: true,
    controls: [
      {
        name: 'name',
        type: 'select',
        options: ['empty', 'search', 'letter', 'key', 'allClear', 'locked'],
        default: 'empty',
      },
      { name: 'size', type: 'number', default: 200, min: 120, max: 320 },
    ],
    render: (v) => (
      <div className="stack-3" style={{ width: '100%' }}>
        <Illustration
          name={v.name as IllustrationName}
          size={Number(v.size)}
          title={String(v.name)}
        />
        <div className="row-wrap">
          {(['empty', 'search', 'letter', 'key', 'allClear', 'locked'] as const).map((n) => (
            <Illustration key={n} name={n} size={88} />
          ))}
        </div>
      </div>
    ),
    a11y: ['Decorative by default (aria-hidden); pass title to name one.'],
    usage: `<EmptyState illustration={<Illustration name="letter" />} title="Nothing is waiting" ... />`,
  },
  {
    slug: 'patterns',
    title: 'KeyCut and VaultRings',
    description:
      'The two pattern primitives. KeyCut is a strip of key bitting for dividers and band edges; VaultRings is the combination-lock dial for hero backdrops.',
    block: true,
    controls: [{ name: 'animate', type: 'boolean', default: false }],
    render: (v) => (
      <div className="stack-3" style={{ width: '100%' }}>
        <KeyCut height={24} />
        <div style={{ width: 'min(100%, 260px)', color: 'var(--pp-color-border-strong)' }}>
          <UI.VaultRings animate={Boolean(v.animate)} />
        </div>
      </div>
    ),
    a11y: ['Both are aria-hidden decoration; color follows currentColor.'],
    usage: `<KeyCut /> <VaultRings animate />`,
  },
  {
    slug: 'icons',
    title: 'Icons',
    description:
      '24px grid, 1.75px round strokes, no fills, one idea per glyph. All icons follow currentColor and take size and title.',
    block: true,
    controls: [{ name: 'size', type: 'number', default: 24, min: 12, max: 48 }],
    render: (v) => (
      <ul
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(8.5rem, 1fr))',
          gap: 8,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          width: '100%',
        }}
      >
        {allIcons.map(([name, Icon]) => (
          <li
            key={name}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, minWidth: 0 }}
          >
            <Icon size={Number(v.size)} />
            <code style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</code>
          </li>
        ))}
      </ul>
    ),
    a11y: ['Decorative (aria-hidden) unless you pass title, which sets role="img".'],
    usage: `<SearchIcon size={20} />\n<LockIcon title="Locked" />`,
  },
]

import {
  ActivityIcon,
  AppFrame,
  AreaChart,
  BarsChart,
  BentoCard,
  BentoGrid,
  BigStat,
  BubbleChart,
  Button,
  CalendarIcon,
  ChatSparkIcon,
  ClockIcon,
  CoinsIcon,
  DotMatrix,
  HomeIcon,
  KeyIcon,
  Logo,
  PageHeader,
  PillSelect,
  ProgressStat,
  PromoCard,
  PulseHomeIcon,
  SettingsIcon,
  ShieldIcon,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  TreeIcon,
} from '@platform/ui'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const nav = [
  { id: 'overview', label: 'Overview', icon: <HomeIcon size={18} /> },
  { id: 'waiting', label: 'Waiting On', icon: <ClockIcon size={18} />, count: 3 },
  { id: 'consent', label: 'Consent', icon: <ShieldIcon size={18} /> },
  { id: 'pulse', label: 'Home Pulse', icon: <PulseHomeIcon size={18} /> },
  { id: 'ask', label: 'Ask Your Life', icon: <ChatSparkIcon size={18} /> },
  { id: 'treasury', label: 'Family Treasury', icon: <CoinsIcon size={18} /> },
  { id: 'legacy', label: 'Digital Legacy', icon: <TreeIcon size={18} /> },
] as const

const spending = [
  { label: 'Jun', value: 2480 },
  { label: 'Jul', value: 2710 },
  { label: 'Aug', value: 2390 },
  { label: 'Sep', value: 3010 },
  { label: 'Oct', value: 2840 },
  { label: 'Nov', value: 3120 },
]

/**
 * The dashboard pattern every product copies: AppFrame, a huge page title, then a bento grid of
 * white cards with one black card and one lime card. My-Trove content, reference layout.
 */
export function DashboardExample() {
  const [active, setActive] = useState<string>('overview')
  const [range, setRange] = useState('today')
  return (
    <AppFrame
      brand={
        <Link to="/" aria-label="My-Trove design language, home" style={{ color: 'inherit' }}>
          <Logo size="sm" title="" />
        </Link>
      }
      user={{ name: 'Priya Raman', email: 'priya@example.com', onClick: () => undefined }}
      search={{ placeholder: 'Search requests, keys, documents', shortcut: '⌘K' }}
      notifications={3}
      sidebar={
        <SidebarNav label="Dashboard">
          <SidebarSection title="Menu">
            {nav.map((item) => (
              <SidebarLink
                key={item.id}
                icon={item.icon}
                active={active === item.id}
                {...('count' in item ? { count: item.count } : {})}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  setActive(item.id)
                }}
              >
                {item.label}
              </SidebarLink>
            ))}
          </SidebarSection>
          <SidebarSection title="Account">
            <SidebarLink icon={<SettingsIcon size={18} />} href="#settings">
              Settings
            </SidebarLink>
          </SidebarSection>
        </SidebarNav>
      }
      promo={
        <PromoCard
          title="Share a key"
          description="Lend one document to one person, for as long as you choose."
          action={
            <Button size="sm" variant="primary">
              Create a key
            </Button>
          }
        />
      }
    >
      <PageHeader
        title="Household"
        description="What you have lent, what you are waiting on, and what the house has spent."
        actions={
          <PillSelect
            label="Date range"
            icon={<CalendarIcon size={16} />}
            lead="Nov 22"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
            ]}
          />
        }
      />

      <BentoGrid>
        <BentoCard
          span={5}
          title="Requests in flight"
          icon={<ClockIcon size={18} />}
          onMenu={() => undefined}
        >
          <BigStat
            value={24}
            unit="open today"
            delta="+5%"
            secondary={[
              { label: 'Avg reply', value: '3 days' },
              { label: 'Overdue', value: '2' },
            ]}
          />
          <div style={{ marginTop: 'var(--pp-space-6)' }}>
            <DotMatrix
              label="Requests answered per day this week"
              highlight={4}
              columns={[
                { label: 'Mon', value: 4 },
                { label: 'Tue', value: 6 },
                { label: 'Wed', value: 3 },
                { label: 'Thu', value: 7 },
                { label: 'Fri', value: 8 },
                { label: 'Sat', value: 2 },
                { label: 'Sun', value: 5 },
              ]}
            />
          </div>
        </BentoCard>

        <BentoCard
          span={4}
          title="Where things stand"
          icon={<ActivityIcon size={18} />}
          onMenu={() => undefined}
        >
          <BubbleChart
            label="Requests by status"
            bubbles={[
              { label: 'Answered', value: 31, unit: 'req', tone: 'lilac' },
              { label: 'Waiting', value: 12, unit: 'req', tone: 'ink' },
              { label: 'Overdue', value: 5, unit: 'req', tone: 'lime' },
            ]}
          />
        </BentoCard>

        <BentoCard
          span={3}
          tone="dark"
          title="Keys in use"
          icon={<KeyIcon size={18} />}
          onMenu={() => undefined}
        >
          <BigStat size="md" value={18} unit="active keys" delta="+12%" />
          <div style={{ marginTop: 'var(--pp-space-5)' }}>
            <BarsChart
              label="Keys created per month"
              height={140}
              callout="+12%"
              data={[
                { label: 'Jul', a: 8, b: 5 },
                { label: 'Aug', a: 10, b: 6 },
                { label: 'Sep', a: 7, b: 8 },
                { label: 'Oct', a: 12, b: 9 },
                { label: 'Nov', a: 16, b: 11 },
              ]}
            />
          </div>
        </BentoCard>

        <BentoCard
          span={4}
          title="Household health"
          icon={<ShieldIcon size={18} />}
          onMenu={() => undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pp-space-6)' }}>
            <ProgressStat label="Consent coverage" value={82} tone="lilac" />
            <ProgressStat label="Documents sealed" value={64} tone="lime" />
            <ProgressStat label="Reminders on time" value={91} tone="ink" />
          </div>
        </BentoCard>

        <BentoCard
          span={5}
          title="Family spending"
          icon={<CoinsIcon size={18} />}
          onMenu={() => undefined}
        >
          <BigStat
            size="md"
            value={3120}
            locale="en-US"
            format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
            delta="+9.8%"
            caption="November so far"
          />
          <div style={{ marginTop: 'var(--pp-space-4)' }}>
            <AreaChart
              label="Monthly spending, June to November"
              data={spending}
              height={170}
              format={(v) => `$${v.toLocaleString()}`}
            />
          </div>
        </BentoCard>

        <BentoCard span={3} tone="lime" title="This week" icon={<ActivityIcon size={18} />}>
          <BigStat
            size="md"
            value={7}
            unit="days streak"
            caption="Every request answered in time."
          />
          <div style={{ marginTop: 'auto', paddingTop: 'var(--pp-space-6)' }}>
            <Button variant="primary" size="sm">
              See the log
            </Button>
          </div>
        </BentoCard>
      </BentoGrid>
    </AppFrame>
  )
}

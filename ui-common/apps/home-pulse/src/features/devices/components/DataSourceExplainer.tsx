import { BellIcon, BentoCard, BoltIcon, CalendarIcon, cx, InfoIcon } from '@platform/ui'
import type { ReactNode } from 'react'
import type { Slot } from '../../appliances/components/slot'

const SOURCES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <BoltIcon size={18} />,
    title: 'Energy readings',
    body: 'Three sources, and each one is labelled. A smart plug or meter reports its watts to this service with its device token. With no plug, you can type in the meter total or import a CSV, and Home Pulse works out the average power between your entries (Entered by you). The built-in simulator invents numbers (Simulated). Home Pulse never measures anything by itself.',
  },
  {
    icon: <CalendarIcon size={18} />,
    title: 'Reminders',
    body: 'They come from the purchase, warranty and service dates you enter on the appliance. No device is needed for these.',
  },
  {
    icon: <BellIcon size={18} />,
    title: 'Alerts',
    body: 'After about a week of readings, Home Pulse learns the usual pattern for that appliance. An alert opens when its draw drifts from that pattern.',
  },
]

/**
 * Plain words on where each kind of information comes from, so nobody has to guess why a new appliance is empty.
 * Shown on the appliance page and in the connect flow.
 */
export function DataSourceExplainer({
  className,
  headingAs = 'h2',
}: {
  className?: string
  headingAs?: 'h2' | 'h3'
}) {
  const Heading = headingAs
  return (
    <section className={cx('hp-explainer', className)} aria-labelledby="hp-explainer-title">
      <Heading id="hp-explainer-title" className="hp-explainer-title">
        Where does this data come from?
      </Heading>
      <SourceList />
    </section>
  )
}

/** The explainer as a bento card, for the appliance page. BentoGrid hands its children a className and style. */
export function DataSourceCard({ className, style }: Slot) {
  return (
    <BentoCard
      span={12}
      title="Where does this data come from?"
      icon={<InfoIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <SourceList />
    </BentoCard>
  )
}

function SourceList() {
  return (
    <ul className="hp-explainer-list hp-plain-list">
      {SOURCES.map((s) => (
        <li key={s.title} className="hp-explainer-item">
          <span className="hp-explainer-icon" aria-hidden="true">
            {s.icon}
          </span>
          <div>
            <strong>{s.title}</strong>
            <p className="hp-small hp-muted">{s.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

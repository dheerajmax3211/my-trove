import {
  Avatar,
  Badge,
  Callout,
  KeyValueList,
  SearchIcon,
  Sparkline,
  Stat,
  Stepper,
  Timeline,
} from '@platform/ui'
import { PanelFrame } from '../components/Blocks'
import type { ProductId } from '../content/products'
import styles from './panels.module.css'

/*
 * One illustrative panel per product, composed from the same components the products use.
 * Every figure here is invented sample data and the frame says so. The behaviours they show
 * (statuses, reasons, ranks, states) are the ones the services implement.
 */

function WaitingOnPanel() {
  return (
    <PanelFrame product="waiting-on" title="Waiting On">
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.title}>Refund for the headphones</p>
          <p className={styles.muted}>Example Audio Ltd, 42.00 GBP</p>
        </div>
        <Badge variant="warning" dot>
          Escalated
        </Badge>
      </div>
      <Timeline
        compact
        label="What has happened to this item"
        items={[
          {
            id: 'created',
            title: 'Tracking started',
            description: 'Expected by 12 Sep. Reply address created.',
            time: '5 Sep',
          },
          {
            id: 'nudge',
            title: 'Nudge drafted',
            description: 'A friendly reminder, ready to send.',
            time: '12 Sep',
          },
          {
            id: 'reply',
            title: 'Reply received',
            description: 'Sorted as needs info. Chasing paused for 7 days.',
            time: '17 Sep',
            tone: 'brass',
          },
          {
            id: 'escalation',
            title: 'Escalation letter drafted',
            description: 'Stored on the timeline for you to send.',
            time: '1 Oct',
            tone: 'accent',
          },
          {
            id: 'final',
            title: 'Final notice',
            description: 'Due in 9 days unless you resolve the item.',
            time: '15 Oct',
          },
        ]}
      />
      <p className={styles.draft}>
        <span className={styles.draftTag}>Draft, previewed today</span>I am writing again about my
        refund of 42.00 GBP, which was due on 12 September. I would be grateful for a reply by 8
        October.
      </p>
    </PanelFrame>
  )
}

function ConsentPanel() {
  return (
    <PanelFrame product="consent" title="Consent">
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.title}>Shoe Finder</p>
          <p className={styles.muted}>Find shoes that fit, for 30 days</p>
        </div>
        <Badge variant="success" dot>
          Granted
        </Badge>
      </div>
      <KeyValueList
        dense
        items={[
          { id: 'scope', label: 'May read', value: 'profile.sizes.shoe', mono: true },
          { id: 'reads', label: 'Reads left', value: '3 of 5' },
          { id: 'hours', label: 'Hours', value: '08:00 to 20:00, your time zone' },
        ]}
      />
      <div>
        <p className={styles.sectionLabel}>Access log</p>
        <Timeline
          compact
          label="Access log"
          items={[
            {
              id: 'one',
              title: 'Read profile.sizes.shoe',
              description: 'Allowed. 3 reads left.',
              tone: 'success',
            },
            {
              id: 'two',
              title: 'Read profile.address',
              description: (
                <>
                  Denied: <span className={styles.mono}>SCOPE_NOT_GRANTED</span>
                </>
              ),
              tone: 'danger',
            },
            {
              id: 'three',
              title: 'You approved a narrower request',
              description: 'It asked for all of profile.sizes. You allowed the shoe size only.',
              tone: 'brass',
            },
          ]}
        />
      </div>
      <Callout variant="success" role="note" title="Log verified">
        Each entry carries the hash of the one before it. No broken link.
      </Callout>
    </PanelFrame>
  )
}

const POWER = [
  955, 958, 951, 960, 957, 962, 959, 968, 975, 982, 990, 996, 1004, 1011, 1019, 1027, 1034, 1041,
  1049, 1056, 1063,
]

function HomePulsePanel() {
  return (
    <PanelFrame product="home-pulse" title="Home Pulse">
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.title}>Kitchen fridge</p>
          <p className={styles.muted}>Learned normal: 957 W while running</p>
        </div>
        <Badge variant="warning" dot>
          Warning
        </Badge>
      </div>
      <Stat
        label="Running power, last 21 days"
        value="1,063 W"
        delta="11% above normal"
        trend="up"
        goodDirection="down"
      />
      <Sparkline
        className={styles.chart}
        data={POWER}
        width={420}
        height={96}
        tone="brass"
        label="Running power rising from 955 W to 1,063 W over 21 days"
      />
      <Callout variant="warning" role="note" title="Power shift">
        Sustained in 3 of the last 4 windows. The warranty ends in 5 months, so this is worth
        raising with the maker.
      </Callout>
    </PanelFrame>
  )
}

function Mark({ children }: { children: string }) {
  return <mark>{children}</mark>
}

function AskYourLifePanel() {
  return (
    <PanelFrame product="ask-your-life" title="Ask Your Life">
      <p className={styles.query}>
        <SearchIcon size={18} />
        washing machine warranty
      </p>
      <ul className={styles.results}>
        <li className={styles.result}>
          <p className={styles.resultTitle}>
            Washer from Hillside Appliances
            <Badge variant="accent">Receipt</Badge>
          </p>
          <p className={styles.snippet}>
            Bought the <Mark>washing machine</Mark> with a 24 month <Mark>warranty</Mark>, serial
            ending 4471, delivered on the 9th.
          </p>
        </li>
        <li className={styles.result}>
          <p className={styles.resultTitle}>
            Laundry room plumbing
            <Badge>Note</Badge>
          </p>
          <p className={styles.snippet}>
            Replaced the inlet hose on the <Mark>washing</Mark> machine. Plumber says check it
            yearly.
          </p>
        </li>
        <li className={styles.result}>
          <p className={styles.resultTitle}>
            Reply from support
            <Badge variant="info">Email</Badge>
          </p>
          <p className={styles.snippet}>
            Your extended <Mark>warranty</Mark> covers the drum and motor but not the door seal.
          </p>
        </li>
      </ul>
      <div>
        <p className={styles.sectionLabel}>Why the first result ranked first</p>
        <KeyValueList
          dense
          items={[
            { id: 'kw', label: 'Keyword rank', value: '1' },
            { id: 'sem', label: 'Similarity rank', value: '2' },
            { id: 'fused', label: 'Combined by', value: 'reciprocal rank fusion' },
          ]}
        />
      </div>
    </PanelFrame>
  )
}

const LEGACY_STEPS = [
  { id: 'active', label: 'Active' },
  { id: 'grace', label: 'Grace' },
  { id: 'escalating', label: 'Escalating' },
  { id: 'pending', label: 'Release pending' },
  { id: 'released', label: 'Released' },
]

function DigitalLegacyPanel() {
  return (
    <PanelFrame product="digital-legacy" title="Digital Legacy">
      <div className={styles.stepperWrap}>
        <Stepper steps={LEGACY_STEPS} current={3} label="State of the switch" />
      </div>
      <div>
        <p className={styles.sectionLabel}>Trustees: 3 of 5 must approve</p>
        <ul className={styles.trustees}>
          {[
            ['Mira Okafor', 'Approved', 'success'],
            ['Tomas Lindqvist', 'Approved', 'success'],
            ['Ines Duarte', 'Waiting', 'neutral'],
            ['Kofi Mensah', 'Waiting', 'neutral'],
            ['Hana Sato', 'Declined', 'danger'],
          ].map(([name, vote, variant]) => (
            <li key={name} className={styles.trustee}>
              <Avatar name={name ?? ''} size="sm" decorative />
              <span className={styles.trusteeName}>{name}</span>
              <Badge variant={variant as 'success' | 'neutral' | 'danger'} dot>
                {vote}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
      <Callout variant="note" title="One more approval starts the cool-off">
        When the third trustee approves, a waiting period begins. One check-in from the owner in
        that time cancels the release and clears every approval.
      </Callout>
    </PanelFrame>
  )
}

function FamilyTreasuryPanel() {
  return (
    <PanelFrame product="family-treasury" title="Family Treasury">
      <table className={styles.ledger}>
        <caption>Entry: groceries, 24.00 GBP</caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col" className={styles.num}>
              Debit
            </th>
            <th scope="col" className={styles.num}>
              Credit
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Expense: groceries</th>
            <td className={styles.num}>24.00</td>
            <td className={styles.num} />
          </tr>
          <tr>
            <th scope="row">Pot: Sam</th>
            <td className={styles.num} />
            <td className={styles.num}>24.00</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className={styles.num}>24.00</td>
            <td className={styles.num}>24.00</td>
          </tr>
        </tfoot>
      </table>
      <Callout variant="info" role="note" title="Waiting for a second person">
        A spend of 180.00 GBP for the school trip is above the household threshold. A different
        owner or approver has to agree. There is no ledger entry yet.
      </Callout>
      <div className={styles.head}>
        <p className={styles.muted}>Reconciliation, 4 accounts</p>
        <Badge variant="success" dot>
          No drift
        </Badge>
      </div>
    </PanelFrame>
  )
}

const panels: Record<ProductId, () => React.JSX.Element> = {
  'waiting-on': WaitingOnPanel,
  consent: ConsentPanel,
  'home-pulse': HomePulsePanel,
  'ask-your-life': AskYourLifePanel,
  'digital-legacy': DigitalLegacyPanel,
  'family-treasury': FamilyTreasuryPanel,
}

export function ProductPanel({ id }: { id: ProductId }) {
  const Panel = panels[id]
  return <Panel />
}

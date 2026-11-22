import {
  ActivityIcon,
  AreaChart,
  BarList,
  BarsChart,
  BentoCard,
  BentoGrid,
  BigStat,
  BubbleChart,
  ChartIcon,
  ChatSparkIcon,
  ClockIcon,
  CoinsIcon,
  DotMatrix,
  KeyIcon,
  ProductMark,
  ProgressStat,
  PulseHomeIcon,
  ShieldIcon,
  TreeIcon,
  cx,
} from '@platform/ui'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { products, type ProductId } from '../content/products'
import styles from './ProductPreview.module.css'

/*
 * A live-looking mini dashboard for each product, built from the same bento kit as the app.
 * Every figure is invented sample data and the frame says so. The behaviours they show (follow-up
 * schedules, scoped grants, learned normals, ranked search, trustee quorums, balanced ledgers)
 * are the ones the services implement.
 */

/** Whole numbers only while counting, so the figure never shows a stray decimal. */
function Big(props: ComponentProps<typeof BigStat>) {
  return <BigStat format={{ maximumFractionDigits: 0 }} locale="en-US" {...props} />
}

const POWER = [
  955, 958, 951, 960, 957, 962, 959, 968, 975, 982, 990, 996, 1004, 1011, 1019, 1027, 1034, 1041,
  1049, 1056, 1063,
]

function WaitingOn(): ReactNode {
  return (
    <BentoGrid className={styles.grid}>
      <BentoCard span={7} title="Open items" icon={<ClockIcon size={18} />}>
        <Big
          size="md"
          value={7}
          unit="waiting"
          delta="2 escalated"
          secondary={[{ label: 'Next nudge', value: 'in 2 days' }]}
        />
        <DotMatrix
          className={styles.chart}
          label="Follow-ups sent each day this week"
          highlight={3}
          rows={6}
          columns={[
            { label: 'Mon', value: 2 },
            { label: 'Tue', value: 4 },
            { label: 'Wed', value: 1 },
            { label: 'Thu', value: 5 },
            { label: 'Fri', value: 3 },
            { label: 'Sat', value: 1 },
            { label: 'Sun', value: 1 },
          ]}
        />
      </BentoCard>
      <BentoCard span={5} tone="dark" title="Replies" icon={<ActivityIcon size={18} />}>
        <Big size="md" value={9} unit="this month" delta="+3" />
        <BarsChart
          className={styles.chart}
          label="Nudges and replies by month"
          height={112}
          data={[
            { label: 'Jul', a: 6, b: 3 },
            { label: 'Aug', a: 8, b: 5 },
            { label: 'Sep', a: 7, b: 6 },
            { label: 'Oct', a: 11, b: 9 },
          ]}
        />
      </BentoCard>
      <BentoCard span={12} title="Where things stand" icon={<ChartIcon size={18} />}>
        <BubbleChart
          label="Items by status"
          bubbles={[
            { label: 'Resolved', value: 9, unit: 'items', tone: 'lilac' },
            { label: 'Waiting', value: 4, unit: 'items', tone: 'ink' },
            { label: 'Escalated', value: 2, unit: 'items', tone: 'lime' },
          ]}
        />
      </BentoCard>
    </BentoGrid>
  )
}

function Consent(): ReactNode {
  return (
    <BentoGrid className={styles.grid}>
      <BentoCard span={7} title="Active grants" icon={<KeyIcon size={18} />}>
        <Big
          size="md"
          value={4}
          unit="apps may read"
          delta="1 ends today"
          secondary={[{ label: 'Revoked', value: '1' }]}
        />
        <DotMatrix
          className={styles.chart}
          label="Reads allowed each day this week"
          highlight={4}
          rows={6}
          columns={[
            { label: 'Mon', value: 3 },
            { label: 'Tue', value: 2 },
            { label: 'Wed', value: 5 },
            { label: 'Thu', value: 4 },
            { label: 'Fri', value: 6 },
            { label: 'Sat', value: 1 },
            { label: 'Sun', value: 2 },
          ]}
        />
      </BentoCard>
      <BentoCard span={5} tone="dark" title="Reads logged" icon={<ShieldIcon size={18} />}>
        <Big size="md" value={31} unit="reads this week" />
        <BarsChart
          className={styles.chart}
          label="Reads allowed and denied by day"
          height={112}
          data={[
            { label: 'Mon', a: 9, b: 1 },
            { label: 'Tue', a: 7, b: 2 },
            { label: 'Wed', a: 11, b: 3 },
            { label: 'Thu', a: 8, b: 1 },
          ]}
        />
      </BentoCard>
      <BentoCard span={12} title="Shoe Finder, 30 day grant" icon={<ClockIcon size={18} />}>
        <div className={styles.bars}>
          <ProgressStat label="Reads used" value={40} tone="lilac" caption="2 of 5 reads" />
          <ProgressStat label="Time used" value={25} tone="lime" caption="Day 8 of 30" />
        </div>
      </BentoCard>
    </BentoGrid>
  )
}

function HomePulse(): ReactNode {
  return (
    <BentoGrid className={styles.grid}>
      <BentoCard span={12} title="Kitchen fridge" icon={<PulseHomeIcon size={18} />}>
        <Big
          size="md"
          value={1063}
          unit="W running"
          delta="11% above normal"
          trend="up"
          secondary={[{ label: 'Learned normal', value: '957 W' }]}
        />
        <AreaChart
          className={styles.chart}
          label="Running power over 21 days"
          height={150}
          tone="brass"
          data={POWER.map((value, i) => ({ label: `Day ${i + 1}`, value }))}
          format={(v) => `${Math.round(v).toLocaleString('en-US')} W`}
        />
      </BentoCard>
      <BentoCard span={6} tone="dark" title="Warranty" icon={<ShieldIcon size={18} />}>
        <Big size="md" value={5} unit="months left" />
      </BentoCard>
      <BentoCard span={6} title="Power shift" icon={<ActivityIcon size={18} />}>
        <ProgressStat
          label="Windows above normal"
          value={75}
          tone="lime"
          caption="3 of the last 4"
        />
      </BentoCard>
    </BentoGrid>
  )
}

function AskYourLife(): ReactNode {
  return (
    <BentoGrid className={styles.grid}>
      <BentoCard span={7} title="washing machine warranty" icon={<ChatSparkIcon size={18} />}>
        <Big size="md" value={3} unit="matches" caption="Found in a receipt, a note and an email" />
        <BarList
          className={styles.chart}
          label="How well each match fits the question"
          items={[
            { label: 'Receipt: washer from Hillside', value: 92 },
            { label: 'Email: reply from support', value: 74 },
            { label: 'Note: laundry room plumbing', value: 61 },
          ]}
          format={(v) => `${v}%`}
          max={100}
        />
      </BentoCard>
      <BentoCard span={5} tone="dark" title="Why it ranked first" icon={<ActivityIcon size={18} />}>
        <Big
          size="md"
          value="1st"
          unit="by keyword"
          caption="2nd by meaning, combined by rank fusion"
        />
      </BentoCard>
      <BentoCard span={12} title="What matched" icon={<ChartIcon size={18} />}>
        <BubbleChart
          label="Matches by kind"
          bubbles={[
            { label: 'Receipt', value: 1, unit: 'match', tone: 'lilac' },
            { label: 'Email', value: 1, unit: 'match', tone: 'ink' },
            { label: 'Note', value: 1, unit: 'match', tone: 'lime' },
          ]}
        />
      </BentoCard>
    </BentoGrid>
  )
}

function DigitalLegacy(): ReactNode {
  return (
    <BentoGrid className={styles.grid}>
      <BentoCard span={7} title="Trustees" icon={<TreeIcon size={18} />}>
        <Big
          size="md"
          value={2}
          unit="of 5 approved"
          delta="3 must approve"
          secondary={[{ label: 'Declined', value: '1' }]}
        />
        <div className={styles.bars}>
          <ProgressStat
            label="Toward the quorum"
            value={67}
            tone="lilac"
            caption="2 of 3 approvals"
          />
          <ProgressStat
            label="State of the switch"
            value={80}
            tone="ink"
            caption="Release pending"
          />
        </div>
      </BentoCard>
      <BentoCard span={5} tone="dark" title="Cool-off" icon={<ClockIcon size={18} />}>
        <Big
          size="md"
          value="1"
          unit="check-in cancels it"
          caption="From the owner, in the waiting period"
        />
      </BentoCard>
      <BentoCard span={12} title="Votes so far" icon={<ChartIcon size={18} />}>
        <BubbleChart
          label="Trustee votes"
          bubbles={[
            { label: 'Approved', value: 2, unit: 'trustees', tone: 'lilac' },
            { label: 'Waiting', value: 2, unit: 'trustees', tone: 'ink' },
            { label: 'Declined', value: 1, unit: 'trustee', tone: 'lime' },
          ]}
        />
      </BentoCard>
    </BentoGrid>
  )
}

function FamilyTreasury(): ReactNode {
  return (
    <BentoGrid className={styles.grid}>
      <BentoCard span={7} title="Household spending" icon={<CoinsIcon size={18} />}>
        <Big
          size="md"
          value={3120}
          locale="en-GB"
          format={{ style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }}
          delta="+9.8%"
          caption="October so far"
        />
        <AreaChart
          className={styles.chart}
          label="Monthly spending, May to October"
          height={120}
          data={[
            { label: 'May', value: 2480 },
            { label: 'Jun', value: 2710 },
            { label: 'Jul', value: 2390 },
            { label: 'Aug', value: 3010 },
            { label: 'Sep', value: 2840 },
            { label: 'Oct', value: 3120 },
          ]}
          format={(v) => `${Math.round(v).toLocaleString('en-GB')} GBP`}
        />
      </BentoCard>
      <BentoCard span={5} tone="dark" title="Reconciliation" icon={<ShieldIcon size={18} />}>
        <Big size="md" value={4} unit="accounts" delta="No drift" />
        <BarsChart
          className={styles.chart}
          label="Debits and credits by month"
          height={112}
          data={[
            { label: 'Jul', a: 12, b: 12 },
            { label: 'Aug', a: 15, b: 15 },
            { label: 'Sep', a: 14, b: 14 },
            { label: 'Oct', a: 17, b: 17 },
          ]}
        />
      </BentoCard>
      <BentoCard span={12} title="Waiting for a second person" icon={<ClockIcon size={18} />}>
        <Big
          size="md"
          value="1"
          unit="spend to approve"
          caption="The school trip is above the household threshold"
        />
      </BentoCard>
    </BentoGrid>
  )
}

const previews: Record<ProductId, () => ReactNode> = {
  'waiting-on': WaitingOn,
  consent: Consent,
  'home-pulse': HomePulse,
  'ask-your-life': AskYourLife,
  'digital-legacy': DigitalLegacy,
  'family-treasury': FamilyTreasury,
}

export interface ProductPreviewProps {
  id: ProductId
  className?: string
}

/** A window onto a product: its bento dashboard, labelled as sample data. */
export function ProductPreview({ id, className }: ProductPreviewProps) {
  const product = products.find((p) => p.id === id)
  const Body = previews[id]
  return (
    <figure
      className={cx(styles.frame, className)}
      style={{ '--accent': `var(--pp-color-product-${id})` } as CSSProperties}
    >
      <figcaption className={styles.bar}>
        <ProductMark product={id} size={28} />
        <span className={styles.name}>{product?.name}</span>
        <span className={styles.sample}>Sample data</span>
      </figcaption>
      <div className={styles.body}>
        <Body />
      </div>
    </figure>
  )
}

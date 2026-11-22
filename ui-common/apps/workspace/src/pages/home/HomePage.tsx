import {
  ArrowUpRightIcon,
  Badge,
  BentoCard,
  BentoGrid,
  BigStat,
  Button,
  EmptyState,
  IllustrationAllClear,
  InboxIcon,
  PageHeader,
  SearchIcon,
  Stagger,
  BoltIcon,
} from '@platform/ui'
import { joinPath, useWorkspaceSession } from '@platform/workspace-kit'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ModuleMark } from '../../components/ModuleMark'
import { usePageTitle } from '../../lib/usePageTitle'
import { canOpen, isProduct, moduleBase } from '../../modules/registry'
import { firstActionFor } from '../../onboarding/firstActions'
import { useOnboarding } from '../../onboarding/OnboardingProvider'
import { hotkeyLabel } from '../../shell/CommandPaletteHost'
import { usePalette } from '../../shell/palette'
import { orderProducts } from '../../shell/Sidebar'
import { useWorkspace } from '../../workspace/context'
import { PlanUsage } from './PlanUsage'
import { FeedList, FeedSkeleton, useTodayFeed } from './TodayFeed'
import { firstName, greetingFor, longDate } from './today'
import styles from './HomePage.module.css'

const FEED_PREVIEW = 6

/** "Today": a bento of what needs you across every product, the next things to do, and where you stand on your plan. */
export function HomePage() {
  const { modules, runtime } = useWorkspace()
  const session = useWorkspaceSession()
  const { pinned } = useOnboarding()
  const palette = usePalette()
  const [showAll, setShowAll] = useState(false)
  const now = runtime.now()
  usePageTitle('Today')

  const products = orderProducts(
    modules.filter((module) => isProduct(module) && canOpen(module, session)),
    pinned,
  )
  const { state, probes } = useTodayFeed(products)
  const name = firstName(session.displayName)
  const quick = products.slice(0, 4).map((module) => ({ module, action: firstActionFor(module) }))
  const lead = quick[0]
  const items = showAll ? state.items : state.items.slice(0, FEED_PREVIEW)
  const hidden = state.items.length - items.length
  const urgent = state.items.filter((item) => item.severity === 'danger').length

  const countFor = (id: string) => state.items.filter((item) => item.module.id === id).length
  const contributes = (id: string) =>
    modules.find((module) => module.id === id)?.useTodayItems !== undefined

  return (
    <>
      <PageHeader
        title={name ? `${greetingFor(now)}, ${name}` : greetingFor(now)}
        description={`${longDate(now)}. Here is what needs you across your products.`}
      />
      {probes}

      <BentoGrid>
        <BentoCard
          span={7}
          rowSpan={2}
          title="Needs you"
          icon={<InboxIcon size={18} />}
          actions={
            state.items.length > 0 ? (
              <Badge variant={urgent > 0 ? 'danger' : 'neutral'} dot={urgent > 0}>
                {urgent > 0 ? `${urgent} urgent` : `${state.items.length} open`}
              </Badge>
            ) : null
          }
        >
          {state.items.length > 0 ? (
            <>
              <FeedList items={items} now={now} />
              {hidden > 0 || showAll ? (
                <div className={styles.more}>
                  <Button variant="secondary" size="sm" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'Show fewer' : `Show ${hidden} more`}
                  </Button>
                </div>
              ) : null}
            </>
          ) : state.loading ? (
            <FeedSkeleton />
          ) : (
            <EmptyState
              className={styles.empty}
              illustration={<IllustrationAllClear />}
              title="Nothing needs you right now"
              description="When a product has something for you, it shows up here: a follow-up that is due, an alert, a reminder. Add something to one of your products and check back."
              action={
                lead ? (
                  <Button asChild>
                    <Link to={joinPath(moduleBase(lead.module), lead.action.to)}>
                      {lead.action.title}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </BentoCard>

        <PlanUsage span={5} />

        {quick.length > 0 ? (
          <BentoCard span={5} title="Start something" icon={<BoltIcon size={18} />}>
            <Stagger as="ul" className={styles.quickList} interval={0.06} distance={10}>
              {quick.map(({ module, action }) => (
                <li key={module.id}>
                  <Link to={joinPath(moduleBase(module), action.to)} className={styles.quickLink}>
                    <ModuleMark module={module} size={32} />
                    <span className={styles.quickText}>{action.title}</span>
                    <ArrowUpRightIcon size={16} className={styles.quickArrow} />
                  </Link>
                </li>
              ))}
            </Stagger>
          </BentoCard>
        ) : null}

        {products.length > 0 ? (
          <BentoCard span={8} title="Your products" icon={<InboxIcon size={18} />}>
            <Stagger as="ul" className={styles.productGrid} interval={0.05} distance={14}>
              {products.map((module) => {
                const count = countFor(module.id)
                const live = contributes(module.id)
                return (
                  <li key={module.id} data-product={module.id}>
                    <Link to={moduleBase(module)} className={styles.productTile}>
                      <span className={styles.tileTop}>
                        <ModuleMark module={module} size={36} />
                        <ArrowUpRightIcon size={16} className={styles.quickArrow} />
                      </span>
                      <span className={styles.productName}>{module.title}</span>
                      <span className={styles.productTagline}>{module.tagline}</span>
                      {live ? (
                        <BigStat
                          className={styles.tileStat}
                          size="md"
                          value={count}
                          caption={count === 1 ? 'needs you' : 'need you'}
                          countUp={!state.loading}
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </Stagger>
          </BentoCard>
        ) : null}

        <BentoCard span={4} tone="lime" title="Jump anywhere" icon={<SearchIcon size={18} />}>
          <div className={styles.keys} aria-hidden="true">
            {hotkeyLabel()
              .split(/(?<=⌘)|\s/)
              .filter(Boolean)
              .map((key) => (
                <kbd key={key} className={styles.key}>
                  {key}
                </kbd>
              ))}
          </div>
          <p className={styles.limeCaption}>
            Press {hotkeyLabel()} to search every page and action.
          </p>
          <div className={styles.limeAction}>
            <Button size="sm" onClick={palette.open}>
              Open search
            </Button>
          </div>
        </BentoCard>
      </BentoGrid>
    </>
  )
}

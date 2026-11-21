import { Button, EmptyState, IllustrationAllClear, PageHeader } from '@platform/ui'
import { joinPath, useWorkspaceSession } from '@platform/workspace-kit'
import { Link } from 'react-router-dom'
import { ModuleMark } from '../../components/ModuleMark'
import { usePageTitle } from '../../lib/usePageTitle'
import { canOpen, isProduct, moduleBase } from '../../modules/registry'
import { firstActionFor } from '../../onboarding/firstActions'
import { useOnboarding } from '../../onboarding/OnboardingProvider'
import { orderProducts } from '../../shell/Sidebar'
import { hotkeyLabel } from '../../shell/CommandPaletteHost'
import { useWorkspace } from '../../workspace/context'
import { PlanUsage } from './PlanUsage'
import { FeedList, FeedSkeleton, useTodayFeed } from './TodayFeed'
import { firstName, greetingFor, longDate } from './today'
import styles from './HomePage.module.css'

/** "Today": what needs you across every product, the next things to do, and where you stand on your plan. */
export function HomePage() {
  const { modules, runtime } = useWorkspace()
  const session = useWorkspaceSession()
  const { pinned } = useOnboarding()
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

  return (
    <>
      <PageHeader
        title={name ? `${greetingFor(now)}, ${name}` : greetingFor(now)}
        description={`${longDate(now)}. Here is what needs you across your products.`}
      />
      {probes}

      <div className={styles.layout}>
        <section className={styles.main} aria-labelledby="feed-title">
          <h2 id="feed-title" className={styles.sectionTitle}>
            Needs you
          </h2>
          {state.items.length > 0 ? (
            <FeedList items={state.items} now={now} />
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

          {products.length > 0 ? (
            <section className={styles.products} aria-labelledby="products-title">
              <h2 id="products-title" className={styles.sectionTitle}>
                Your products
              </h2>
              <ul className={styles.productList}>
                {products.map((module) => (
                  <li key={module.id}>
                    <Link to={moduleBase(module)} className={styles.productLink}>
                      <ModuleMark module={module} size={36} />
                      <span className={styles.productText}>
                        <span className={styles.productName}>{module.title}</span>
                        <span className={styles.productTagline}>{module.tagline}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>

        <aside className={styles.rail} aria-label="Shortcuts and plan">
          {quick.length > 0 ? (
            <section aria-labelledby="quick-title" className={styles.quick}>
              <h2 id="quick-title" className={styles.sectionTitle}>
                Start something
              </h2>
              <ul className={styles.quickList}>
                {quick.map(({ module, action }) => (
                  <li key={module.id}>
                    <Link to={joinPath(moduleBase(module), action.to)} className={styles.quickLink}>
                      <ModuleMark module={module} size={28} />
                      <span>{action.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className={styles.hint}>
                Press <kbd>{hotkeyLabel()}</kbd> to jump to any page.
              </p>
            </section>
          ) : null}
          <PlanUsage />
        </aside>
      </div>
    </>
  )
}

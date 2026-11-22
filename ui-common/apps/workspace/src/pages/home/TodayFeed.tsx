import { Badge, Skeleton, Stagger, type BadgeVariant } from '@platform/ui'
import { joinPath, type ProductModule, type TodayItem } from '@platform/workspace-kit'
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { ModuleMark } from '../../components/ModuleMark'
import { ModuleScope } from '../../modules/ModuleScope'
import { moduleBase } from '../../modules/registry'
import { describeDue, SEVERITY_LABEL, sortFeed, type FeedItem } from './today'
import styles from './TodayFeed.module.css'

type Contributor = ProductModule & { useTodayItems: NonNullable<ProductModule['useTodayItems']> }
const contributes = (module: ProductModule): module is Contributor =>
  module.useTodayItems !== undefined

interface ModuleToday {
  items: TodayItem[]
  loading: boolean
}

type Report = (moduleId: string, value: ModuleToday) => void

/** A module's feed hook must never take the home page down with it. */
class ProbeBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onFail()
  }
  override render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Runs one module's `useTodayItems` inside that module's providers and API client, and reports the result upward. */
function Probe({ module, report }: { module: Contributor; report: Report }) {
  const useToday = module.useTodayItems
  const { items, loading } = useToday()
  // Hooks return fresh arrays each render; only report when the content actually changes.
  const signature = JSON.stringify({ items, loading })
  const value = useMemo(() => JSON.parse(signature) as ModuleToday, [signature])
  useEffect(() => report(module.id, value), [module.id, report, value])
  return null
}

const SEVERITY_BADGE: Record<TodayItem['severity'], BadgeVariant> = {
  danger: 'danger',
  warn: 'warning',
  info: 'info',
}

export interface TodayFeedState {
  items: FeedItem[]
  /** True until every module has answered at least once, or while any is still loading. */
  loading: boolean
}

/**
 * Collects each module's Today items. The probes render nothing; they exist so every module's hook
 * runs where it expects to: inside its own `Providers` and `ApiProvider`.
 */
export function useTodayFeed(modules: readonly ProductModule[]): {
  state: TodayFeedState
  probes: ReactNode
} {
  const [results, setResults] = useState<Record<string, ModuleToday>>({})
  const report = useCallback<Report>((moduleId, value) => {
    setResults((current) =>
      current[moduleId] === value ? current : { ...current, [moduleId]: value },
    )
  }, [])
  const contributors = modules.filter(contributes)
  const ids = contributors.map((module) => module.id).join(',')

  const state = useMemo<TodayFeedState>(() => {
    const items: FeedItem[] = []
    let loading = false
    for (const module of contributors) {
      const result = results[module.id]
      if (!result || result.loading) loading = true
      for (const item of result?.items ?? []) {
        items.push({ ...item, module, href: joinPath(moduleBase(module), item.to) })
      }
    }
    return { items: sortFeed(items), loading }
    // `contributors` is derived from `modules` + `ids`; `ids` is the stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, ids])

  const probes = (
    <div hidden data-testid="today-probes">
      {contributors.map((module) => (
        <ModuleScope key={module.id} module={module}>
          <ProbeBoundary onFail={() => report(module.id, { items: [], loading: false })}>
            <Probe module={module} report={report} />
          </ProbeBoundary>
        </ModuleScope>
      ))}
    </div>
  )
  return { state, probes }
}

export function FeedList({ items, now }: { items: readonly FeedItem[]; now: Date }) {
  return (
    <Stagger
      as="ul"
      className={styles.list}
      aria-label="Items that need you"
      interval={0.06}
      distance={14}
      duration={0.6}
    >
      {items.map((item) => {
        const due = describeDue(item.dueAt, now)
        return (
          <li
            key={`${item.module.id}:${item.id}`}
            className={styles.row}
            data-severity={item.severity}
          >
            <Link to={item.href} className={styles.link}>
              <ModuleMark module={item.module} size={40} />
              <span className={styles.text}>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.meta}>
                  {item.module.title}
                  {item.subtitle ? `. ${item.subtitle}` : ''}
                </span>
              </span>
              <span className={styles.flags}>
                <Badge variant={SEVERITY_BADGE[item.severity]} dot>
                  {SEVERITY_LABEL[item.severity]}
                </Badge>
                {due ? <span className={styles.due}>{due}</span> : null}
              </span>
            </Link>
          </li>
        )
      })}
    </Stagger>
  )
}

export function FeedSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading your items" role="status">
      {[0, 1, 2].map((row) => (
        <div key={row} className={styles.skeletonRow}>
          <Skeleton width={40} height={40} />
          <div className={styles.skeletonText}>
            <Skeleton width="55%" height="1rem" />
            <Skeleton width="35%" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  )
}

import {
  Button,
  EmptyState,
  Field,
  Illustration,
  PageHeader,
  PlusIcon,
  Select,
  Skeleton,
  VisuallyHidden,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { useClock } from '../../../lib/clock'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  ACTIVE_STATUSES,
  type Item,
  type ItemCategory,
  type ItemStatus,
} from '../api/types'
import { FirstUse } from '../components/FirstUse'
import { HomeSummary } from '../components/HomeSummary'
import { ItemGroup } from '../components/ItemGroup'
import { PAGE_SIZE, useAnyItems, useItems } from '../hooks/useItems'
import { GROUP_ORDER, groupItems } from '../logic/groups'
import { CATEGORY_LABEL, STATUS_LABEL } from '../logic/labels'

type StatusFilter = 'ACTIVE' | 'ALL' | ItemStatus

const CLOSED_STATUSES: readonly ItemStatus[] = ['RESOLVED', 'EXPIRED', 'CANCELLED']
const CLOSED_PREVIEW = 5

const isStatusFilter = (v: string | null): v is StatusFilter =>
  v === 'ACTIVE' || v === 'ALL' || ITEM_STATUSES.includes(v as ItemStatus)
const isCategory = (v: string | null): v is ItemCategory =>
  ITEM_CATEGORIES.includes(v as ItemCategory)

function statusesFor(filter: StatusFilter): readonly ItemStatus[] | null {
  if (filter === 'ALL') return null
  if (filter === 'ACTIVE') return ACTIVE_STATUSES
  return [filter]
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" className="wo-page">
      <VisuallyHidden role="status">Loading your items</VisuallyHidden>
      <Skeleton height={184} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="wo-row wo-row-skeleton" aria-hidden="true">
          <div className="wo-row-main">
            <Skeleton height={22} width="55%" />
            <Skeleton height={16} width="80%" />
          </div>
          <Skeleton height={24} width={90} />
        </div>
      ))}
    </div>
  )
}

export function ItemsPage() {
  usePageTitle('Waiting on')
  const clock = useClock()
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const categoryParam = params.get('category')
  const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'ACTIVE'
  const category: ItemCategory | 'ALL' = isCategory(categoryParam) ? categoryParam : 'ALL'
  const [limit, setLimit] = useState(PAGE_SIZE)

  const items = useItems(statusesFor(status), limit)
  const filtered: Item[] | undefined =
    category === 'ALL' ? items.data : items.data?.filter((i) => i.category === category)
  const isEmpty = items.isSuccess && items.data.length === 0
  // Only when the (unfiltered by category) list is empty do we ask whether the user has any item at all.
  const anyItems = useAnyItems(isEmpty && category === 'ALL')
  const neverUsed =
    isEmpty && category === 'ALL' && anyItems.isSuccess && anyItems.data.length === 0
  // The home view shows the active items by urgency, with a short list of what was closed lately.
  const home = status === 'ACTIVE'
  const closed = useItems(CLOSED_STATUSES, CLOSED_PREVIEW, home && items.isSuccess && !isEmpty)

  const setFilter = (key: 'status' | 'category', value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
    setLimit(PAGE_SIZE)
  }
  const clearFilters = () => {
    setParams({ status: 'ALL' }, { replace: true })
  }

  const addLink = (
    <Button asChild leftIcon={<PlusIcon size={18} />}>
      <ModuleLink to="/new">Add something you are waiting for</ModuleLink>
    </Button>
  )

  let content
  if (items.isPending) content = <HomeSkeleton />
  else if (items.isError)
    content = (
      <ErrorState
        title="We could not load your items"
        error={items.error}
        onRetry={() => void items.refetch()}
      />
    )
  else if (neverUsed) content = <FirstUse />
  else if (filtered && filtered.length === 0) {
    const nothingActive = home && category === 'ALL'
    content = nothingActive ? (
      <EmptyState
        illustration={<Illustration name="allClear" />}
        title="You are not waiting on anyone"
        description="Nothing is open right now. When the next refund, claim or approval is on its way, add it and the follow-ups start from the date you expect it."
        action={addLink}
      />
    ) : (
      <EmptyState
        illustration={<Illustration name="search" />}
        title="Nothing matches these filters"
        description="Try a different status or category, or show everything."
        action={
          <>
            <Button variant="secondary" onClick={clearFilters}>
              Show everything
            </Button>
            {addLink}
          </>
        }
      />
    )
  } else if (filtered) {
    const now = clock()
    const groups = groupItems(filtered, now)
    content = (
      <>
        {home ? null : (
          <p className="wo-summary" role="status">
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'} shown
          </p>
        )}
        <div role="group" aria-label="Waiting items" className="wo-groups">
          {GROUP_ORDER.map((key) => (
            <ItemGroup key={key} group={key} items={groups[key]} />
          ))}
        </div>
        {items.data && items.data.length >= limit ? (
          <Button variant="secondary" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Show more
          </Button>
        ) : null}
      </>
    )
  }

  const closedItems = closed.data ?? []
  return (
    <>
      <PageHeader
        title="What you are waiting for"
        description="Everything other people owe you, grouped by how late it is, with the next follow-up for each."
        actions={addLink}
      />
      <div className="wo-page">
        {home && items.isSuccess && !isEmpty ? <HomeSummary active={items.data} /> : null}
        {neverUsed ? null : (
          <div className="wo-filters" role="group" aria-label="Filters">
            <Field label="Status">
              <Select
                value={status}
                onChange={(e) => setFilter('status', e.target.value, 'ACTIVE')}
              >
                <option value="ACTIVE">Active (open, nudged, escalated)</option>
                <option value="ALL">All statuses</option>
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={category}
                onChange={(e) => setFilter('category', e.target.value, 'ALL')}
              >
                <option value="ALL">All categories</option>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {content}
        {home && closedItems.length > 0 ? (
          <div className="wo-recent">
            <ItemGroup
              group="closed"
              items={closedItems}
              title="Recently closed"
              blurb="The last few items that are no longer waiting."
            />
            <Button variant="secondary" onClick={() => setFilter('status', 'ALL', 'ACTIVE')}>
              Show every item, closed ones too
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}

import {
  Button,
  EmptyState,
  Field,
  PageHeader,
  PlusIcon,
  Select,
  Skeleton,
  VisuallyHidden,
} from '@platform/ui'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { useClock } from '../../../lib/clock'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  ACTIVE_STATUSES,
  type ItemCategory,
  type ItemStatus,
} from '../api/types'
import { FirstUse } from '../components/FirstUse'
import { ItemRow } from '../components/ItemRow'
import { PAGE_SIZE, useAnyItems, useItems } from '../hooks/useItems'
import { CATEGORY_LABEL, STATUS_LABEL } from '../logic/labels'
import { dueState } from '../logic/schedule'

type StatusFilter = 'ACTIVE' | 'ALL' | ItemStatus

const isStatusFilter = (v: string | null): v is StatusFilter =>
  v === 'ACTIVE' || v === 'ALL' || ITEM_STATUSES.includes(v as ItemStatus)
const isCategory = (v: string | null): v is ItemCategory =>
  ITEM_CATEGORIES.includes(v as ItemCategory)

function statusesFor(filter: StatusFilter): readonly ItemStatus[] | null {
  if (filter === 'ALL') return null
  if (filter === 'ACTIVE') return ACTIVE_STATUSES
  return [filter]
}

function ListSkeleton() {
  return (
    <div className="wo-items" aria-busy="true">
      <VisuallyHidden role="status">Loading your items</VisuallyHidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="wo-row" aria-hidden="true">
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
  usePageTitle('Waiting list')
  const clock = useClock()
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const categoryParam = params.get('category')
  const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'ACTIVE'
  const category: ItemCategory | 'ALL' = isCategory(categoryParam) ? categoryParam : 'ALL'
  const [limit, setLimit] = useState(PAGE_SIZE)

  const items = useItems(statusesFor(status), limit)
  const filtered =
    category === 'ALL' ? items.data : items.data?.filter((i) => i.category === category)
  const isEmpty = items.isSuccess && items.data.length === 0
  // Only when the (unfiltered by category) list is empty do we ask whether the user has any item at all.
  const anyItems = useAnyItems(isEmpty && category === 'ALL')
  const neverUsed =
    isEmpty && category === 'ALL' && anyItems.isSuccess && anyItems.data.length === 0

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

  const overdue = filtered?.filter((i) => dueState(i, clock())?.kind === 'overdue').length ?? 0

  let content
  if (items.isPending) content = <ListSkeleton />
  else if (items.isError)
    content = (
      <ErrorState
        title="We could not load your items"
        error={items.error}
        onRetry={() => void items.refetch()}
      />
    )
  else if (neverUsed) content = <FirstUse />
  else if (filtered && filtered.length === 0)
    content = (
      <EmptyState
        title="Nothing matches these filters"
        description={
          status === 'ACTIVE' && category === 'ALL'
            ? 'You have no active items right now. Closed items are still available under All statuses.'
            : 'Try a different status or category.'
        }
        action={
          <>
            <Button variant="secondary" onClick={clearFilters}>
              Show everything
            </Button>
            <Button asChild>
              <Link to="/new">Add item</Link>
            </Button>
          </>
        }
      />
    )
  else if (filtered)
    content = (
      <>
        <p className="wo-summary" role="status">
          {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          {overdue > 0 ? `, ${overdue} overdue` : ', none overdue'}
        </p>
        <ul className="wo-items" aria-label="Waiting items">
          {filtered.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
        {items.data && items.data.length >= limit ? (
          <Button variant="secondary" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Show more
          </Button>
        ) : null}
      </>
    )

  return (
    <>
      <PageHeader
        title="Waiting list"
        description="Everything you are waiting on other people for, and what happens next."
        actions={
          <Button asChild leftIcon={<PlusIcon size={18} />}>
            <Link to="/new">Add item</Link>
          </Button>
        }
      />
      <div className="wo-page">
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
      </div>
    </>
  )
}

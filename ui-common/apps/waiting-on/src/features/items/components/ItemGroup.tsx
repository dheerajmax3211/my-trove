import { useId } from 'react'
import type { Item } from '../api/types'
import { GROUP_BLURB, GROUP_TITLE, type GroupKey } from '../logic/groups'
import { ItemRow } from './ItemRow'

/** One urgency group: a heading that says what the group means, then every item in its own card. */
export function ItemGroup({
  group,
  items,
  title = GROUP_TITLE[group],
  blurb = GROUP_BLURB[group],
}: {
  group: GroupKey
  items: readonly Item[]
  title?: string
  blurb?: string
}) {
  const titleId = useId()
  if (items.length === 0) return null
  return (
    <section className="wo-group" data-group={group} aria-labelledby={titleId}>
      <header className="wo-group-head">
        <h2 id={titleId} className="wo-group-title">
          {title} <span className="wo-group-count">{items.length}</span>
        </h2>
        <p className="wo-group-blurb">{blurb}</p>
      </header>
      <ul className="wo-items" aria-labelledby={titleId}>
        {items.map((item) => (
          <ItemRow key={item.id} item={item} group={group} />
        ))}
      </ul>
    </section>
  )
}

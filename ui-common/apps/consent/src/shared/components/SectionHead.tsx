import type { ReactNode } from 'react'

export interface SectionHeadProps {
  id: string
  title: string
  count?: number
  sub?: ReactNode
  /** A link or button on the right. */
  action?: ReactNode
}

/** A heading above a run of cards: the title, a lime count, one line of context and an optional action. */
export function SectionHead({ id, title, count, sub, action }: SectionHeadProps) {
  return (
    <div className="section-head">
      <div className="section-title">
        <h2 id={id} className="section-heading">
          {title}
        </h2>
        {count !== undefined ? <span className="section-count">{count}</span> : null}
      </div>
      {sub ? <p className="section-sub">{sub}</p> : null}
      {action ? <span className="section-action">{action}</span> : null}
    </div>
  )
}

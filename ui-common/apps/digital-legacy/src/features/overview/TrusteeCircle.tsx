import { Avatar, BentoCard, Badge, Button, UsersIcon, type BadgeVariant } from '@platform/ui'
import type { CSSProperties } from 'react'
import { ModuleLink } from '@platform/workspace-kit'
import type { StateView, TrusteeView } from '../../api/types'

const STATUS: Record<TrusteeView['status'], { label: string; variant: BadgeVariant }> = {
  INVITED: { label: 'Has not answered yet', variant: 'neutral' },
  ACCEPTED: { label: 'Key registered', variant: 'info' },
  SHARE_UPLOADED: { label: 'Holds a piece of the key', variant: 'accent' },
  CONFIRMED: { label: 'Confirmed their piece', variant: 'success' },
  REVOKED: { label: 'Revoked', variant: 'danger' },
}

/** Places `count` points evenly around a circle, starting at the top. Percentages of the box. */
export function ringPositions(count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / Math.max(count, 1)) * 2 * Math.PI - Math.PI / 2
    return { x: 50 + 40 * Math.cos(angle), y: 50 + 40 * Math.sin(angle) }
  })
}

/**
 * The people who can open the vault together: a ring of avatars around "t of n must agree", and the same
 * people as a list with what each has done. The ring is the picture; the list is the content.
 */
export function TrusteeCircle({
  state,
  trustees,
  className,
  style,
}: {
  state: StateView
  trustees: readonly TrusteeView[]
  className?: string
  style?: CSSProperties
}) {
  const active = trustees.filter((t) => t.status !== 'REVOKED')
  const required = state.policy?.quorum ?? state.quorum.required
  const spots = ringPositions(active.length)

  return (
    <BentoCard
      span={7}
      title="Your trustees"
      icon={<UsersIcon size={18} />}
      className={className ? `circle ${className}` : 'circle'}
      {...(style ? { style } : {})}
    >
      <p className="section-lead">
        {active.length === 0
          ? 'Nobody can open your vault yet. Invite the people you would trust with it.'
          : `${required} of ${active.length} must agree before anything is released. No single trustee can open it alone.`}
      </p>
      <div className="circle-body">
        <div className="circle-ring" aria-hidden="true">
          <div className="circle-core">
            <span className="circle-count">
              {active.length === 0 ? '0' : `${required}/${active.length}`}
            </span>
            <span className="circle-count-label">must agree</span>
          </div>
          {active.map((t, i) => (
            <span
              key={t.id}
              className="circle-seat"
              data-status={t.status}
              style={{ left: `${spots[i]?.x ?? 50}%`, top: `${spots[i]?.y ?? 50}%` }}
            >
              <Avatar name={t.label} size="md" decorative />
            </span>
          ))}
        </div>
        <ul className="circle-list" aria-label="Trustees">
          {active.map((t) => (
            <li key={t.id} aria-label={t.label} className="circle-person">
              <Avatar name={t.label} size="sm" decorative />
              <span className="circle-name">{t.label}</span>
              <Badge variant={STATUS[t.status].variant} dot>
                {STATUS[t.status].label}
              </Badge>
            </li>
          ))}
          <li className="circle-more">
            <Button asChild variant="secondary" size="sm">
              <ModuleLink to="/trustees">
                {active.length === 0 ? 'Invite a trustee' : 'Manage trustees'}
              </ModuleLink>
            </Button>
          </li>
        </ul>
      </div>
    </BentoCard>
  )
}

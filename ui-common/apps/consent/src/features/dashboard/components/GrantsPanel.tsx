import { EmptyState, Illustration } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Grant } from '../../../shared/api/types'
import { SectionHead } from '../../../shared/components/SectionHead'
import { GrantCard } from '../../grants/components/GrantCard'

export interface GrantsPanelProps {
  grants: readonly Grant[]
  onRevoke: (grant: Grant) => void
}

/** Who holds a key right now, one card per app: which slice, how much of the lease is gone, one click to take it back. */
export function GrantsPanel({ grants, onRevoke }: GrantsPanelProps) {
  return (
    <section aria-labelledby="grants-title">
      <SectionHead
        id="grants-title"
        title="Who has access now"
        count={grants.length}
        action={
          <ModuleLink to="/grants" className="section-link">
            Manage grants
          </ModuleLink>
        }
      />
      {grants.length === 0 ? (
        <div className="empty-card">
          <EmptyState
            illustration={<Illustration name="key" size={160} />}
            title="No app has access"
            description="Nothing you hold is readable by anyone else right now. Apps have to ask, and you have to approve."
            headingAs="h3"
          />
        </div>
      ) : (
        <ul className="grant-grid" aria-label="Active grants">
          {grants.map((grant) => (
            <li key={grant.id}>
              <GrantCard grant={grant} onRevoke={onRevoke} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

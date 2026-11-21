import { Avatar, EmptyState, Illustration } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { MoneyText } from '../../../components/MoneyText'
import { RoleBadge } from '../../../components/RoleBadge'
import { useHousehold } from '../hooks/useHousehold'

/** Each person's pot: who, how much, and their share of everything held in pots. */
export function PotTiles() {
  const { household, pots, currency, memberName } = useHousehold()
  const total = pots.reduce((sum, p) => sum + Math.max(p.balanceMinor, 0), 0)
  const roleOf = (uid: string | null) => household.members.find((m) => m.uid === uid)?.role

  return (
    <section aria-labelledby="pots-heading" className="ft-section">
      <div className="ft-section-head">
        <h2 id="pots-heading" className="ft-h2">
          Member pots
        </h2>
        <p className="ft-muted">Each person&apos;s own money inside the household.</p>
      </div>
      {pots.length === 0 ? (
        <EmptyState
          illustration={<Illustration name="empty" size={160} />}
          headingAs="h3"
          title="No member pots"
          description="Add a member and they get a pot of their own."
        />
      ) : (
        <ul className="ft-pots ft-plain-list">
          {pots.map((p) => {
            const name = p.ownerUid ? memberName(p.ownerUid) : p.name
            const role = roleOf(p.ownerUid)
            const share = total > 0 ? Math.round((Math.max(p.balanceMinor, 0) / total) * 100) : 0
            return (
              <li key={p.id} className="ft-pot">
                <div className="ft-pot-who">
                  <Avatar name={name} size="md" decorative />
                  <div>
                    <p className="ft-pot-name">{name}</p>
                    {role ? <RoleBadge role={role} /> : null}
                  </div>
                </div>
                <p className="ft-pot-balance">
                  <MoneyText minor={p.balanceMinor} currency={currency} />
                </p>
                <div
                  className="ft-share"
                  role="img"
                  aria-label={`${share}% of the money held in pots`}
                >
                  <span style={{ inlineSize: `${share}%` }} />
                </div>
                <ModuleLink
                  to={`/h/${household.id}/statement?account=${p.id}`}
                  aria-label={`Statement for ${name}`}
                >
                  Statement
                </ModuleLink>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

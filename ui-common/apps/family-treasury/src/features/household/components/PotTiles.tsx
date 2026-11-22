import {
  Avatar,
  BentoCard,
  BigStat,
  Button,
  ProgressStat,
  UsersIcon,
  type DashTone,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { AccountView } from '../../../api/types'
import type { Slot } from '../../../components/CardState'
import { RoleBadge } from '../../../components/RoleBadge'
import { minorDigits } from '../../../lib/money'
import { useHousehold } from '../hooks/useHousehold'

const TONES: readonly DashTone[] = ['lilac', 'lime', 'ink', 'brass']

/** Each pot's share of everything held in pots, in whole percent. */
export function potShares(pots: readonly Pick<AccountView, 'balanceMinor'>[]): number[] {
  const total = pots.reduce((sum, p) => sum + Math.max(p.balanceMinor, 0), 0)
  return pots.map((p) => (total > 0 ? Math.round((Math.max(p.balanceMinor, 0) / total) * 100) : 0))
}

/**
 * One member's pot as its own card: who, how much (a big counting figure), their share of all the money held in pots,
 * and the way to their statement. Rendered straight into the dashboard grid, one card per pot.
 */
export function PotCard({
  pot,
  share,
  index,
  className,
  style,
}: { pot: AccountView; share: number; index: number } & Slot) {
  const { household, currency, memberName } = useHousehold()
  const name = pot.ownerUid ? memberName(pot.ownerUid) : pot.name
  const role = household.members.find((m) => m.uid === pot.ownerUid)?.role
  const scale = 10 ** minorDigits(currency)
  return (
    <BentoCard
      span={4}
      title={name}
      icon={<Avatar name={name} size="sm" decorative />}
      actions={role ? <RoleBadge role={role} /> : null}
      className={className}
      {...(style ? { style } : {})}
    >
      <div className="ft-pot-body">
        <BigStat
          size="md"
          value={pot.balanceMinor / scale}
          locale="en-US"
          format={{ style: 'currency', currency }}
          caption="In their own pot"
        />
        <ProgressStat
          label="Share of all pots"
          value={share}
          tone={TONES[index % TONES.length] ?? 'lilac'}
        />
        <Button asChild size="sm" variant="secondary">
          <ModuleLink
            to={`/h/${household.id}/statement?account=${pot.id}`}
            aria-label={`Statement for ${name}`}
          >
            Statement
          </ModuleLink>
        </Button>
      </div>
    </BentoCard>
  )
}

/** Shown in place of the pot cards when the household has no member pots yet. */
export function NoPotsCard({ className, style }: Slot) {
  const { household } = useHousehold()
  return (
    <BentoCard
      span={12}
      title="Member pots"
      icon={<UsersIcon size={18} />}
      className={className}
      {...(style ? { style } : {})}
    >
      <p className="ft-muted">
        Each member gets a pot of their own inside the household.{' '}
        <ModuleLink to={`/h/${household.id}/members`}>Add a member</ModuleLink> to create one.
      </p>
    </BentoCard>
  )
}

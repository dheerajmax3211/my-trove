import {
  BentoCard,
  BigStat,
  Button,
  Donut,
  FolderIcon,
  KeyValueList,
  PlusIcon,
  Skeleton,
  type KeyValueItem,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Attribute } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { sensitivityCounts, vaultGroups } from '../summary'
import { useAttributes } from '../../vault/hooks/useVault'

const MAX_GROUPS = 4

function VaultContents({ attributes }: { attributes: readonly Attribute[] }) {
  const groups = vaultGroups(attributes)
  const shown = groups.slice(0, MAX_GROUPS)
  const items: KeyValueItem[] = shown.map((g) => ({
    id: g.name,
    label: g.name,
    value: (
      <span className="nowrap">{g.count === 1 ? '1 attribute' : `${g.count} attributes`}</span>
    ),
  }))
  const hidden = groups.length - shown.length
  const counts = sensitivityCounts(attributes)
  return (
    <>
      <div className="vault-viz">
        <Donut
          label="Attributes by sensitivity"
          size={132}
          thickness={14}
          legend={false}
          center={<strong>{attributes.length}</strong>}
          segments={counts.map(({ level, count }, i) => ({
            label: level.toLowerCase(),
            value: count,
            tone: (['lilac', 'lime', 'brass', 'danger'] as const)[i % 4]!,
          }))}
        />
        <ul className="chips" aria-label="Attributes by sensitivity" style={{ flex: '1 1 8rem' }}>
          {counts.map(({ level, count }) => (
            <li key={level}>
              <span className="chip">
                {level.toLowerCase()} {count}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="vault-groups" style={{ marginTop: 'var(--pp-space-4)' }}>
        <KeyValueList items={items} layout="inline" dense aria-label="Groups in your vault" />
        {hidden > 0 ? (
          <p className="muted" style={{ marginTop: 'var(--pp-space-2)' }}>
            and {hidden} more {hidden === 1 ? 'group' : 'groups'}
          </p>
        ) : null}
      </div>
    </>
  )
}

/** The one black card: how many facts the vault holds, at which sensitivity, in which groups. */
export function VaultPanel() {
  const attributes = useAttributes()
  return (
    <BentoCard span={4} tone="dark" title="Your vault" icon={<FolderIcon size={18} />}>
      {attributes.isPending ? (
        <Skeleton height="8rem" />
      ) : attributes.isError ? (
        <ErrorState error={attributes.error} onRetry={() => void attributes.refetch()} />
      ) : attributes.data.length === 0 ? (
        <>
          <BigStat size="md" value={0} unit="attributes" countUp={false} />
          <p className="stat-note">Nothing stored yet. Add the first fact you might want to lend.</p>
        </>
      ) : (
        <VaultContents attributes={attributes.data} />
      )}
      <div className="card-actions">
        <Button size="sm" asChild>
          <ModuleLink to="/vault">Open vault</ModuleLink>
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<PlusIcon size={16} />} asChild>
          <ModuleLink to="/vault?add=1">Add attribute</ModuleLink>
        </Button>
      </div>
    </BentoCard>
  )
}

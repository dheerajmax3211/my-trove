import { BentoCard, BigStat, Button, Donut, FolderIcon, PlusIcon, Skeleton } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Attribute } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { sensitivityCounts } from '../summary'
import { useAttributes } from '../../vault/hooks/useVault'

function VaultContents({ attributes }: { attributes: readonly Attribute[] }) {
  const counts = sensitivityCounts(attributes)
  return (
    <>
      <BigStat
        size="md"
        value={attributes.length}
        unit={attributes.length === 1 ? 'attribute' : 'attributes'}
        trend="flat"
        caption="Facts you could lend"
      />
      <div className="vault-viz">
        <Donut
          label="Attributes by sensitivity"
          size={104}
          thickness={12}
          legend={false}
          segments={counts.map(({ level, count }, i) => ({
            label: level.toLowerCase(),
            value: count,
            tone: (['lilac', 'lime', 'brass', 'danger'] as const)[i % 4]!,
          }))}
        />
        <ul className="chips" aria-label="Counts by sensitivity" style={{ flex: '1 1 6rem' }}>
          {counts.map(({ level, count }) => (
            <li key={level}>
              <span className="chip">
                {level.toLowerCase()} {count}
              </span>
            </li>
          ))}
        </ul>
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
          <p className="stat-note">
            Nothing stored yet. Add the first fact you might want to lend.
          </p>
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

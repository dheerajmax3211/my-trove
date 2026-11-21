import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValueList,
  PlusIcon,
  Skeleton,
  type KeyValueItem,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Attribute } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { SensitivityBadge } from '../../../shared/components/SensitivityBadge'
import { sensitivityCounts, vaultGroups } from '../summary'
import { useAttributes } from '../../vault/hooks/useVault'

const MAX_GROUPS = 6

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
  return (
    <div className="stack">
      <KeyValueList items={items} layout="inline" dense aria-label="Groups in your vault" />
      {hidden > 0 ? (
        <p className="muted">
          and {hidden} more {hidden === 1 ? 'group' : 'groups'}
        </p>
      ) : null}
      <ul className="chips" aria-label="Attributes by sensitivity">
        {sensitivityCounts(attributes).map(({ level, count }) => (
          <li key={level}>
            <SensitivityBadge level={level} />
            <span className="muted"> {count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A compact picture of the vault: how many facts, in which groups, at which sensitivity. */
export function VaultPanel() {
  const attributes = useAttributes()
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Your vault</CardTitle>
        <CardDescription>
          What you keep about yourself. Apps only see what you approve.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {attributes.isPending ? (
          <Skeleton height="8rem" />
        ) : attributes.isError ? (
          <ErrorState error={attributes.error} onRetry={() => void attributes.refetch()} />
        ) : attributes.data.length === 0 ? (
          <p className="muted">Nothing stored yet. Add the first fact you might want to lend.</p>
        ) : (
          <VaultContents attributes={attributes.data} />
        )}
        <div className="row-wrap">
          <Button variant="secondary" asChild>
            <ModuleLink to="/vault">Open vault</ModuleLink>
          </Button>
          <Button variant="secondary" leftIcon={<PlusIcon size={16} />} asChild>
            <ModuleLink to="/vault?add=1">Add attribute</ModuleLink>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

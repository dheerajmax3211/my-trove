import { LockIcon, Select } from '@platform/ui'
import { ModuleNavLink, useModuleNavigate } from '@platform/workspace-kit'
import { writeStored } from '../../../lib/storage'
import { useHouseholds } from '../hooks/useHouseholds'
import { LAST_HOUSEHOLD_KEY, type SectionItem } from '../nav'

function HouseholdSwitcher({ currentId }: { currentId: string | null }) {
  const households = useHouseholds()
  const navigate = useModuleNavigate()
  const list = households.data ?? []
  if (list.length === 0) return null
  return (
    <Select
      size="sm"
      aria-label="Household"
      value={currentId ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') navigate('/welcome')
        else {
          writeStored(LAST_HOUSEHOLD_KEY, e.target.value)
          navigate(`/h/${e.target.value}`)
        }
      }}
      className="ft-inline-select"
    >
      {currentId === null ? (
        <option value="" disabled>
          Choose a household
        </option>
      ) : null}
      {list.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
      <option value="__new">New household...</option>
    </Select>
  )
}

export interface ModuleBarProps {
  currentHouseholdId: string | null
  /** The household's sections. Empty before the household (and who you are in it) has loaded. */
  sections?: readonly SectionItem[]
}

/**
 * The module's own header: which household, the standing reminder that this is bookkeeping, and the household's
 * sections as in-module navigation (the workspace sidebar can only list the module's static pages).
 */
export function ModuleBar({ currentHouseholdId, sections = [] }: ModuleBarProps) {
  return (
    <div className="ft-bar">
      <div className="ft-bar-top">
        <HouseholdSwitcher currentId={currentHouseholdId} />
        <p className="ft-bookkeeping">
          <LockIcon size={16} />
          <span>
            <strong>Bookkeeping only.</strong> No real money moves.
          </span>
        </p>
      </div>
      {sections.length > 0 ? (
        <nav aria-label="Household sections" className="ft-sections">
          <ul>
            {sections.map((item) => (
              <li key={item.to}>
                <ModuleNavLink to={item.to} end={item.end ?? false}>
                  {item.label}
                </ModuleNavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  )
}

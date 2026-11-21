import type { Role } from '../../api/types'

/** The key under which the household you used last is remembered (per browser). */
export const LAST_HOUSEHOLD_KEY = 'ft:last-household'

export interface SectionItem {
  /** Module-relative (starts with `/`); `ModuleNavLink` puts the workspace base in front. */
  to: string
  label: string
  end?: boolean
}

/**
 * The sections of one household, per role. The workspace sidebar only shows the module's static `nav`, so these live
 * in the module's own content (see `ModuleBar`). Kids get a deliberately short, simple list.
 */
export function sectionsFor(role: Role, householdId: string): SectionItem[] {
  const base = `/h/${householdId}`
  if (role === 'KID') {
    return [
      { to: base, label: 'My pot', end: true },
      { to: `${base}/move`, label: 'Spend' },
      { to: `${base}/approvals`, label: 'My requests' },
      { to: `${base}/statement`, label: 'Statement' },
    ]
  }
  const items: SectionItem[] = [
    { to: base, label: 'Dashboard', end: true },
    { to: `${base}/move`, label: 'Move money' },
    { to: `${base}/activity`, label: 'Activity' },
    { to: `${base}/approvals`, label: 'Approvals' },
    { to: `${base}/statement`, label: 'Statements' },
  ]
  if (role === 'OWNER' || role === 'APPROVER')
    items.push({ to: `${base}/allowances`, label: 'Allowances' })
  if (role === 'OWNER') items.push({ to: `${base}/reconciliation`, label: 'Reconciliation' })
  items.push({ to: `${base}/members`, label: 'Members and roles' })
  return items
}

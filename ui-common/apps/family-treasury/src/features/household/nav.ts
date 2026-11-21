import type { Role } from '../../api/types'
import type { NavItem } from './components/Frame'

/** Sidebar entries per role. Kids get a deliberately short, simple menu. */
export function navFor(role: Role, base: string): NavItem[] {
  if (role === 'KID') {
    return [
      { to: base, label: 'My pot', end: true },
      { to: `${base}/move`, label: 'Spend' },
      { to: `${base}/approvals`, label: 'My requests' },
      { to: `${base}/statement`, label: 'Statement' },
    ]
  }
  const items: NavItem[] = [
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

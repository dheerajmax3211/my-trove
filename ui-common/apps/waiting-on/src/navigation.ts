import { HourglassIcon, PlusIcon } from '@platform/ui'
import type { ModuleNavItem } from '@platform/workspace-kit'

/** Product navigation for the workspace sidebar; paths are module-relative. */
export const NAV: ModuleNavItem[] = [
  { to: '/', label: 'Waiting on', icon: HourglassIcon, end: true },
  { to: '/new', label: 'Add something', icon: PlusIcon },
]

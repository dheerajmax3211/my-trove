import {
  ChartIcon,
  ClockIcon,
  CoinsIcon,
  HomeIcon,
  KeyIcon,
  ShieldIcon,
  UsersIcon,
} from '@platform/ui'
import type { ModuleNavItem } from '@platform/workspace-kit'
import { PERMISSIONS } from './catalogue'

export interface AdminSection extends ModuleNavItem {
  description: string
}

/** The console's screens: the module's navigation and the overview's quick links come from this one list. */
export const SECTIONS: readonly AdminSection[] = [
  {
    to: '/',
    label: 'Overview',
    end: true,
    icon: HomeIcon,
    description: 'Who you are here and what you can open.',
  },
  {
    to: '/users',
    label: 'Users',
    icon: UsersIcon,
    permission: PERMISSIONS.usersRead,
    description: 'Find people, change their roles, suspend or restore them.',
  },
  {
    to: '/roles',
    label: 'Roles',
    icon: ShieldIcon,
    permission: PERMISSIONS.usersRead,
    description: 'What each role is allowed to do.',
  },
  {
    to: '/usage',
    label: 'Usage',
    icon: ChartIcon,
    permission: PERMISSIONS.usageReadAll,
    description: 'Traffic, errors and latency across the platform.',
  },
  {
    to: '/audit',
    label: 'Audit',
    icon: ClockIcon,
    permission: PERMISSIONS.auditRead,
    description: 'Who changed which role, plan or access, and when.',
  },
  {
    to: '/flags',
    label: 'Flags',
    icon: KeyIcon,
    permission: PERMISSIONS.flagsManage,
    description: 'Roll features out to a share of people.',
  },
  {
    to: '/plans',
    label: 'Plans',
    icon: CoinsIcon,
    permission: PERMISSIONS.usageReadAll,
    description: 'The request limits of each plan.',
  },
]

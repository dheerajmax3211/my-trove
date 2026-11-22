import type { WorkspaceSession } from '@platform/workspace-kit'

/** The developer tools' own permissions (design 5.2). Holding any one opens the Developer page. */
export const DEVELOPER_PERMISSIONS = [
  'apps:manage',
  'keys:manage',
  'webhooks:manage',
  'sandbox:use',
  'logs:read:own',
  'workspaces:manage',
] as const

export function canOpenDeveloper(session: Pick<WorkspaceSession, 'can'>): boolean {
  return DEVELOPER_PERMISSIONS.some((permission) => session.can(permission))
}

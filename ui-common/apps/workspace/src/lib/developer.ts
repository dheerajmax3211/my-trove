import type { WorkspaceSession } from '@platform/workspace-kit'

/** The developer tools' own permissions (design 5.2). The console lists the ones the signed-in user holds. */
export const DEVELOPER_PERMISSIONS = [
  'apps:manage',
  'keys:manage',
  'webhooks:manage',
  'sandbox:use',
  'logs:read:own',
  'workspaces:manage',
] as const

/**
 * The Developer console opens for holders of `apps:manage`: the owner and developers. Members see Connected apps on the
 * Account page instead, and get the "not part of your role" page here.
 */
export function canOpenDeveloper(session: Pick<WorkspaceSession, 'can'>): boolean {
  return session.can('apps:manage')
}

import {
  Badge,
  CheckIcon,
  PersonaBadge,
  VisuallyHidden,
  personas,
  type Persona,
} from '@platform/ui'
import { ErrorPanel, LoadingBlock, Screen } from '../components/common'
import shared from '../components/shared.module.css'
import {
  AREA_ORDER,
  PERMISSIONS,
  PERMISSION_CATALOGUE,
  PERSONA_ORDER,
  permissionArea,
} from '../lib/catalogue'
import { useAuthQuery } from '../lib/api'
import type { RoleView } from '../lib/types'
import styles from './Roles.module.css'

const isPersona = (name: string): name is Persona => (personas as readonly string[]).includes(name)

function sortRoles(roles: RoleView[]): RoleView[] {
  const rank = (name: string) => {
    const i = (PERSONA_ORDER as readonly string[]).indexOf(name)
    return i === -1 ? PERSONA_ORDER.length : i
  }
  return [...roles].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

export function RolesScreen() {
  return (
    <Screen
      title="Roles"
      area="Roles"
      permission={PERMISSIONS.usersRead}
      description="What each role can do. Roles are fixed; people hold one or more of them."
    >
      <RolesMatrix />
    </Screen>
  )
}

function RolesMatrix() {
  const query = useAuthQuery<RoleView[]>('/v1/admin/roles')
  if (query.isPending) return <LoadingBlock label="Loading roles" />
  if (query.isError) {
    return <ErrorPanel error={query.error} subject="roles" onRetry={() => void query.refetch()} />
  }
  const roles = sortRoles(query.data)

  const known = new Set(Object.keys(PERMISSION_CATALOGUE))
  const all = new Set<string>(known)
  for (const role of roles) for (const p of role.permissions) all.add(p)
  const groups = AREA_ORDER.map((area) => ({
    area,
    permissions: [...all].filter((p) => permissionArea(p) === area).sort(),
  })).filter((g) => g.permissions.length > 0)

  return (
    <div className={shared.stack}>
      <ul className={styles.personas} aria-label="Roles and what they are for">
        {roles.map((role) => (
          <li key={role.name} className={styles.persona}>
            {isPersona(role.name) ? (
              <PersonaBadge persona={role.name} />
            ) : (
              <Badge>{role.name}</Badge>
            )}
            <p className={shared.muted}>{role.description || 'No description.'}</p>
            <p className={shared.subtle}>{role.permissions.length} permissions</p>
          </li>
        ))}
      </ul>

      {/* A scrollable region must be keyboard focusable (WCAG 2.1.1). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.scroll} role="region" aria-label="Permissions by role" tabIndex={0}>
        <table className={styles.matrix}>
          <caption>
            <VisuallyHidden>Which roles hold which permissions</VisuallyHidden>
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                Permission
              </th>
              {roles.map((role) => (
                <th key={role.name} scope="col" className={styles.roleHead}>
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.area}>
              <tr>
                <th scope="rowgroup" colSpan={roles.length + 1} className={styles.group}>
                  {group.area}
                </th>
              </tr>
              {group.permissions.map((permission) => (
                <tr key={permission}>
                  <th scope="row" className={styles.permission}>
                    <code className={shared.mono}>{permission}</code>
                    <span className={shared.subtle}>
                      {PERMISSION_CATALOGUE[permission]?.description ??
                        'Not in the console catalogue'}
                    </span>
                  </th>
                  {roles.map((role) => {
                    const has = role.permissions.includes(permission)
                    return (
                      <td key={role.name} className={has ? styles.yes : styles.no}>
                        {has ? (
                          <>
                            <CheckIcon size={18} aria-hidden="true" />
                            <VisuallyHidden>{`${role.name} has ${permission}`}</VisuallyHidden>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">&ndash;</span>
                            <VisuallyHidden>{`${role.name} does not have ${permission}`}</VisuallyHidden>
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}

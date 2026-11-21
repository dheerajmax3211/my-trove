import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui'
import { ROLES } from '../../../api/types'
import { CAPABILITIES } from '../../../lib/permissions'
import { ROLE_LABEL } from '../../../components/RoleBadge'

export function RoleMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">What each role can do</CardTitle>
        <CardDescription>
          The service enforces these rules; the app hides what you cannot use.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Scrollable regions must be keyboard focusable (WCAG 2.1.1). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div className="ft-table-wrap" role="region" aria-label="Role permissions" tabIndex={0}>
          <table className="ft-table">
            <caption className="ft-sr-only">Permissions by role</caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="ft-center-cell">
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.label}</th>
                  {ROLES.map((r) => (
                    <td key={r} className="ft-center-cell">
                      {c.roles[r] ? 'Yes' : 'No'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

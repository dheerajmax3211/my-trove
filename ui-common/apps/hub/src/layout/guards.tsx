import { Button, EmptyState } from '@platform/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isAdmin, useProfile } from '../features/session/profile'
import { usePageTitle } from '../lib/usePageTitle'

/** Blocks a route for non-admins. The nav link is already hidden; this covers typed URLs. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const profile = useProfile()
  usePageTitle('Administrators only')
  if (!isAdmin(profile))
    return (
      <EmptyState
        title="Administrators only"
        description="Your account does not have the ADMIN role, so this area is not available to you."
        action={
          <Button asChild>
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    )
  return <>{children}</>
}

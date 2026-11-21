import { useEffect, type ReactNode } from 'react'
import { useAuth } from './AuthProvider'

export interface RequireAuthProps {
  children: ReactNode
  /** Shown while the initial auth state is resolving. */
  loading?: ReactNode
  /** Rendered when signed out: a sign-in page, or a router redirect such as `<Navigate to="/login" replace />`. */
  fallback?: ReactNode
  /** Called when the user is (or becomes) signed out; use for imperative navigation. */
  onUnauthenticated?: () => void
}

/**
 * Route guard. Renders `children` only for signed-in users. Router-agnostic on purpose:
 *
 *   <RequireAuth loading={<Spinner />} fallback={<Navigate to="/login" replace />}>
 *     <Outlet />
 *   </RequireAuth>
 */
export function RequireAuth({
  children,
  loading = null,
  fallback = null,
  onUnauthenticated,
}: RequireAuthProps) {
  const { status } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') onUnauthenticated?.()
  }, [status, onUnauthenticated])

  if (status === 'loading') return <>{loading}</>
  if (status === 'unauthenticated') return <>{fallback}</>
  return <>{children}</>
}

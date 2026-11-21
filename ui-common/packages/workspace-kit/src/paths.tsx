import { createContext, forwardRef, useCallback, useContext, type ReactNode } from 'react'
import {
  Link,
  NavLink,
  useNavigate,
  type LinkProps,
  type NavLinkProps,
  type NavigateOptions,
  type To,
} from 'react-router-dom'

const BaseContext = createContext('')

function normalize(base: string): string {
  return base.replace(/\/+$/, '')
}

/** `joinPath('/app/x', '/new')` is `/app/x/new`; `joinPath('/app/x', '/')` is `/app/x`; an empty base changes nothing. */
export function joinPath(base: string, path: string): string {
  if (!path.startsWith('/')) return path
  const b = normalize(base)
  if (path === '/') return b || '/'
  return b + path
}

function resolveTo(to: To, base: string): To {
  if (typeof to === 'string') return joinPath(base, to)
  if (typeof to.pathname === 'string') return { ...to, pathname: joinPath(base, to.pathname) }
  return to
}

/** Mounts a product under `base` (for example `/app/waiting-on`). Standalone apps never render this. */
export function ModuleBaseProvider({ base, children }: { base: string; children: ReactNode }) {
  return <BaseContext value={normalize(base)}>{children}</BaseContext>
}

/** Maps a module-relative path to a real URL. The identity when no base is set (standalone apps, tests). */
export function useModulePath(): (path: string) => string {
  const base = useContext(BaseContext)
  return useCallback((path: string) => joinPath(base, path), [base])
}

export function useModuleBase(): string {
  return useContext(BaseContext)
}

export function useModuleNavigate(): (to: string | number, options?: NavigateOptions) => void {
  const navigate = useNavigate()
  const base = useContext(BaseContext)
  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === 'number') void navigate(to)
      else void navigate(joinPath(base, to), options)
    },
    [navigate, base],
  )
}

/** A react-router `Link` whose `to` is module-relative. */
export const ModuleLink = forwardRef<HTMLAnchorElement, LinkProps>(function ModuleLink(props, ref) {
  const base = useContext(BaseContext)
  return <Link ref={ref} {...props} to={resolveTo(props.to, base)} />
})

/** A react-router `NavLink` whose `to` is module-relative. */
export const ModuleNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function ModuleNavLink(props, ref) {
    const base = useContext(BaseContext)
    return <NavLink ref={ref} {...props} to={resolveTo(props.to, base)} />
  },
)

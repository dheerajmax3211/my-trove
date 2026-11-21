import type { ComponentType, ReactNode } from 'react'

/** A permission string such as `products:use` or `usage:read:all` (see the platform design doc, section 5.2). */
export type Permission = string

export interface ModuleNavItem {
  /** Starts with `/` and is relative to the module's base (`/app/<id>` in the workspace, empty standalone). */
  to: string
  label: string
  icon?: ComponentType<{ size?: number }>
  end?: boolean
  /** Hide the item unless the session holds this permission. */
  permission?: Permission
}

/** One line in the workspace "Today" feed. `to` is relative to the module base. */
export interface TodayItem {
  id: string
  title: string
  subtitle?: string
  dueAt?: string
  severity: 'info' | 'warn' | 'danger'
  to: string
}

/**
 * What a product exposes to the workspace. The workspace supplies auth, the API client (bound to
 * `${gateway}/api/<service>`), the query cache, theme, toasts and the router; the module supplies pages.
 */
export interface ProductModule {
  /** URL segment and registry key: waiting-on | consent | home-pulse | ask-your-life | digital-legacy | family-treasury | core | admin */
  id: string
  /** Gateway route id used for this module's API client. */
  service: string
  title: string
  tagline: string
  description: string
  /** A CSS colour expression from the design tokens, e.g. `var(--pp-color-accent)`. */
  accent: string
  icon: ComponentType<{ size?: number }>
  nav: ModuleNavItem[]
  /** Default `products:use`. */
  requiredPermission?: Permission
  /** Product-specific providers (clock, feature context). Rendered inside the workspace providers. */
  Providers?: ComponentType<{ children: ReactNode }>
  /** Renders a `<Routes>` tree; every path is relative to the module base. */
  Routes: ComponentType
  /** Items for the Today feed. Called as a hook inside the module's providers. */
  useTodayItems?: () => { items: TodayItem[]; loading: boolean }
  /** In-memory mock API used when the workspace runs in demo mode. */
  createDemoFetch?: () => typeof fetch
}

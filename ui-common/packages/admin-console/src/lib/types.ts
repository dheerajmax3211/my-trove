/** Wire shapes of the auth and platform-service admin APIs (read from the controllers). */

export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
}

export interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
  roles: string[]
  permissions: string[]
  plan: string
  suspended: boolean
  permissionsVersion: number
}

export interface RoleView {
  name: string
  description: string
  permissions: string[]
}

export interface Identity {
  id: string
  email: string | null
  displayName: string | null
}

export interface AuditEntry {
  id: string
  at: string
  actorId: string | null
  action: string
  targetId: string | null
  detail: Record<string, unknown> | null
}

export interface ServiceUsage {
  service: string
  requests: number
  errors: number
}

export interface SeriesPoint {
  ts: string
  requests: number
  errors: number
}

export interface UsageSummary {
  totalRequests: number
  errorRate: number
  p50Ms: number | null
  p95Ms: number | null
  activeUsers: number
  byService: ServiceUsage[]
  byStatusClass: Record<string, number>
  series: SeriesPoint[]
  from: string
  to: string
  resolution: '1m' | '1h' | '1d'
}

export interface TopUser {
  principalType: string
  principalId: string
  requests: number
  errors: number
}

export interface Flag {
  key: string
  description: string
  enabled: boolean
  rolloutPercent: number
  allowedPlans: string[]
  allowedRoles: string[]
  createdAt?: string | null
  updatedAt?: string | null
  updatedBy?: string | null
}

export interface FlagInput {
  key?: string
  description: string
  enabled: boolean
  rolloutPercent: number
  allowedPlans: string[]
  allowedRoles: string[]
}

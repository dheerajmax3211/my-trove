export interface AuditEvent {
  id: string
  actorUid: string
  /** `null` for personal events. */
  householdId: string | null
  action: string
  subjectType: string
  subjectId: string
  details: Record<string, unknown>
  createdAt: string
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
}

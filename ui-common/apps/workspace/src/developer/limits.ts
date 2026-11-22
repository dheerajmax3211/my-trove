export interface PlanLimits {
  /** Active API keys across all of the owner's apps. */
  keys: number
  /** Active webhook endpoints across all of the owner's apps. */
  webhooks: number
}

/** The plan table from the platform service (platform-service/README.md, "Limits by plan"). */
const PLAN_LIMITS: Record<string, PlanLimits> = {
  FREE: { keys: 3, webhooks: 1 },
  PRO: { keys: 10, webhooks: 5 },
  DEVELOPER: { keys: 50, webhooks: 20 },
}

/** The limits for a plan. A plan this console does not know gets the FREE limits, the smallest ones. */
export function limitsFor(plan: string): PlanLimits {
  return PLAN_LIMITS[plan.toUpperCase()] ?? PLAN_LIMITS.FREE!
}

export interface Capacity {
  used: number
  limit: number
  remaining: number
  full: boolean
}

export function capacity(used: number, limit: number): Capacity {
  return { used, limit, remaining: Math.max(0, limit - used), full: used >= limit }
}

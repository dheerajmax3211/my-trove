import { SENSITIVITIES, type Attribute, type Grant, type Sensitivity } from '../../shared/api/types'
import { buildTree, countAttributes } from '../vault/api/tree'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The sentence under the page title: the whole picture in one breath. */
export function homeSummary(pending: number, activeGrants: number): string {
  const waiting =
    pending === 0
      ? 'Nothing is waiting for your decision.'
      : `${plural(pending, 'request is', 'requests are')} waiting for your decision.`
  const access =
    activeGrants === 0
      ? 'No app can read your vault right now.'
      : `${plural(activeGrants, 'app can', 'apps can')} read part of your vault right now.`
  return `${waiting} ${access}`
}

export interface VaultGroup {
  name: string
  count: number
}

/** Top-level groups of the vault (`profile`, `health`...) with how many attributes each holds. */
export function vaultGroups(attributes: readonly Attribute[]): VaultGroup[] {
  return buildTree(attributes).map((node) => ({ name: node.segment, count: countAttributes(node) }))
}

export function sensitivityCounts(
  attributes: readonly Attribute[],
): { level: Sensitivity; count: number }[] {
  return SENSITIVITIES.map((level) => ({
    level,
    count: attributes.filter((a) => a.sensitivity === level).length,
  })).filter((entry) => entry.count > 0)
}

/** How much of a grant's life has passed, 0 to 1, for the lease bar. */
export function leaseElapsed(grant: Pick<Grant, 'createdAt' | 'expiresAt'>, now: number): number {
  const start = Date.parse(grant.createdAt)
  const end = Date.parse(grant.expiresAt)
  if (!(end > start)) return 1
  return Math.min(1, Math.max(0, (now - start) / (end - start)))
}

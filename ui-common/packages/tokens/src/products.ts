/**
 * The six products and their accent identity. Ids are the URL segments used by the workspace;
 * keys are the camelCase form used inside token names (`productWaitingOn`).
 */
export const productIds = [
  'waiting-on',
  'consent',
  'home-pulse',
  'ask-your-life',
  'digital-legacy',
  'family-treasury',
] as const

export type ProductId = (typeof productIds)[number]

export const productKeys = [
  'waitingOn',
  'consent',
  'homePulse',
  'askYourLife',
  'digitalLegacy',
  'familyTreasury',
] as const

export type ProductKey = (typeof productKeys)[number]

const KEY_BY_ID: Record<ProductId, ProductKey> = {
  'waiting-on': 'waitingOn',
  consent: 'consent',
  'home-pulse': 'homePulse',
  'ask-your-life': 'askYourLife',
  'digital-legacy': 'digitalLegacy',
  'family-treasury': 'familyTreasury',
}

export const productNames: Record<ProductId, string> = {
  'waiting-on': 'Waiting On',
  consent: 'Consent',
  'home-pulse': 'Home Pulse',
  'ask-your-life': 'Ask Your Life',
  'digital-legacy': 'Digital Legacy',
  'family-treasury': 'Family Treasury',
}

export function isProductId(value: string): value is ProductId {
  return (productIds as readonly string[]).includes(value)
}

export function productKey(id: ProductId): ProductKey {
  return KEY_BY_ID[id]
}

export type ProductColorRole = 'accent' | 'hover' | 'active' | 'subtle' | 'text' | 'on'

const CSS_SUFFIX: Record<ProductColorRole, string> = {
  accent: '',
  hover: '-hover',
  active: '-active',
  subtle: '-subtle',
  text: '-text',
  on: '-on',
}

/**
 * `var(--pp-color-product-waiting-on)` and friends. Works anywhere, in either theme, without a
 * `data-product` wrapper (use it for marks, chips and charts that name a product explicitly).
 */
export function productVar(id: ProductId, role: ProductColorRole = 'accent'): string {
  return `var(--pp-color-product-${id}${CSS_SUFFIX[role]})`
}

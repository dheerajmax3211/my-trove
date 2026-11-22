import { vi } from 'vitest'

/** Make `prefers-reduced-motion: reduce` match (or not) for the current test. */
export function mockReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  window.matchMedia = globalThis.matchMedia
}

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void

/**
 * Replace IntersectionObserver with a controllable fake. `trigger(true)` reports every observed
 * element as intersecting.
 */
export function mockIntersectionObserver(): { trigger: (intersecting: boolean) => void } {
  const callbacks = new Set<IOCallback>()
  class FakeIO {
    private cb: IOCallback
    constructor(cb: IOCallback) {
      this.cb = cb
      callbacks.add(cb)
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      callbacks.delete(this.cb)
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO)
  return {
    trigger: (intersecting) => {
      for (const cb of callbacks) cb([{ isIntersecting: intersecting }])
    },
  }
}

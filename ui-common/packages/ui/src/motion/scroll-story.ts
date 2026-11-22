import type { gsap as Gsap } from 'gsap'
import type { ScrollTrigger as ScrollTriggerPlugin } from 'gsap/ScrollTrigger'
import { useEffect, useRef, type RefObject } from 'react'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { useScrollSmooth } from './SmoothScroll'

export interface ScrollStoryKit {
  gsap: typeof Gsap
  ScrollTrigger: typeof ScrollTriggerPlugin
}

let kit: Promise<ScrollStoryKit> | null = null

/**
 * Lazy-load GSAP and ScrollTrigger (about 45 kB gzipped) the first time a pinned or scrubbed
 * scroll story needs them. Apps import this through `@platform/ui` so they never add their own
 * copy. Nothing from GSAP is in the main bundle.
 */
export function loadScrollStory(): Promise<ScrollStoryKit> {
  kit ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
    ([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger)
      return { gsap, ScrollTrigger }
    },
  )
  return kit
}

export interface ScrollStoryContext extends ScrollStoryKit {
  /** The element passed to the hook. Select children with `gsap.utils.selector(root)`. */
  root: HTMLElement
}

/**
 * Run a GSAP / ScrollTrigger timeline (pinned sections, scrubbed progress, horizontal drift) scoped
 * to `ref`. Everything created inside `setup` is reverted on unmount. The callback is skipped
 * entirely under reduced motion, so write the static layout as the default and let this enhance it.
 * When `SmoothScroll` is mounted, ScrollTrigger is kept in sync with Lenis automatically.
 *
 * ```tsx
 * useScrollStory(ref, ({ gsap, root }) => {
 *   gsap.to(root.querySelector('.panel'), { xPercent: -100, scrollTrigger: { trigger: root, pin: true, scrub: true } })
 * })
 * ```
 */
export function useScrollStory(
  ref: RefObject<HTMLElement | null>,
  setup: (ctx: ScrollStoryContext) => void | (() => void),
): void {
  const reduced = useReducedMotion()
  const { lenis } = useScrollSmooth()
  const setupRef = useRef(setup)
  useEffect(() => {
    setupRef.current = setup
  })

  useEffect(() => {
    const root = ref.current
    if (!root || reduced) return
    let cancelled = false
    let revert: (() => void) | undefined
    let detach: (() => void) | undefined
    void loadScrollStory().then(({ gsap, ScrollTrigger }) => {
      if (cancelled) return
      if (lenis) {
        const update = () => ScrollTrigger.update()
        lenis.on('scroll', update)
        detach = () => lenis.off('scroll', update)
      }
      const ctx = gsap.context(() => {
        const cleanup = setupRef.current({ gsap, ScrollTrigger, root })
        return cleanup
      }, root)
      revert = () => ctx.revert()
    })
    return () => {
      cancelled = true
      detach?.()
      revert?.()
    }
  }, [ref, reduced, lenis])
}

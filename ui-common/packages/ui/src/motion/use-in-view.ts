import { useCallback, useEffect, useState } from 'react'

export interface UseInViewOptions {
  /** Stay `true` after the first time the element is seen (default). Set false to toggle. */
  once?: boolean
  /** `rootMargin` for the observer, e.g. `'-10% 0px'` to wait until the element is well inside. */
  margin?: string
  /** 0..1, how much of the element must be visible. Default 0.15. */
  amount?: number
  /** Skip observing and report `true` (used by reduced motion and print). */
  disabled?: boolean
}

/**
 * Report whether an element is inside the viewport. Returns a ref callback and the flag, so it
 * works with any element and re-subscribes if the element changes:
 *
 * ```tsx
 * const [ref, inView] = useInView<HTMLDivElement>({ once: true })
 * ```
 *
 * Where `IntersectionObserver` does not exist (old browsers, jsdom, SSR) the flag is `true`, so
 * content is never left hidden.
 */
export function useInView<T extends Element = HTMLElement>(
  options: UseInViewOptions = {},
): readonly [(node: T | null) => void, boolean] {
  const { once = true, margin, amount = 0.15, disabled = false } = options
  const supported = typeof IntersectionObserver !== 'undefined'
  const [node, setNode] = useState<T | null>(null)
  const [seen, setSeen] = useState(false)
  const ref = useCallback((el: T | null) => setNode(el), [])

  useEffect(() => {
    if (!node || disabled || !supported) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setSeen(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setSeen(false)
          }
        }
      },
      { threshold: amount, ...(margin ? { rootMargin: margin } : {}) },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, once, margin, amount, disabled, supported])

  return [ref, disabled || !supported ? true : seen] as const
}

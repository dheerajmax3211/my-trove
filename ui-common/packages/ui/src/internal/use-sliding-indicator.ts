import { useEffect, type RefObject } from 'react'

/**
 * Keep a "sliding pill" in step with the active item of a list: it measures the element matching
 * `activeSelector` inside `container` and publishes `--pp-ind-x/y/w/h` on the container. CSS
 * moves the indicator with `transform` and `scale`-free width/height, so the move is a single
 * compositor transition. `data-indicator="ready"` is set after the first measurement so the
 * initial position never animates.
 *
 * It re-measures when the active attribute changes, when children are added or removed and when
 * the container resizes. Where `ResizeObserver` or `MutationObserver` are missing it measures once.
 */
export function useSlidingIndicator(
  container: RefObject<HTMLElement | null>,
  activeSelector: string,
): void {
  useEffect(() => {
    const root = container.current
    if (!root) return
    let raf = 0
    let readyRaf = 0
    let first = true

    const measure = () => {
      const active = root.querySelector<HTMLElement>(activeSelector)
      if (!active) {
        root.removeAttribute('data-indicator')
        return
      }
      const rootBox = root.getBoundingClientRect()
      const box = active.getBoundingClientRect()
      const scrollLeft = root.scrollLeft
      const scrollTop = root.scrollTop
      root.style.setProperty('--pp-ind-x', `${box.left - rootBox.left + scrollLeft}px`)
      root.style.setProperty('--pp-ind-y', `${box.top - rootBox.top + scrollTop}px`)
      root.style.setProperty('--pp-ind-w', `${box.width}px`)
      root.style.setProperty('--pp-ind-h', `${box.height}px`)
      if (first) {
        first = false
        // Let the first position paint before transitions are switched on.
        readyRaf = requestAnimationFrame(() => root.setAttribute('data-indicator', 'ready'))
        root.setAttribute('data-indicator', 'placed')
      }
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    measure()
    const mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule)
    mutation?.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-current', 'data-state', 'aria-selected'],
    })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resize?.observe(root)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(readyRaf)
      mutation?.disconnect()
      resize?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [container, activeSelector])
}

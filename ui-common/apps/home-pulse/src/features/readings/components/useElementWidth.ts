import { useEffect, useRef, useState, type RefObject } from 'react'

/** Tracks an element's width. Reports `fallback` until a real measurement exists (first paint, jsdom). */
export function useElementWidth<T extends HTMLElement>(
  fallback: number,
): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width > 0 ? width : fallback]
}

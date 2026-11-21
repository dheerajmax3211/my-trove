import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function read(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false
}

/**
 * True while the user has asked for reduced motion. CSS already collapses transitions; use this
 * for motion that JavaScript starts (scroll animation, drawn-in charts, count-ups).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(read)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(QUERY)
    const onChange = () => setReduced(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

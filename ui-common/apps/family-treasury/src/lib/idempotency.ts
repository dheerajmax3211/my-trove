import { useCallback, useRef } from 'react'

/** A fresh Idempotency-Key. The backend accepts 1-128 characters from [A-Za-z0-9._:~-]; a UUID fits. */
export function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export interface IdempotencyKeyHandle {
  /** The key for the current intent. Stable across calls (retries, double clicks) until `rotate()`. */
  current: () => string
  /** Start a new intent: the next `current()` is a brand new key. */
  rotate: () => void
}

/**
 * One key per user intent. A form creates this when it opens; every submit of that form (a double click, a retry
 * after a network error) sends the SAME key, so the server replays instead of posting twice. Call `rotate()` once the
 * intent is finished (success) or the server says the key was already used for something different.
 */
export function useIdempotencyKey(): IdempotencyKeyHandle {
  const keyRef = useRef<string | null>(null)
  const current = useCallback(() => (keyRef.current ??= newIdempotencyKey()), [])
  const rotate = useCallback(() => {
    keyRef.current = null
  }, [])
  return { current, rotate }
}

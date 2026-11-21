import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newIdempotencyKey, useIdempotencyKey } from './idempotency'

const BACKEND_KEY_PATTERN = /^[A-Za-z0-9._:~-]{1,128}$/

describe('newIdempotencyKey', () => {
  it('produces keys the backend accepts, and never repeats', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(200)
    for (const key of keys) expect(key).toMatch(BACKEND_KEY_PATTERN)
  })
})

describe('useIdempotencyKey', () => {
  it('returns the same key for every read of one intent (double click, retry)', () => {
    const { result } = renderHook(() => useIdempotencyKey())
    const first = result.current.current()
    expect(result.current.current()).toBe(first)
    expect(result.current.current()).toBe(first)
  })

  it('keeps the key across re-renders', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey())
    const first = result.current.current()
    rerender()
    expect(result.current.current()).toBe(first)
  })

  it('starts a new intent after rotate()', () => {
    const { result } = renderHook(() => useIdempotencyKey())
    const first = result.current.current()
    result.current.rotate()
    const second = result.current.current()
    expect(second).not.toBe(first)
    expect(result.current.current()).toBe(second)
  })

  it('gives each form instance its own key', () => {
    const a = renderHook(() => useIdempotencyKey())
    const b = renderHook(() => useIdempotencyKey())
    expect(a.result.current.current()).not.toBe(b.result.current.current())
  })
})

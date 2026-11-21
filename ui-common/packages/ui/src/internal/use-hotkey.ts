import { useEffect, useRef } from 'react'

export interface HotkeyOptions {
  /** Fire even when focus is in an input, textarea or editable region. Default true for `mod+` combos, false otherwise. */
  allowInInputs?: boolean
  /** Turn the listener off (e.g. while a modal is open). Default true. */
  enabled?: boolean
}

interface Combo {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

function parse(combo: string): Combo {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1] ?? ''
  return {
    key,
    mod: parts.includes('mod') || parts.includes('ctrl') || parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Run `handler` when a key combination is pressed anywhere on the page. `mod` is Cmd on macOS and
 * Ctrl elsewhere (either works). Example: `useHotkey('mod+k', () => setOpen(true))`.
 * The default action is prevented when the combo matches.
 */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  { allowInInputs, enabled = true }: HotkeyOptions = {},
): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!enabled) return
    const parsed = parse(combo)
    const allow = allowInInputs ?? parsed.mod
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (event.key.toLowerCase() !== parsed.key) return
      const mod = event.metaKey || event.ctrlKey
      if (mod !== parsed.mod) return
      if (event.shiftKey !== parsed.shift || event.altKey !== parsed.alt) return
      if (!allow && isEditable(event.target)) return
      event.preventDefault()
      handlerRef.current(event)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [combo, allowInInputs, enabled])
}

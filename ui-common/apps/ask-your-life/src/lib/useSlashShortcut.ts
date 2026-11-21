import { useEffect } from 'react'

/** True when the key press is going into something the person is typing in, or into a dialog. */
export function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('[role="dialog"]')) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** Calls `onTrigger` when "/" is pressed outside of text fields and dialogs. */
export function useSlashShortcut(onTrigger: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.defaultPrevented || isTypingContext(event.target)) return
      event.preventDefault()
      onTrigger()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onTrigger])
}

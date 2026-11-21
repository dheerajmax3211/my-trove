import { useToast } from '@platform/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copy text to the clipboard with feedback. `copied` is true briefly after a successful copy so a
 * button can swap its label; a toast announces the outcome to everyone, including screen readers.
 */
export function useCopyToClipboard(): {
  copy: (text: string, what: string) => Promise<void>
  copied: string | null
} {
  const { toast } = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(what)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(null), 2000)
        toast({ title: `${capitalise(what)} copied`, variant: 'success', duration: 2500 })
      } catch {
        toast({
          title: `Could not copy the ${what}`,
          description: 'Select the text and copy it manually.',
          variant: 'danger',
        })
      }
    },
    [toast],
  )
  return { copy, copied }
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

import { Button, CheckIcon, useToast } from '@platform/ui'
import { useState } from 'react'

export interface CopyButtonProps {
  text: string
  /** What is being copied, e.g. "client secret". Used in the accessible name and toast. */
  what: string
}

export function CopyButton({ text, what }: CopyButtonProps) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({ title: `Copied the ${what}`, variant: 'success', duration: 2500 })
    } catch {
      toast({
        title: 'Could not copy automatically',
        description: `Select the ${what} and copy it by hand.`,
        variant: 'warning',
      })
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label={`Copy ${what}`}
      leftIcon={copied ? <CheckIcon size={16} /> : undefined}
      onClick={() => void copy()}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

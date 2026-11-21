import { Button, useToast } from '@platform/ui'

/** Copies `value` to the clipboard and says so. Falls back to a hint when the browser refuses. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: 'Copied to clipboard', variant: 'success', duration: 2500 })
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Select the text and copy it yourself.',
        variant: 'warning',
      })
    }
  }
  return (
    <Button variant="secondary" size="sm" onClick={() => void copy()}>
      {label}
    </Button>
  )
}

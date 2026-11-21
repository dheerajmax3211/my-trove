import { Button, useToast } from '@platform/ui'

/** Copies text to the clipboard and says so. Falls back to a message when the browser refuses. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const { toast } = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Copied to the clipboard', variant: 'success' })
    } catch {
      toast({
        title: 'Could not copy automatically',
        description: 'Select the text and copy it by hand.',
        variant: 'warning',
      })
    }
  }
  return (
    <Button size="sm" variant="secondary" onClick={() => void copy()}>
      {label}
    </Button>
  )
}

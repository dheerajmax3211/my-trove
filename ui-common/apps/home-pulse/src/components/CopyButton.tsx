import { Button, CheckIcon } from '@platform/ui'
import { useState } from 'react'

export interface CopyButtonProps {
  text: string
  label: string
}

/** Copies `text` and says so in words (announced politely), or says that it could not and what to do instead. */
export function CopyButton({ text, label }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <span className="copy-button">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void copy()}
        leftIcon={state === 'copied' ? <CheckIcon size={16} /> : undefined}
      >
        {label}
      </Button>
      <span role="status" className="small muted">
        {state === 'copied' ? 'Copied to the clipboard.' : null}
        {state === 'failed' ? 'Could not copy automatically. Select the text and copy it.' : null}
      </span>
    </span>
  )
}

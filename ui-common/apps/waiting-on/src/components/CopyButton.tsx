import { Button, CheckIcon, type ButtonProps } from '@platform/ui'
import { useCopyToClipboard } from '../lib/copy'

/** Copies `text`; `what` names it for the label and the confirmation ("reply address", "letter"). */
export function CopyButton({
  text,
  what,
  ...rest
}: { text: string; what: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const { copy, copied } = useCopyToClipboard()
  const done = copied === what
  return (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={done ? <CheckIcon size={16} /> : undefined}
      onClick={() => void copy(text, what)}
      {...rest}
    >
      {done ? 'Copied' : `Copy ${what}`}
    </Button>
  )
}

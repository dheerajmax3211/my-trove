import { Button, Callout, Dialog } from '@platform/ui'
import { useState, type ReactNode } from 'react'
import styles from './Developer.module.css'

export interface SecretRevealProps {
  open: boolean
  title: string
  /** What the value is, in the label above it, e.g. "Client secret". */
  label: string
  value: string
  /** Says what to do with the value, and how it is used. */
  explanation: ReactNode
  onClose: () => void
}

/**
 * A key, secret or signing secret, shown exactly once. The warning is literal: the platform will not show it again, so
 * the only way forward is to copy it now or rotate or issue another one.
 */
export function SecretReveal({
  open,
  title,
  label,
  value,
  explanation,
  onClose,
}: SecretRevealProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCopied(false)
          onClose()
        }
      }}
      title={title}
      description="Copy it now. It is shown once."
      dismissible={false}
      size="lg"
      footer={
        <Button
          onClick={() => {
            setCopied(false)
            onClose()
          }}
        >
          I have copied it
        </Button>
      }
    >
      <div className={styles.stack}>
        <Callout variant="warning" title="Shown once">
          My-Trove keeps only what it needs to check this value later, so it cannot show it again.
          If you lose it, rotate it or issue another.
        </Callout>
        <div className={styles.secretBox}>
          <span className={styles.muted}>{label}</span>
          <code className={styles.secretValue} data-testid="secret-value">
            {value}
          </code>
          <div className={styles.row}>
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              Copy to clipboard
            </Button>
            <span role="status" className={styles.muted}>
              {copied ? 'Copied.' : ''}
            </span>
          </div>
        </div>
        <div className={styles.muted}>{explanation}</div>
      </div>
    </Dialog>
  )
}

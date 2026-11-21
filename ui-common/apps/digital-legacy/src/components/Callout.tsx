import { AlertIcon, CheckCircleIcon, InfoIcon, XCircleIcon } from '@platform/ui'
import type { ReactNode } from 'react'

type Tone = 'info' | 'warning' | 'danger' | 'success'

const icons = {
  info: <InfoIcon size={20} />,
  warning: <AlertIcon size={20} />,
  danger: <XCircleIcon size={20} />,
  success: <CheckCircleIcon size={20} />,
} satisfies Record<Tone, ReactNode>

/** A highlighted note. The title is not a heading: callouts sit inside cards that own the outline. */
export function Callout({
  tone = 'info',
  title,
  children,
  role,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  role?: 'alert' | 'status'
}) {
  return (
    <div className={`callout callout-${tone}`} {...(role ? { role } : {})}>
      <span aria-hidden="true">{icons[tone]}</span>
      <div className="callout-body">
        {title ? <span className="callout-title">{title}</span> : null}
        {children}
      </div>
    </div>
  )
}

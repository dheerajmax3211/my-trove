import { forwardRef, type ComponentType, type HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import {
  CodeIcon,
  EyeIcon,
  KeyIcon,
  ShieldIcon,
  UserIcon,
  type IconProps,
} from '../../internal/icons'
import styles from './PersonaBadge.module.css'

export const personas = ['OWNER', 'ADMIN', 'DEVELOPER', 'MEMBER', 'AUDITOR'] as const
export type Persona = (typeof personas)[number]

const LABELS: Record<Persona, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  DEVELOPER: 'Developer',
  MEMBER: 'Member',
  AUDITOR: 'Auditor',
}

const ICONS: Record<Persona, ComponentType<IconProps>> = {
  OWNER: KeyIcon,
  ADMIN: ShieldIcon,
  DEVELOPER: CodeIcon,
  MEMBER: UserIcon,
  AUDITOR: EyeIcon,
}

export interface PersonaBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  persona: Persona
  size?: 'sm' | 'md'
  /** Hide the glyph (the label always shows; color and glyph are never the only signal). */
  hideIcon?: boolean
}

/**
 * Who someone is on the platform. Each persona has its own glyph and tint: Owner is brass (it
 * holds the master key), Admin is patina, Developer is blue, Member is neutral, Auditor is ochre.
 */
export const PersonaBadge = forwardRef<HTMLSpanElement, PersonaBadgeProps>(function PersonaBadge(
  { persona, size = 'md', hideIcon = false, className, ...rest },
  ref,
) {
  const Icon = ICONS[persona]
  return (
    <span
      ref={ref}
      data-persona={persona}
      className={cx(styles.badge, styles[persona], size === 'sm' && styles.sm, className)}
      {...rest}
    >
      {hideIcon ? null : <Icon size={size === 'sm' ? 12 : 14} />}
      {LABELS[persona]}
    </span>
  )
})

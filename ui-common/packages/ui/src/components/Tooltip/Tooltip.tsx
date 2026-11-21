import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from 'react'
import { usePortalContainer } from '../../internal/portal'
import styles from './Tooltip.module.css'

export const TooltipProvider = TooltipPrimitive.Provider

export interface TooltipProps {
  content: ReactNode
  /** The trigger. Must be a single element that accepts a ref and props (button, link, ...). */
  children: ReactElement
  side?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side']
  align?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['align']
  /** ms before opening on hover. Default 300. Focus opens immediately. */
  delayDuration?: number
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Supplementary label for a control. Opens on hover AND keyboard focus, closes on Escape, and is
 * referenced via aria-describedby. Never put essential information or interactive content in it.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 300,
  ...root
}: TooltipProps) {
  const container = usePortalContainer()
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root {...root}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            className={styles.content}
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
          >
            {content}
            <TooltipPrimitive.Arrow className={styles.arrow} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

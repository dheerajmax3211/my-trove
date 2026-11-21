import { Dialog as DialogPrimitive } from 'radix-ui'
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { CloseIcon } from '../../internal/icons'
import { usePortalContainer } from '../../internal/portal'
import { IconButton } from '../IconButton/IconButton'
import styles from './Dialog.module.css'

/** Wrap a Button with `asChild` to close the dialog from your own footer actions. */
export const DialogClose = DialogPrimitive.Close

export interface DialogProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Element that opens the dialog (rendered with asChild). Focus returns to it on close. */
  trigger?: ReactNode
  /** Required: the accessible name of the dialog. */
  title: ReactNode
  /** Recommended: describes the dialog (aria-describedby). */
  description?: ReactNode
  /** Buttons row. Use <DialogClose asChild> for the cancel action. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeLabel?: string
  /** Prevent closing via overlay click / Escape (e.g. while saving). */
  dismissible?: boolean
  className?: string
  children?: ReactNode
}

export const Dialog = forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    open,
    defaultOpen,
    onOpenChange,
    trigger,
    title,
    description,
    footer,
    size = 'md',
    closeLabel = 'Close',
    dismissible = true,
    className,
    children,
  },
  ref,
) {
  const container = usePortalContainer()
  const rootProps: ComponentPropsWithoutRef<typeof DialogPrimitive.Root> = {}
  if (open !== undefined) rootProps.open = open
  if (defaultOpen !== undefined) rootProps.defaultOpen = defaultOpen
  if (onOpenChange) rootProps.onOpenChange = onOpenChange

  const blockIfNotDismissible = dismissible ? undefined : (event: Event) => event.preventDefault()

  return (
    <DialogPrimitive.Root {...rootProps}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <DialogPrimitive.Content
          ref={ref}
          className={cx(styles.content, size !== 'md' && styles[size], className)}
          onEscapeKeyDown={blockIfNotDismissible}
          onInteractOutside={blockIfNotDismissible}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className={styles.header}>
            <DialogPrimitive.Title className={styles.title}>{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className={styles.description}>
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {children ? <div className={styles.body}>{children}</div> : null}
          {footer ? <div className={styles.footer}>{footer}</div> : null}
          {dismissible ? (
            <DialogPrimitive.Close asChild>
              <IconButton
                className={styles.close}
                label={closeLabel}
                icon={<CloseIcon size={18} />}
                size="sm"
              />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
})

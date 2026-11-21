import { VisuallyHidden as VisuallyHiddenPrimitive } from 'radix-ui'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'

export type VisuallyHiddenProps = ComponentPropsWithoutRef<typeof VisuallyHiddenPrimitive.Root>

/** Content that is available to assistive tech but not painted. */
export const VisuallyHidden = forwardRef<
  ElementRef<typeof VisuallyHiddenPrimitive.Root>,
  VisuallyHiddenProps
>(function VisuallyHidden(props, ref) {
  return <VisuallyHiddenPrimitive.Root ref={ref} {...props} />
})

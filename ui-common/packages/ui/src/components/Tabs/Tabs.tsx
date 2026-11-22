import { Tabs as TabsPrimitive } from 'radix-ui'
import { forwardRef, useRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cx } from '../../internal/cx'
import { mergeRefs } from '../../internal/merge-refs'
import { useSlidingIndicator } from '../../internal/use-sliding-indicator'
import styles from './Tabs.module.css'

/** Roving-tabindex tablist: arrow keys move between tabs, Home/End jump, Tab enters the panel. */
export const Tabs = TabsPrimitive.Root

/**
 * The tab strip. A pill glides under the active tab (one transform transition, measured from the
 * active trigger), so switching tabs reads as one object moving rather than two states swapping.
 */
export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, children, ...rest }, ref) {
  const own = useRef<HTMLDivElement>(null)
  useSlidingIndicator(own, '[role="tab"][data-state="active"]')
  return (
    <TabsPrimitive.List
      ref={mergeRefs<HTMLDivElement>(own, ref)}
      className={cx(styles.list, className)}
      {...rest}
    >
      {children}
      <span className={styles.indicator} aria-hidden="true" />
    </TabsPrimitive.List>
  )
})

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
  return <TabsPrimitive.Trigger ref={ref} className={cx(styles.trigger, className)} {...rest} />
})

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...rest }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cx(styles.content, className)} {...rest} />
})

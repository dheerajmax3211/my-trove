import { Tabs as TabsPrimitive } from 'radix-ui'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cx } from '../../internal/cx'
import styles from './Tabs.module.css'

/** Roving-tabindex tablist: arrow keys move between tabs, Home/End jump, Tab enters the panel. */
export const Tabs = TabsPrimitive.Root

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...rest }, ref) {
  return <TabsPrimitive.List ref={ref} className={cx(styles.list, className)} {...rest} />
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

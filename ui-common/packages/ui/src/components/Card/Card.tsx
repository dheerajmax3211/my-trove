import { forwardRef, type ElementType, type HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import styles from './Card.module.css'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'outlined' | 'elevated'
  /** Adds hover affordance. Pair with a real link/button inside the card for the action. */
  interactive?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'outlined', interactive = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        styles.card,
        variant === 'elevated' && styles.elevated,
        interactive && styles.interactive,
        className,
      )}
      {...rest}
    />
  )
})

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div ref={ref} className={cx(styles.header, className)} {...rest} />
  },
)

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading element to render. Pick the level that fits the page outline. Default h3. */
  as?: Extract<ElementType, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { as: Tag = 'h3', className, ...rest },
  ref,
) {
  return <Tag ref={ref} className={cx(styles.title, className)} {...rest} />
})

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...rest }, ref) {
  return <p ref={ref} className={cx(styles.description, className)} {...rest} />
})

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...rest }, ref) {
    return <div ref={ref} className={cx(styles.content, className)} {...rest} />
  },
)

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return <div ref={ref} className={cx(styles.footer, className)} {...rest} />
  },
)

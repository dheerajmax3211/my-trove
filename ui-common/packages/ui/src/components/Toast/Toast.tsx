import { Toast as ToastPrimitive } from 'radix-ui'
import { createPortal } from 'react-dom'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cx } from '../../internal/cx'
import { AlertIcon, CheckCircleIcon, CloseIcon, InfoIcon, XCircleIcon } from '../../internal/icons'
import { usePortalContainer } from '../../internal/portal'
import { Button } from '../Button/Button'
import { IconButton } from '../IconButton/IconButton'
import styles from './Toast.module.css'

export type ToastVariant = 'neutral' | 'success' | 'danger' | 'warning' | 'info'

export interface ToastOptions {
  title: ReactNode
  description?: ReactNode
  variant?: ToastVariant
  /** ms before auto-dismiss. `Infinity` keeps it until dismissed. Default 5000. */
  duration?: number
  action?: {
    label: string
    /** Plain-text description of the action for screen readers when the toast is announced. */
    altText?: string
    onClick: () => void
  }
}

interface ToastItem extends ToastOptions {
  id: string
  open: boolean
}

interface ToastApi {
  /** Show a toast. Returns its id. */
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const variantIcon = {
  neutral: null,
  success: <CheckCircleIcon size={20} />,
  danger: <XCircleIcon size={20} />,
  warning: <AlertIcon size={20} />,
  info: <InfoIcon size={20} />,
} satisfies Record<ToastVariant, ReactNode>

export interface ToastProviderProps {
  children: ReactNode
  /** Accessible name of the notifications region. */
  label?: string
  /** Default auto-dismiss time in ms. */
  duration?: number
}

/** Mount once near the app root; call `useToast().toast(...)` from anywhere below it. */
export function ToastProvider({
  children,
  label = 'Notifications',
  duration = 5000,
}: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const container = usePortalContainer()

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${(counter.current += 1)}`
    setItems((current) => [...current, { ...options, id, open: true }])
    return id
  }, [])

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.map((t) => (t.id === id ? { ...t, open: false } : t)))
  }, [])

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((t) => t.id !== id))
  }, [])

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss])

  const viewportElement = (
    <ToastPrimitive.Viewport
      className={styles.viewport}
      hotkey={['F8']}
      label={`${label} ({hotkey})`}
    />
  )
  // Overlays portal where the surrounding <PortalContainerProvider> says (themed regions, shadow roots).
  const viewport = container ? createPortal(viewportElement, container) : viewportElement

  return (
    <ToastContext value={api}>
      <ToastPrimitive.Provider label={label} duration={duration} swipeDirection="right">
        {children}
        {items.map((item) => {
          const variant = item.variant ?? 'neutral'
          return (
            <ToastPrimitive.Root
              key={item.id}
              className={cx(styles.toast, styles[variant])}
              open={item.open}
              duration={item.duration ?? duration}
              onOpenChange={(open) => {
                if (!open) dismiss(item.id)
              }}
              onAnimationEnd={() => {
                if (!item.open) remove(item.id)
              }}
            >
              {variantIcon[variant] ? (
                <span className={styles.icon}>{variantIcon[variant]}</span>
              ) : (
                <span />
              )}
              <div className={styles.body}>
                <ToastPrimitive.Title className={styles.title}>{item.title}</ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className={styles.description}>
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <div className={styles.actions}>
                {item.action ? (
                  <ToastPrimitive.Action altText={item.action.altText ?? item.action.label} asChild>
                    <Button variant="secondary" size="sm" onClick={item.action.onClick}>
                      {item.action.label}
                    </Button>
                  </ToastPrimitive.Action>
                ) : null}
                <ToastPrimitive.Close asChild>
                  <IconButton
                    label="Dismiss notification"
                    icon={<CloseIcon size={16} />}
                    size="sm"
                  />
                </ToastPrimitive.Close>
              </div>
            </ToastPrimitive.Root>
          )
        })}
        {viewport}
      </ToastPrimitive.Provider>
    </ToastContext>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

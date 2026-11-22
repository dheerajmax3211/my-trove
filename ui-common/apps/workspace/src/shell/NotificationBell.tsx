import { useApiMutation, useApiQuery } from '@platform/api-client'
import type { ProductModule } from '@platform/workspace-kit'
import { useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { moduleBase } from '../modules/registry'
import styles from './NotificationBell.module.css'

/** The caller's in-app notifications, through the gateway at /api/shared/v1/notifications. */
export const INBOX_PATH = '/shared/v1/notifications'
export const UNREAD_PATH = `${INBOX_PATH}/unread-count`
/** The unread badge re-checks this often while the workspace is open. */
const UNREAD_POLL_MS = 60_000

export interface InboxItem {
  id: string
  kind: string
  source: string
  title: string
  body: string | null
  /** A path inside a product, for example "/consent"; null when there is nowhere to go. */
  link: string | null
  status: string
  createdAt: string
  readAt: string | null
}

/** The number of unread notifications for the signed-in person (0 while loading or when unavailable). */
export function useUnreadCount({ enabled = true }: { enabled?: boolean } = {}): number {
  const query = useApiQuery<{ count: number }>(UNREAD_PATH, {
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    retry: false,
  })
  return query.data?.count ?? 0
}

/**
 * Where a notification's link leads inside the workspace: "/consent" becomes the consent product's own page. Null when
 * the product is not one this workspace hosts, so the item is shown without a destination.
 */
export function inboxHref(link: string | null, modules: readonly ProductModule[]): string | null {
  if (!link) return null
  const [productId, ...rest] = link.replace(/^\/+/, '').split('/')
  const product = modules.find((module) => module.id === productId)
  if (!product) return null
  return [moduleBase(product), ...rest].join('/')
}

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

interface NotificationBellProps {
  open: boolean
  onClose: () => void
  modules: readonly ProductModule[]
  /** False in demo mode, where there is no live inbox. */
  enabled?: boolean
}

/**
 * The panel behind the header bell: the inbox, newest first. Opening an item marks it read and goes to the product it
 * is about. The unread badge is the bell's own (see useUnreadCount); this component is the list.
 */
export function NotificationBell({ open, onClose, modules, enabled = true }: NotificationBellProps) {
  const titleId = useId()
  const navigate = useNavigate()
  const inbox = useApiQuery<InboxItem[]>(INBOX_PATH, { enabled: open && enabled, retry: false })
  const markRead = useApiMutation<InboxItem, string>({
    path: (id) => `${INBOX_PATH}/${id}/read`,
    body: () => ({}),
    invalidate: [[UNREAD_PATH], [INBOX_PATH]],
  })
  const readAll = useApiMutation<{ updated: number }, void>({
    path: `${INBOX_PATH}/read-all`,
    body: () => ({}),
    invalidate: [[UNREAD_PATH], [INBOX_PATH]],
  })

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const items = inbox.data ?? []
  const anyUnread = items.some((item) => item.readAt === null)

  function openItem(item: InboxItem) {
    if (item.readAt === null) markRead.mutate(item.id)
    const href = inboxHref(item.link, modules)
    if (href) {
      onClose()
      void navigate(href)
    }
  }

  return (
    <section role="dialog" aria-labelledby={titleId} className={styles.panel}>
      <header className={styles.head}>
        <h2 id={titleId} className={styles.heading}>
          Notifications
        </h2>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => readAll.mutate()}
          disabled={!anyUnread || readAll.isPending}
        >
          Mark all read
        </button>
        <button type="button" className={styles.textButton} onClick={onClose} aria-label="Close notifications">
          Close
        </button>
      </header>

      {!enabled ? <p className={styles.empty}>Notifications are not available in demo mode.</p> : null}
      {enabled && inbox.isPending ? <p className={styles.empty}>Loading...</p> : null}
      {enabled && inbox.isError ? (
        <p role="status" className={styles.empty}>
          Could not load notifications. Try again in a moment.
        </p>
      ) : null}
      {enabled && inbox.data && items.length === 0 ? (
        <p className={styles.empty}>
          Nothing here yet. Reminders, requests and updates from your products appear here.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul aria-label="Notifications" className={styles.list}>
          {items.map((item) => (
            <li key={item.id} data-unread={item.readAt === null ? 'true' : 'false'} className={styles.row}>
              <button type="button" className={styles.item} onClick={() => openItem(item)}>
                <span className={styles.title}>{item.title}</span>
                {item.body ? <span className={styles.body}>{item.body}</span> : null}
                <time className={styles.time} dateTime={item.createdAt}>
                  {when(item.createdAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

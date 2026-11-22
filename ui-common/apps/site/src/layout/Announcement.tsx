import { CloseIcon } from '@platform/ui'
import { useState } from 'react'
import { demoUrl } from '../config'
import styles from './Announcement.module.css'

const KEY = 'pp-site-announcement'

function dismissedBefore(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === 'closed'
  } catch {
    return false
  }
}

/** A lime bar above the page. It says something true and useful, and stays dismissed for the visit. */
export function Announcement() {
  const [open, setOpen] = useState(() => !dismissedBefore())
  if (!open) return null
  return (
    <div className={styles.bar} role="region" aria-label="Announcement">
      <p className={styles.text}>
        The live demo runs in your browser on sample data. No account needed.{' '}
        <a href={demoUrl()}>Try it now</a>
      </p>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss the announcement"
        onClick={() => {
          setOpen(false)
          try {
            window.sessionStorage.setItem(KEY, 'closed')
          } catch {
            // Storage is blocked: the bar stays closed until the page reloads.
          }
        }}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  )
}

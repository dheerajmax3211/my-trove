import { useAuth } from '@platform/auth-web'
import {
  Avatar,
  Button,
  LogoutIcon,
  PersonaBadge,
  UserIcon,
  personas,
  type Persona,
} from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PERSONA_LABELS, PERSONA_SUMMARY, primaryPersona } from '../lib/personas'
import { useOnboarding } from '../onboarding/OnboardingProvider'
import { useWorkspace } from '../workspace/context'
import styles from './UserMenu.module.css'

/**
 * The account menu. Its trigger is the header's `UserChip` (drawn by `AppFrame`); this component is
 * the panel, anchored under that chip. A disclosure (a button that shows a panel), not an ARIA
 * menu: everything in the panel is an ordinary link or button reached with Tab. Escape and a click
 * outside close it.
 */
export function UserMenu({
  open,
  onOpenChange,
  name,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
}) {
  const { runtime } = useWorkspace()
  const session = useWorkspaceSession()
  const { signOut } = useAuth()
  const onboarding = useOnboarding()
  const [persona, setPersona] = useState<Persona | null>(() => runtime.demo?.persona() ?? null)
  const anchor = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ left: 16, top: 80 })
  const panelId = useId()

  /** The chip is the first button the header renders, in the same container as this anchor. */
  const chip = () => anchor.current?.parentElement?.querySelector<HTMLButtonElement>('button')

  useLayoutEffect(() => {
    const trigger = chip()
    if (!trigger) return
    trigger.setAttribute('aria-haspopup', 'true')
    trigger.setAttribute('aria-expanded', String(open))
    trigger.setAttribute('aria-label', `Account menu for ${name}`)
    if (open) {
      trigger.setAttribute('aria-controls', panelId)
      const box = trigger.getBoundingClientRect()
      // Measuring the real chip to place the panel is a legitimate layout-effect write.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlace({
        left: Math.max(16, Math.min(box.left, window.innerWidth - 336)),
        top: box.bottom + 8,
      })
    } else {
      trigger.removeAttribute('aria-controls')
    }
  }, [open, name, panelId])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panel.current?.contains(target) || chip()?.contains(target)) return
      onOpenChange(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onOpenChange(false)
      chip()?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  const current = primaryPersona(session.roles)
  const close = () => onOpenChange(false)

  const choosePersona = (next: Persona) => {
    runtime.demo?.setPersona(next)
    setPersona(next)
  }

  return (
    <div ref={anchor} className={styles.root}>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="group"
          aria-label="Account menu"
          className={styles.panel}
          style={{ left: place.left, top: place.top }}
        >
          <div className={styles.who}>
            <Avatar name={name} size="md" decorative />
            <div className={styles.whoText}>
              <p className={styles.name}>{name}</p>
              {session.email && session.email !== name ? (
                <p className={styles.email}>{session.email}</p>
              ) : null}
              <PersonaBadge persona={current} size="sm" />
            </div>
          </div>

          {runtime.demo && persona ? (
            <div className={styles.section}>
              <p className={styles.sectionTitle} id={`${panelId}-demo`}>
                View the workspace as
              </p>
              <ul className={styles.personas} aria-labelledby={`${panelId}-demo`}>
                {personas.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      className={styles.persona}
                      aria-pressed={option === persona}
                      onClick={() => choosePersona(option)}
                    >
                      {PERSONA_LABELS[option]}
                    </button>
                  </li>
                ))}
              </ul>
              <p className={styles.hint}>{PERSONA_SUMMARY[persona]}</p>
            </div>
          ) : null}

          <div className={styles.section}>
            <Link to="/account" className={styles.item} onClick={close}>
              <UserIcon size={18} aria-hidden="true" />
              Account and permissions
            </Link>
            <button
              type="button"
              className={styles.item}
              onClick={() => {
                close()
                onboarding.reopen()
              }}
            >
              Welcome tour
            </button>
            {runtime.demo?.explicit ? (
              <a
                className={styles.item}
                href="/"
                onClick={() => {
                  runtime.leaveDemo()
                }}
              >
                Leave the demo
              </a>
            ) : null}
          </div>

          <div className={styles.section}>
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              leftIcon={<LogoutIcon size={16} />}
              onClick={() => {
                close()
                void signOut()
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

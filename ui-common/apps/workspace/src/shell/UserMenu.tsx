import { useAuth } from '@platform/auth-web'
import {
  Avatar,
  Button,
  ChevronDownIcon,
  LogoutIcon,
  PersonaBadge,
  UserIcon,
  personas,
  type Persona,
} from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PERSONA_LABELS, PERSONA_SUMMARY, primaryPersona } from '../lib/personas'
import { useOnboarding } from '../onboarding/OnboardingProvider'
import { useWorkspace } from '../workspace/context'
import styles from './UserMenu.module.css'

/**
 * The account menu. A disclosure (a button that shows a panel), not an ARIA menu: everything in the
 * panel is an ordinary link or button reached with Tab. Escape and a click outside close it.
 */
export function UserMenu() {
  const { runtime } = useWorkspace()
  const session = useWorkspaceSession()
  const { signOut } = useAuth()
  const onboarding = useOnboarding()
  const [open, setOpen] = useState(false)
  const [persona, setPersona] = useState<Persona | null>(() => runtime.demo?.persona() ?? null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const name = session.displayName ?? session.email ?? 'Account'
  const current = primaryPersona(session.roles)
  const close = () => setOpen(false)

  const choosePersona = (next: Persona) => {
    runtime.demo?.setPersona(next)
    setPersona(next)
  }

  return (
    <div ref={root} className={styles.root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={name} size="sm" decorative />
        <span className={styles.triggerName}>{name}</span>
        <ChevronDownIcon size={16} aria-hidden="true" />
      </button>

      {open ? (
        <div id={panelId} role="group" aria-label="Account menu" className={styles.panel}>
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

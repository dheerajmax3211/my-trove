import { Button, CloseIcon, Switch, cx } from '@platform/ui'
import { useEffect, useRef, useState } from 'react'
import { resetPrefs, setPrefs, usePrefs, type TextSize } from './prefs'
import styles from './AccessibilityPanel.module.css'

const sizes: readonly { id: TextSize; label: string; sample: string }[] = [
  { id: 'default', label: 'Default', sample: 'A' },
  { id: 'large', label: 'Large', sample: 'A' },
  { id: 'larger', label: 'Largest', sample: 'A' },
]

function PersonGlyph() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M5 8.5c4.3 1.2 9.7 1.2 14 0M12 8.8v5.2m0 0-3.2 6m3.2-6 3.2 6" />
    </svg>
  )
}

/**
 * A floating panel for reading preferences: text size, high contrast and reduced motion. The
 * choices are saved in this browser (localStorage) and applied to the page straight away.
 */
export function AccessibilityPanel() {
  const prefs = usePrefs()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={rootRef} className={styles.root}>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Accessibility settings">
          <div className={styles.head}>
            <h2 className={styles.title}>Reading preferences</h2>
            <button
              type="button"
              className={styles.close}
              aria-label="Close the accessibility settings"
              onClick={() => {
                setOpen(false)
                buttonRef.current?.focus()
              }}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <div role="group" aria-labelledby="a11y-size" className={styles.group}>
            <p id="a11y-size" className={styles.groupLabel}>
              Text size
            </p>
            <div className={styles.sizes}>
              {sizes.map((size, index) => (
                <button
                  key={size.id}
                  type="button"
                  className={cx(styles.size, prefs.textSize === size.id && styles.sizeOn)}
                  aria-pressed={prefs.textSize === size.id}
                  onClick={() => setPrefs({ textSize: size.id })}
                >
                  <span aria-hidden="true" style={{ fontSize: `${1 + index * 0.25}rem` }}>
                    {size.sample}
                  </span>
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          <Switch
            label="High contrast"
            description="Stronger text and borders."
            checked={prefs.highContrast}
            onCheckedChange={(highContrast) => setPrefs({ highContrast })}
          />
          <Switch
            label="Reduce motion"
            description="Stops animation, parallax and the scroll story."
            checked={prefs.reduceMotion}
            onCheckedChange={(reduceMotion) => setPrefs({ reduceMotion })}
          />

          <div className={styles.foot}>
            <p className={styles.note}>Saved in this browser only.</p>
            <Button size="sm" variant="ghost" onClick={resetPrefs}>
              Reset
            </Button>
          </div>
        </div>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-label="Accessibility settings"
        onClick={() => setOpen((o) => !o)}
      >
        <PersonGlyph />
      </button>
    </div>
  )
}

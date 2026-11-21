import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cx } from '../../internal/cx'
import { SearchIcon } from '../../internal/icons'
import { usePortalContainer } from '../../internal/portal'
import { useReducedMotion } from '../../internal/use-reduced-motion'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './CommandPalette.module.css'

export interface CommandItem {
  id: string
  label: string
  /** Secondary text on the right ("Go to", "Shortcut G H", a path). */
  hint?: string
  /** Group heading. Items keep the order they are passed in, grouped by first appearance. */
  group?: string
  /** Extra words that should find this item ("settings" for "Account"). */
  keywords?: readonly string[]
  /** A glyph before the label. */
  icon?: ReactNode
  /** Runs after the palette closes. */
  onSelect: () => void
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly CommandItem[]
  placeholder?: string
  /** Accessible name of the dialog and the input. Default "Command palette". */
  label?: string
  /** Shown when nothing matches. Default "No matches". */
  emptyLabel?: string
}

/** Rank an item for a query: 0 = no match. Every word of the query must match somewhere. */
export function scoreItem(item: CommandItem, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  const label = item.label.toLowerCase()
  const rest = [item.hint, item.group, ...(item.keywords ?? [])].join(' ').toLowerCase()
  let total = 0
  for (const word of words) {
    let score = 0
    if (label.startsWith(word)) score = 100
    else if (label.split(/[\s/\-_.]+/).some((part) => part.startsWith(word))) score = 80
    else if (label.includes(word)) score = 50
    else if (rest.includes(word)) score = 20
    if (score === 0) return 0
    total += score
  }
  return total
}

interface Row {
  item: CommandItem
  index: number
}
interface Group {
  name: string | undefined
  rows: Row[]
}

/**
 * A keyboard-first launcher (the caller owns the hotkey, see `useHotkey`). It is a modal dialog
 * with a combobox inside: focus is trapped, Escape closes, focus returns to what opened it.
 * Arrow keys move through results, Home and End jump, Enter runs the highlighted one.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = 'Search pages and actions',
  label = 'Command palette',
  emptyLabel = 'No matches',
}: CommandPaletteProps) {
  const container = usePortalContainer()
  const reduced = useReducedMotion()
  const baseId = useId()
  const listId = `${baseId}-list`
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)

  // Remember what had focus before the dialog takes it (there is no Trigger, so Radix cannot).
  useLayoutEffect(() => {
    if (open) returnFocusTo.current = document.activeElement as HTMLElement | null
  }, [open])

  // Fresh start every time it opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const { groups, flat } = useMemo(() => {
    const scored = items
      .map((item, order) => ({ item, order, score: scoreItem(item, query) }))
      .filter((entry) => entry.score > 0)
    if (query.trim()) scored.sort((a, b) => b.score - a.score || a.order - b.order)
    const byGroup = new Map<string | undefined, Row[]>()
    const ordered: Row[] = []
    // Group by first appearance among the (already ranked) matches.
    for (const { item } of scored) {
      const list = byGroup.get(item.group) ?? []
      byGroup.set(item.group, list)
      const row: Row = { item, index: -1 }
      list.push(row)
    }
    const grouped: Group[] = []
    for (const [name, rows] of byGroup) {
      grouped.push({ name, rows })
      for (const row of rows) {
        row.index = ordered.length
        ordered.push(row)
      }
    }
    return { groups: grouped, flat: ordered }
  }, [items, query])

  const clamped = flat.length === 0 ? -1 : Math.min(active, flat.length - 1)
  const activeId = clamped >= 0 ? `${baseId}-opt-${clamped}` : undefined

  useEffect(() => {
    if (clamped < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${clamped}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [clamped, reduced])

  const run = (row: Row | undefined) => {
    if (!row) return
    onOpenChange(false)
    row.item.onSelect()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = flat.length
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (count > 0) setActive((clamped + 1) % count)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (count > 0) setActive((clamped - 1 + count) % count)
        break
      case 'Home':
        if (count > 0) {
          event.preventDefault()
          setActive(0)
        }
        break
      case 'End':
        if (count > 0) {
          event.preventDefault()
          setActive(count - 1)
        }
        break
      case 'Enter':
        event.preventDefault()
        run(flat[clamped])
        break
      default:
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <DialogPrimitive.Content
          className={styles.content}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusTo.current?.focus()
          }}
        >
          <VisuallyHidden asChild>
            <DialogPrimitive.Title>{label}</DialogPrimitive.Title>
          </VisuallyHidden>
          <div className={styles.search}>
            <SearchIcon size={18} className={styles.searchIcon} />
            <input
              className={styles.input}
              type="text"
              role="combobox"
              aria-label={label}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={placeholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label}
            className={styles.list}
            // Keep focus in the input when the pointer presses an option.
            onMouseDown={(event) => event.preventDefault()}
          >
            {flat.length === 0 ? (
              <p className={styles.empty}>{emptyLabel}</p>
            ) : (
              groups.map((group, groupIndex) => {
                const headingId = `${baseId}-group-${groupIndex}`
                return (
                  <div
                    key={group.name ?? `__none-${groupIndex}`}
                    role="group"
                    aria-labelledby={group.name ? headingId : undefined}
                    className={styles.group}
                  >
                    {group.name ? (
                      <div id={headingId} role="presentation" className={styles.groupTitle}>
                        {group.name}
                      </div>
                    ) : null}
                    {group.rows.map(({ item, index }) => (
                      <div
                        key={item.id}
                        id={`${baseId}-opt-${index}`}
                        role="option"
                        aria-selected={index === clamped}
                        data-index={index}
                        className={cx(styles.option, index === clamped && styles.active)}
                        onMouseMove={() => index !== clamped && setActive(index)}
                        onClick={() => run({ item, index })}
                      >
                        {item.icon ? (
                          <span className={styles.optionIcon} aria-hidden="true">
                            {item.icon}
                          </span>
                        ) : null}
                        <span className={styles.optionLabel}>{item.label}</span>
                        {item.hint ? <span className={styles.optionHint}>{item.hint}</span> : null}
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
          <VisuallyHidden>
            <div role="status" aria-live="polite">
              {flat.length === 0 ? emptyLabel : `${flat.length} results`}
            </div>
          </VisuallyHidden>
          <div className={styles.footer} aria-hidden="true">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> move
            </span>
            <span>
              <kbd>Enter</kbd> open
            </span>
            <span>
              <kbd>Esc</kbd> close
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

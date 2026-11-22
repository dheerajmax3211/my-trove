import type { SearchMode } from '../api/types'

export const MODE_OPTIONS: readonly {
  value: SearchMode
  label: string
  description: string
  hint: string
}[] = [
  {
    value: 'hybrid',
    label: 'Hybrid',
    description:
      'Best for most questions: matches your exact words and similar wording. Similar wording stands in for meaning until the real model is connected.',
    hint: 'Leave it here if you are not sure.',
  },
  {
    value: 'keyword',
    label: 'Keyword',
    description: 'Only passages containing your words. Supports "quotes", OR and -exclude.',
    hint: 'Good for names, numbers and codes.',
  },
  {
    value: 'semantic',
    label: 'Semantic',
    description:
      'Passages that read like your question. Stand-in for now: it scores similar wording with a fixed local method, not a language model, so it can miss passages that share no words with your question.',
    hint: 'Ask a full sentence.',
  },
]

/**
 * The three ways to look, as cards that explain themselves. `compact` (used once results are on
 * screen) keeps the same words for assistive tech but shows only the names.
 */
export function ModeToggle({
  value,
  onChange,
  compact = false,
}: {
  value: SearchMode
  onChange: (mode: SearchMode) => void
  compact?: boolean
}) {
  return (
    <fieldset className="ayl-modes" data-compact={compact}>
      <legend className="ayl-legend">Search mode</legend>
      <div className="ayl-mode-grid">
        {MODE_OPTIONS.map((option) => (
          <label key={option.value} className="ayl-mode" data-checked={value === option.value}>
            <input
              type="radio"
              name="search-mode"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="ayl-mode-label">{option.label}</span>
            <span className="ayl-mode-desc">{option.description}</span>
            <span className="ayl-mode-hint">{option.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

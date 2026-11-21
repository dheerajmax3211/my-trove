import type { SearchMode } from '../api/types'

export const MODE_OPTIONS: readonly { value: SearchMode; label: string; description: string }[] = [
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Best for most questions: matches your exact words and similar meaning.',
  },
  {
    value: 'keyword',
    label: 'Keyword',
    description: 'Only passages containing your words. Supports "quotes", OR and -exclude.',
  },
  {
    value: 'semantic',
    label: 'Semantic',
    description: 'Passages that read like your question, even when the words differ.',
  },
]

export function ModeToggle({
  value,
  onChange,
}: {
  value: SearchMode
  onChange: (mode: SearchMode) => void
}) {
  return (
    <fieldset className="ayl-modes">
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
          </label>
        ))}
      </div>
    </fieldset>
  )
}

import { Button, IllustrationSearch } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { hasActiveFilters, type SearchState } from '../api/searchApi'
import type { SearchMode } from '../api/types'

export function NoResults({
  state,
  onModeChange,
  onClearFilters,
}: {
  state: SearchState
  onModeChange: (mode: SearchMode) => void
  onClearFilters: () => void
}) {
  return (
    <section className="ayl-noresults" aria-labelledby="no-results-heading">
      <div className="ayl-noresults-art" aria-hidden="true">
        <IllustrationSearch size={160} />
      </div>
      <div className="ayl-noresults-body">
        <h2 id="no-results-heading" className="ayl-h2">
          {`Nothing matched "${state.q.trim()}"`}
        </h2>
        <p className="ayl-muted">Here are a few things to try:</p>
        <ul className="ayl-suggestions">
          {hasActiveFilters(state) ? (
            <li>
              Your filters may be hiding results.{' '}
              <Button variant="secondary" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            </li>
          ) : null}
          {state.mode === 'keyword' ? (
            <li>
              Keyword search needs your exact words. Try{' '}
              <Button variant="secondary" size="sm" onClick={() => onModeChange('hybrid')}>
                Hybrid search
              </Button>{' '}
              to include similar meanings.
            </li>
          ) : null}
          {state.mode === 'semantic' ? (
            <li>
              Semantic search works best with a full sentence. You can also try{' '}
              <Button variant="secondary" size="sm" onClick={() => onModeChange('hybrid')}>
                Hybrid search
              </Button>{' '}
              to include exact words.
            </li>
          ) : null}
          <li>Use fewer or simpler words, and check the spelling.</li>
          <li>
            Anything you added in the last few seconds may still be indexing. Check the{' '}
            <ModuleLink className="ayl-link" to="/library">
              Library
            </ModuleLink>{' '}
            to see its status.
          </li>
          <li>
            Not saved yet?{' '}
            <ModuleLink className="ayl-link" to="/add">
              Add a note or file
            </ModuleLink>{' '}
            and ask again.
          </li>
        </ul>
      </div>
    </section>
  )
}

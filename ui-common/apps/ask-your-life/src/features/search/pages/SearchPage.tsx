import { Button, Input, SearchIcon, Skeleton, VaultRings } from '@platform/ui'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorPanel } from '../../../components/ErrorPanel'
import { useRecentSearches } from '../../../lib/recentSearches'
import { useSlashShortcut } from '../../../lib/useSlashShortcut'
import { useRecentDocuments } from '../../documents/hooks/useDocuments'
import {
  dateRangeError,
  DEFAULT_K,
  EMPTY_SEARCH,
  MAX_K,
  MAX_QUERY_LENGTH,
  paramsFromState,
  stateFromParams,
  type SearchState,
} from '../api/searchApi'
import { FirstUse } from '../components/FirstUse'
import { Filters } from '../components/Filters'
import { IdleHome } from '../components/IdleHome'
import { ModeToggle } from '../components/ModeToggle'
import { NoResults } from '../components/NoResults'
import { ResultCard } from '../components/ResultCard'
import { useSearch } from '../hooks/useSearch'

const EXAMPLES: readonly string[] = [
  'how much was the deposit',
  '"smoke detector"',
  'car insurance',
]

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Searching" role="status" className="ayl-results-loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ayl-result">
          <Skeleton width="55%" height="1.25rem" />
          <Skeleton width="30%" height="0.875rem" />
          <Skeleton height="3rem" />
        </div>
      ))}
    </div>
  )
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => stateFromParams(params), [params])
  const [draft, setDraft] = useState(state.q)
  const [syncedQ, setSyncedQ] = useState(state.q)
  const inputRef = useRef<HTMLInputElement>(null)
  const { recent, remember, clear } = useRecentSearches()
  const library = useRecentDocuments()

  // Keep the box in step when the address changes (back button, shared link, example chip).
  if (syncedQ !== state.q) {
    setSyncedQ(state.q)
    setDraft(state.q)
  }
  useEffect(() => inputRef.current?.focus(), [])
  useSlashShortcut(useCallback(() => inputRef.current?.focus(), []))

  const search = useSearch(state)
  const rangeError = dateRangeError(state)
  const submitted = state.q.trim() !== ''
  const libraryIsEmpty = library.data?.length === 0
  const hasDocuments = library.data !== undefined && library.data.length > 0

  /** Apply changes and search again. A new search always starts from the first page of results. */
  const apply = (changes: Partial<SearchState>) => {
    const next = { ...state, q: draft, k: DEFAULT_K, ...changes }
    if (next.q.trim() !== '' && dateRangeError(next) === null) remember(next.q)
    setParams(paramsFromState(next))
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (draft.trim() === '') {
      inputRef.current?.focus()
      return
    }
    apply({})
  }

  const showMore = () =>
    setParams(paramsFromState({ ...state, k: Math.min(state.k + DEFAULT_K, MAX_K) }))

  let body
  if (!submitted) {
    if (libraryIsEmpty) body = <FirstUse />
    else if (hasDocuments)
      body = (
        <IdleHome
          recent={recent}
          documents={library.data ?? []}
          onPick={(q) => apply({ q })}
          onClearRecent={clear}
        />
      )
    else body = null
  } else if (rangeError) body = null
  else if (search.isPending && search.fetchStatus !== 'idle') body = <ResultsSkeleton />
  else if (search.isError)
    body = (
      <ErrorPanel
        error={search.error}
        onRetry={() => void search.refetch()}
        title="Search failed"
      />
    )
  else if (search.data && search.data.hits.length === 0)
    body = (
      <NoResults
        state={state}
        onModeChange={(mode) => apply({ mode })}
        onClearFilters={() => apply({ ...EMPTY_SEARCH, q: state.q, mode: state.mode })}
      />
    )
  else if (search.data)
    body = (
      <section aria-labelledby="results-heading">
        <h2 id="results-heading" className="ayl-results-heading" aria-live="polite">
          {search.data.hits.length === 1 ? '1 result' : `${search.data.hits.length} results`} for{' '}
          &quot;{state.q.trim()}&quot;
        </h2>
        <ul className="ayl-results">
          {search.data.hits.map((hit) => (
            <ResultCard key={hit.chunkId} hit={hit} mode={state.mode} debug={search.data.debug} />
          ))}
        </ul>
        {search.data.hits.length >= state.k && state.k < MAX_K ? (
          <div className="ayl-more">
            <Button variant="secondary" onClick={showMore}>
              Show more results
            </Button>
          </div>
        ) : null}
      </section>
    )

  return (
    <div className="ayl-stack">
      <section
        className="ayl-hero pp-grain"
        data-surface="vault"
        data-compact={submitted}
        aria-labelledby="ayl-title"
      >
        <VaultRings className="ayl-hero-dial" />
        <div className="ayl-hero-body">
          <h1 id="ayl-title" className="ayl-hero-title">
            Ask your life
          </h1>
          {submitted ? null : (
            <p className="ayl-hero-lede">
              Search everything you have saved by what you remember, not where you put it.
            </p>
          )}
          <form
            role="search"
            aria-label="Search your library"
            onSubmit={onSubmit}
            className="ayl-searchbar"
          >
            <div className="ayl-searchfield">
              <SearchIcon size={22} className="ayl-searchicon" />
              <Input
                ref={inputRef}
                size="lg"
                type="search"
                name="q"
                aria-label="Search your notes, documents and receipts"
                placeholder="How much was the deposit?"
                value={draft}
                maxLength={MAX_QUERY_LENGTH}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {draft === '' ? (
                <kbd className="ayl-kbd" aria-hidden="true">
                  /
                </kbd>
              ) : null}
            </div>
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>
          <p className="ayl-privacy">
            Private to you. Only you can see what you add, and search only looks at your own
            library. Press <kbd>/</kbd> to focus search.
          </p>
          {!submitted && hasDocuments ? (
            <div className="ayl-examples-row">
              <span className="ayl-examples-label" id="examples-label">
                Try asking
              </span>
              <div className="ayl-examples" role="group" aria-labelledby="examples-label">
                {EXAMPLES.map((example) => (
                  <Button
                    key={example}
                    variant="secondary"
                    size="sm"
                    onClick={() => apply({ q: example })}
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
      {libraryIsEmpty && !submitted ? null : (
        <>
          <ModeToggle value={state.mode} onChange={(mode) => apply({ mode })} compact={submitted} />
          <Filters value={state} onChange={(next) => apply(next)} />
        </>
      )}
      {body}
    </div>
  )
}

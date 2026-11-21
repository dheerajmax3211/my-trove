import { Button, Input, PageHeader, SearchIcon, Skeleton } from '@platform/ui'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorPanel } from '../../../components/ErrorPanel'
import { useSlashShortcut } from '../../../lib/useSlashShortcut'
import { useHasDocuments } from '../../documents/hooks/useDocuments'
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

function Landing({ onExample }: { onExample: (q: string) => void }) {
  const hasDocuments = useHasDocuments()
  if (hasDocuments.data === false) return <FirstUse />
  return (
    <section className="ayl-landing" aria-labelledby="try-heading">
      <h2 id="try-heading" className="ayl-h2">
        Try asking
      </h2>
      <div className="ayl-examples">
        {EXAMPLES.map((example) => (
          <Button key={example} variant="secondary" size="sm" onClick={() => onExample(example)}>
            {example}
          </Button>
        ))}
      </div>
      <ul className="ayl-tips">
        <li>Wrap words in &quot;quotes&quot; to match an exact phrase.</li>
        <li>Put - in front of a word to leave it out.</li>
        <li>Not sure of the exact words? Hybrid and Semantic find similar meanings too.</li>
      </ul>
    </section>
  )
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => stateFromParams(params), [params])
  const [draft, setDraft] = useState(state.q)
  const [syncedQ, setSyncedQ] = useState(state.q)
  const inputRef = useRef<HTMLInputElement>(null)

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

  /** Apply changes and search again. A new search always starts from the first page of results. */
  const apply = (changes: Partial<SearchState>) =>
    setParams(paramsFromState({ ...state, q: draft, k: DEFAULT_K, ...changes }))

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
  if (!submitted) body = <Landing onExample={(q) => apply({ q })} />
  else if (rangeError) body = null
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
    <>
      <PageHeader
        title="Ask your life"
        description="One private search across your own notes, documents and receipts."
      />
      <div className="ayl-stack">
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
              placeholder="Ask anything, for example: what did the landlord say about the deposit?"
              value={draft}
              maxLength={MAX_QUERY_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="ayl-kbd" aria-hidden="true">
              /
            </kbd>
          </div>
          <Button type="submit" size="lg">
            Search
          </Button>
        </form>
        <p className="ayl-privacy">
          Private to you. Only you can see what you add, and search only looks at your own library.
          Press <kbd>/</kbd> to focus search.
        </p>
        <ModeToggle value={state.mode} onChange={(mode) => apply({ mode })} />
        <Filters value={state} onChange={(next) => apply(next)} />
        {body}
      </div>
    </>
  )
}

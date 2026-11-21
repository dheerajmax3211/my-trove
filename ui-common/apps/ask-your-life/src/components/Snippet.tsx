import { Fragment } from 'react'
import { parseSnippet } from '../features/search/lib/snippet'

/**
 * Renders a backend snippet with its matches highlighted. Only React elements are created from the
 * parsed segments, so hostile text in a document can never become markup (see lib/snippet.ts).
 */
export function Snippet({ snippet, className }: { snippet: string; className?: string }) {
  return (
    <p className={className}>
      {parseSnippet(snippet).map((segment, index) =>
        segment.marked ? (
          <mark key={index}>{segment.text}</mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </p>
  )
}

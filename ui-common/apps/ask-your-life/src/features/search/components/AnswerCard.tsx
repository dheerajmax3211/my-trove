import { VisuallyHidden } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { SearchAnswer } from '../api/types'

/**
 * The extractive answer shown above the results: sentences quoted word for word from your documents, each with
 * where it comes from. Nothing here is generated, so it is labelled as a quote, not as an answer from an assistant.
 * Rendered as plain text (never as HTML).
 */
export function AnswerCard({ answer }: { answer: SearchAnswer }) {
  return (
    <section className="ayl-answer" aria-labelledby="ayl-answer-heading">
      <h2 id="ayl-answer-heading" className="ayl-answer-heading">
        From your documents
      </h2>
      <ol className="ayl-answer-quotes">
        {answer.sentences.map((s) => (
          <li key={`${s.chunkId}:${s.text}`}>
            <blockquote className="ayl-answer-quote">
              <p>{s.text}</p>
            </blockquote>
            <p className="ayl-answer-cite">
              <span aria-hidden="true">— </span>
              <ModuleLink
                className="ayl-link"
                to={{
                  pathname: '/library',
                  search: `?open=${encodeURIComponent(s.documentId)}`,
                }}
              >
                {s.title}
              </ModuleLink>
              , passage {s.chunkOrdinal + 1}
              <VisuallyHidden> (quoted from this document)</VisuallyHidden>
            </p>
          </li>
        ))}
      </ol>
      <p className="ayl-answer-note">
        Quoted from the best matches below, not written by an AI. Check the source.
      </p>
    </section>
  )
}

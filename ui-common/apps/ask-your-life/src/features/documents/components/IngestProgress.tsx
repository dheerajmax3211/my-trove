import type { DocumentStatus } from '../api/types'

const STEPS = ['Saved', 'Indexing', 'Ready'] as const

/** Saved, then Indexing, then Ready: where a document is on its way to being searchable. */
export function IngestProgress({ status }: { status: DocumentStatus }) {
  const current = status === 'PENDING' ? 1 : 2
  return (
    <ol className="ayl-progress" aria-label="Progress">
      {STEPS.map((label, index) => {
        const failed = status === 'FAILED' && index === 2
        const state = failed
          ? 'failed'
          : index < current
            ? 'done'
            : index === current
              ? status === 'INDEXED'
                ? 'done'
                : 'current'
              : 'todo'
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {failed ? 'Failed' : label}
          </li>
        )
      })}
    </ol>
  )
}

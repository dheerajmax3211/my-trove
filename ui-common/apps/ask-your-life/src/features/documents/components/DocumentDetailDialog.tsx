import {
  Button,
  Dialog,
  DialogClose,
  Field,
  Input,
  Skeleton,
  Textarea,
  useToast,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { SourceBadge, StatusBadge } from '../../../components/Badges'
import { ErrorPanel } from '../../../components/ErrorPanel'
import { describeIngestError } from '../api/documentsApi'
import type { DocumentResponse } from '../api/types'
import { useDocument, useReplaceContent } from '../hooks/useDocuments'
import { formatDateTime, STATUS_INFO } from '../lib/labels'

function ReplaceContentForm({ document }: { document: DocumentResponse }) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>()
  const replace = useReplaceContent((response) => {
    toast(
      response.outcome === 'DUPLICATE'
        ? {
            title: 'Nothing changed',
            description: 'That text is identical to what is already saved.',
            variant: 'info',
          }
        : {
            title: 'Content replaced',
            description: 'Indexing the new text. The old text stays searchable until it is done.',
            variant: 'success',
          },
    )
    setText('')
    setTitle('')
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (text.trim() === '') {
      setError('Paste the new text to replace the old content.')
      return
    }
    setError(undefined)
    replace.mutate({ id: document.id, title, text })
  }

  const failure = replace.error ? describeIngestError(replace.error) : null

  return (
    <details className="ayl-advanced">
      <summary>Replace content</summary>
      <form className="ayl-form" onSubmit={onSubmit} noValidate aria-label="Replace content">
        <Field label="New title" description="Leave empty to keep the current title.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="New text"
          required
          description="The text you save here replaces everything previously indexed for this item."
          error={error}
        >
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {failure ? <FailureCallout failure={failure} /> : null}
        <div>
          <Button type="submit" loading={replace.isPending}>
            Replace content
          </Button>
        </div>
      </form>
    </details>
  )
}

function Details({ document }: { document: DocumentResponse }) {
  return (
    <div className="ayl-detail">
      <div className="ayl-detail-badges">
        <SourceBadge type={document.sourceType} />
        <StatusBadge status={document.status} />
      </div>
      <p className="ayl-muted">{STATUS_INFO[document.status].description}</p>
      <dl className="ayl-facts">
        <div>
          <dt>Searchable passages</dt>
          <dd>{document.chunkCount}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{document.mimeType}</dd>
        </div>
        <div>
          <dt>Added</dt>
          <dd>{formatDateTime(document.createdAt)}</dd>
        </div>
        <div>
          <dt>Last changed</dt>
          <dd>{formatDateTime(document.updatedAt)}</dd>
        </div>
        <div>
          <dt>Indexed</dt>
          <dd>{formatDateTime(document.ingestedAt)}</dd>
        </div>
        {document.externalId ? (
          <div>
            <dt>External ID</dt>
            <dd>{document.externalId}</dd>
          </div>
        ) : null}
        <div>
          <dt>Fingerprint</dt>
          <dd className="ayl-mono">{document.contentHash.slice(0, 12)}</dd>
        </div>
      </dl>
      <ReplaceContentForm document={document} />
    </div>
  )
}

/** Opens one library item: what we know about it, plus a way to replace its content. */
export function DocumentDetailDialog({
  documentId,
  onClose,
}: {
  documentId: string | null
  onClose: () => void
}) {
  const query = useDocument(documentId)
  const title = query.data?.title ?? 'Document'

  let body
  if (query.isError)
    body =
      query.error.status === 404 ? (
        <p>This document no longer exists. It may have been deleted.</p>
      ) : (
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
      )
  else if (query.data) body = <Details document={query.data} />
  else
    body = (
      <div aria-busy="true" role="status" aria-label="Loading document">
        <Skeleton height="1rem" />
        <Skeleton height="1rem" width="70%" />
      </div>
    )

  return (
    <Dialog
      open={documentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={title}
      description="What is stored for this item. The text itself is never shown here."
      size="lg"
      footer={
        <DialogClose asChild>
          <Button variant="secondary">Close</Button>
        </DialogClose>
      }
    >
      {body}
    </Dialog>
  )
}

import { Button, Field, Input, Textarea, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { describeIngestError, validateNote, type FieldErrors } from '../api/documentsApi'
import type { IngestResponse, SourceType } from '../api/types'
import { useAddNote } from '../hooks/useDocuments'
import { ExternalIdField, SourceSelect } from './CommonFields'

const NOTE_KINDS: readonly SourceType[] = ['NOTE', 'RECEIPT', 'EMAIL']

export function AddNoteForm({ onAdded }: { onAdded: (response: IngestResponse) => void }) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('NOTE')
  const [externalId, setExternalId] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const add = useAddNote((response) => {
    toast(
      response.outcome === 'DUPLICATE'
        ? {
            title: 'Already in your library',
            description: 'Identical content was added before, so nothing new was saved.',
            variant: 'info',
          }
        : {
            title: response.outcome === 'UPDATED' ? 'Note updated' : 'Note saved',
            description: 'Indexing now. It will be searchable in a few seconds.',
            variant: 'success',
          },
    )
    setTitle('')
    setText('')
    setExternalId('')
    onAdded(response)
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateNote({ title, text, externalId })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    add.mutate({ title, text, sourceType, externalId })
  }

  const failure = add.error ? describeIngestError(add.error) : null

  return (
    <form className="ayl-form" onSubmit={onSubmit} noValidate aria-label="Paste a note">
      <Field
        label="Title"
        description="Optional. If you leave it empty, the first line becomes the title."
        error={errors.title}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Note" required description="Markdown is welcome." error={errors.text}>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <SourceSelect value={sourceType} onChange={setSourceType} options={NOTE_KINDS} />
      <ExternalIdField value={externalId} onChange={setExternalId} error={errors.externalId} />
      {failure ? (
        <div role="alert" className="ayl-callout" data-tone="danger">
          <strong>{failure.title}</strong>
          <span>{failure.message}</span>
        </div>
      ) : null}
      <div>
        <Button type="submit" loading={add.isPending}>
          Save note
        </Button>
      </div>
    </form>
  )
}

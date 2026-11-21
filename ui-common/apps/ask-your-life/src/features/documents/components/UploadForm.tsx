import { Button, Field, FileIcon, Input, useToast } from '@platform/ui'
import { useState, type DragEvent, type FormEvent } from 'react'
import { FailureCallout } from '../../../components/FailureCallout'
import { describeIngestError, validateUpload, type FieldErrors } from '../api/documentsApi'
import type { IngestResponse, SourceType } from '../api/types'
import { useUploadFile } from '../hooks/useDocuments'
import { ExternalIdField, SourceSelect } from './CommonFields'

/** Extensions the backend can read. PDF is deliberately absent: it answers 415 today. */
const ACCEPT = '.txt,.md,.markdown,.html,.htm,.csv,.log,.eml,text/*'

const formatSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export function UploadForm({ onAdded }: { onAdded: (response: IngestResponse) => void }) {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [pickerKey, setPickerKey] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [title, setTitle] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('FILE')
  const [externalId, setExternalId] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const upload = useUploadFile((response) => {
    toast(
      response.outcome === 'DUPLICATE'
        ? {
            title: 'Already in your library',
            description: 'Identical content was added before, so nothing new was saved.',
            variant: 'info',
          }
        : {
            title: response.outcome === 'UPDATED' ? 'File updated' : 'File uploaded',
            description: 'Indexing now. It will be searchable in a few seconds.',
            variant: 'success',
          },
    )
    setFile(null)
    setPickerKey((k) => k + 1)
    setTitle('')
    setExternalId('')
    onAdded(response)
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateUpload({ file, title, externalId })
    setErrors(found)
    if (!file || Object.keys(found).length > 0) return
    upload.mutate({ file, title, sourceType, externalId })
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  const failure = upload.error ? describeIngestError(upload.error) : null

  return (
    <form className="ayl-form" onSubmit={onSubmit} noValidate aria-label="Upload a file">
      <Field
        label="File"
        required
        description="Text, Markdown or HTML (.txt, .md, .html). PDFs are not supported yet."
        error={errors.file}
      >
        <div
          className="ayl-drop"
          data-dragging={dragging}
          data-filled={file !== null}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Input
            key={pickerKey}
            type="file"
            accept={ACCEPT}
            className="ayl-drop-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <FileIcon size={28} className="ayl-drop-icon" />
          {file ? (
            <p className="ayl-drop-text">
              <strong>{file.name}</strong> ({formatSize(file.size)}). Choose another to replace it.
            </p>
          ) : (
            <p className="ayl-drop-text">
              <strong>Drop a file here</strong> or click to choose one.
            </p>
          )}
        </div>
      </Field>
      <div className="ayl-form-row">
        <Field
          label="Title"
          description="Optional. Empty means the file name is used."
          error={errors.title}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <SourceSelect value={sourceType} onChange={setSourceType} />
      </div>
      <ExternalIdField value={externalId} onChange={setExternalId} error={errors.externalId} />
      {failure ? <FailureCallout failure={failure} /> : null}
      <div>
        <Button type="submit" loading={upload.isPending}>
          Upload file
        </Button>
      </div>
    </form>
  )
}

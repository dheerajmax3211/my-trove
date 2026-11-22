import { Button, Field, FileDrop, FormActions, Input, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { FailureCallout } from '../../../components/FailureCallout'
import { describeIngestError, validateUpload, type FieldErrors } from '../api/documentsApi'
import type { IngestResponse, SourceType } from '../api/types'
import { useUploadFile } from '../hooks/useDocuments'
import { ExternalIdField, SourceSelect } from './CommonFields'

/** Extensions the backend can read. PDF is deliberately absent: it answers 415 today. */
const ACCEPT = '.txt,.md,.markdown,.html,.htm,.csv,.log,.eml,text/*'

export function UploadForm({ onAdded }: { onAdded: (response: IngestResponse) => void }) {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [pickerKey, setPickerKey] = useState(0)
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

  const failure = upload.error ? describeIngestError(upload.error) : null

  return (
    <form className="ayl-form" onSubmit={onSubmit} noValidate aria-label="Upload a file">
      <Field
        label="File"
        required
        description="Text, Markdown or HTML (.txt, .md, .html). PDFs are not supported yet."
        error={errors.file}
      >
        <FileDrop
          key={pickerKey}
          accept={ACCEPT}
          title="Drop a file here or browse"
          hint=".txt, .md, .html, .csv, .eml"
          onFilesChange={(files) => setFile(files[0] ?? null)}
        />
      </Field>
      <Field
        label="Title"
        description="Optional. Empty means the file name is used."
        error={errors.title}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <SourceSelect value={sourceType} onChange={setSourceType} />
      <ExternalIdField value={externalId} onChange={setExternalId} error={errors.externalId} />
      {failure ? <FailureCallout failure={failure} /> : null}
      <FormActions
        sticky={false}
        status={file ? `${file.name} is ready to upload.` : 'No file chosen yet.'}
      >
        <Button type="submit" loading={upload.isPending}>
          Upload file
        </Button>
      </FormActions>
    </form>
  )
}

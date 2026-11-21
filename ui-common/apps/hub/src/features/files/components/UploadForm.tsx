import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  useToast,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { ScopeSelect, SCOPE_PERSONAL } from '../../../components/ScopeSelect'
import { errorMessage } from '../../../lib/errors'
import { formatBytes } from '../../../lib/format'
import type { Household } from '../../households/types'
import { useUploadFile } from '../hooks'
import { MAX_UPLOAD_BYTES } from '../limits'

export function UploadForm({ households }: { households: readonly Household[] }) {
  const { toast } = useToast()
  const upload = useUploadFile()
  const [file, setFile] = useState<File | null>(null)
  const [scope, setScope] = useState(SCOPE_PERSONAL)
  const [error, setError] = useState<string>()
  // Changing the key remounts the file input, which is the only way to clear it.
  const [inputKey, setInputKey] = useState(0)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!file) return setError('Choose a file to upload.')
    if (file.size > MAX_UPLOAD_BYTES)
      return setError(
        `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
      )
    setError(undefined)
    upload.mutate(
      { file, householdId: scope === SCOPE_PERSONAL ? null : scope },
      {
        onSuccess: (stored) => {
          toast({ title: 'File uploaded', description: stored.name, variant: 'success' })
          setFile(null)
          setInputKey((k) => k + 1)
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Upload a file</CardTitle>
        <CardDescription>
          Up to {formatBytes(MAX_UPLOAD_BYTES)}. Personal files are visible only to you; household
          files to every member.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="hub-toolbar" onSubmit={submit} noValidate>
          <Field label="File" error={error}>
            <Input
              key={inputKey}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <ScopeSelect label="Save to" value={scope} onChange={setScope} households={households} />
          <Button type="submit" loading={upload.isPending}>
            Upload
          </Button>
        </form>
        {upload.error ? <p role="alert">{errorMessage(upload.error)}</p> : null}
      </CardContent>
    </Card>
  )
}

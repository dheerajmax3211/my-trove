import { Button, FieldError, useToast } from '@platform/ui'
import { useState, type DragEvent, type FormEvent } from 'react'
import { ScopeSelect, SCOPE_PERSONAL } from '../../../components/ScopeSelect'
import { errorMessage } from '../../../lib/errors'
import { formatBytes } from '../../../lib/format'
import type { Household } from '../../households/types'
import { useUploadFile } from '../hooks'
import { MAX_UPLOAD_BYTES } from '../limits'
import styles from './UploadForm.module.css'

/**
 * A drop zone with a real file input stretched over it: clicking anywhere opens the picker, dropping a file
 * puts it in the input natively, and keyboard and screen reader users get the ordinary control.
 */
export function UploadForm({
  households,
  defaultScope,
}: {
  households: readonly Household[]
  defaultScope?: string | undefined
}) {
  const { toast } = useToast()
  const upload = useUploadFile()
  const [file, setFile] = useState<File | null>(null)
  const [scope, setScope] = useState(defaultScope ?? SCOPE_PERSONAL)
  const [error, setError] = useState<string>()
  const [over, setOver] = useState(false)
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

  const hover = (next: boolean) => (event: DragEvent) => {
    event.preventDefault()
    setOver(next)
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-label="Upload a file">
      <div
        className={styles.zone}
        data-over={over || undefined}
        data-filled={file ? '' : undefined}
      >
        <input
          key={inputKey}
          type="file"
          aria-label="File"
          className={styles.input}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setError(undefined)
          }}
          onDragEnter={hover(true)}
          onDragOver={hover(true)}
          onDragLeave={hover(false)}
          onDrop={() => setOver(false)}
        />
        <p className={styles.prompt}>
          {file ? (
            <>
              <strong className={styles.picked}>{file.name}</strong>
              <span className={styles.hint}>
                {formatBytes(file.size)}. Choose another file to replace it.
              </span>
            </>
          ) : (
            <>
              <strong>Drop a file here, or choose one</strong>
              <span className={styles.hint}>
                Up to {formatBytes(MAX_UPLOAD_BYTES)}. Personal files are visible only to you;
                household files to every member.
              </span>
            </>
          )}
        </p>
      </div>
      <div className={styles.controls}>
        <ScopeSelect label="Save to" value={scope} onChange={setScope} households={households} />
        <Button type="submit" loading={upload.isPending}>
          Upload
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      {upload.error ? <p role="alert">{errorMessage(upload.error)}</p> : null}
    </form>
  )
}

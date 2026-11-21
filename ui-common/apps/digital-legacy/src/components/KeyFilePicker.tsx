import { Field, Textarea } from '@platform/ui'
import { useState, type ChangeEvent } from 'react'
import { readTextFile } from '../lib/files'

/** Loads a key file either from disk or pasted as text. The contents live only in the parent's state. */
export function KeyFilePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (text: string) => void
}) {
  const [fileError, setFileError] = useState<string | null>(null)
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setFileError(null)
      onChange(await readTextFile(file))
    } catch {
      setFileError('That file could not be read.')
    }
  }
  return (
    <div className="stack-3">
      <Field label={`${label}: choose the file`} error={fileError ?? undefined}>
        <input
          type="file"
          accept=".json,application/json,text/plain"
          onChange={(e) => void onFile(e)}
        />
      </Field>
      <Field
        label={`${label}: or paste its contents`}
        description="The file is read in this browser. It is never uploaded."
      >
        <Textarea
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="mono"
        />
      </Field>
    </div>
  )
}

import { useId, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { cx } from '../internal/cx'
import { useFieldContext } from '../internal/field-context'
import { CloseIcon, FileIcon, UploadIcon } from '../internal/icons'
import styles from './FileDrop.module.css'

export interface FileDropProps {
  /** Called with the full list of accepted files whenever it changes. */
  onFilesChange?: (files: File[]) => void
  accept?: string
  multiple?: boolean
  /** Largest allowed file in bytes; larger files are rejected with a message. */
  maxSize?: number
  disabled?: boolean
  /** Primary line. Default "Drop files here or browse". */
  title?: ReactNode
  /** Secondary line: formats and limits. */
  hint?: ReactNode
  name?: string
  className?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * A file drop zone. It is a real `<input type="file">` (visually hidden but focusable) with a
 * styled drop target around it, so it works by keyboard, by click and by drag. Accepted files are
 * listed with a remove button; rejected ones explain why. Inside a `Field` it takes the label and
 * description from it.
 */
export function FileDrop({
  onFilesChange,
  accept,
  multiple = false,
  maxSize,
  disabled = false,
  title = 'Drop files here or browse',
  hint,
  name,
  className,
}: FileDropProps) {
  const field = useFieldContext()
  const generated = useId()
  const inputId = field?.id ?? generated
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState<string[]>([])

  const accepts = (file: File): boolean => {
    if (!accept) return true
    return accept.split(',').some((rule) => {
      const r = rule.trim().toLowerCase()
      if (r.startsWith('.')) return file.name.toLowerCase().endsWith(r)
      if (r.endsWith('/*')) return file.type.startsWith(r.slice(0, -1))
      return file.type === r
    })
  }

  const take = (incoming: FileList | File[]) => {
    const next: File[] = multiple ? [...files] : []
    const bad: string[] = []
    for (const file of Array.from(incoming)) {
      if (!accepts(file)) bad.push(`${file.name} is not an accepted file type.`)
      else if (maxSize !== undefined && file.size > maxSize)
        bad.push(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(maxSize)}.`)
      else next.push(file)
      if (!multiple && next.length > 0) break
    }
    setRejected(bad)
    setFiles(next)
    onFilesChange?.(next)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) take(e.target.files)
    e.target.value = ''
  }
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(false)
    if (!disabled) take(e.dataTransfer.files)
  }
  const remove = (index: number) => {
    const next = files.filter((_, i) => i !== index)
    setFiles(next)
    onFilesChange?.(next)
  }

  return (
    <div className={cx(styles.root, className)}>
      <div
        className={cx(styles.zone, over && styles.over, disabled && styles.disabled)}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-over={over || undefined}
        data-invalid={field?.invalid || rejected.length > 0 || undefined}
      >
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          className={styles.input}
          accept={accept}
          multiple={multiple}
          disabled={disabled || field?.disabled}
          aria-describedby={
            [field?.descriptionId, field?.invalid ? field.errorId : undefined]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={onChange}
        />
        <span className={styles.icon} aria-hidden="true">
          <UploadIcon size={22} />
        </span>
        <span className={styles.title}>{title}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      {rejected.length > 0 ? (
        <ul className={styles.rejected} role="alert">
          {rejected.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {files.length > 0 ? (
        <ul className={styles.list} aria-label="Selected files">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className={styles.file}>
              <span className={styles.fileIcon} aria-hidden="true">
                <FileIcon size={18} />
              </span>
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>{formatBytes(file.size)}</span>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${file.name}`}
                onClick={() => remove(i)}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

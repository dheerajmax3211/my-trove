import { Button, Dialog, DialogClose, Field, Input, Select, useToast } from '@platform/ui'
import { useState } from 'react'
import { CopyButton } from '../../../components/CopyButton'
import { errorMessage } from '../../../lib/errors'
import { formatDateTime } from '../../../lib/format'
import { useCoreEnv } from '../../../core/env'
import { useCreateDownloadLink } from '../hooks'
import type { StoredFile } from '../types'

const TTL_OPTIONS = [
  { seconds: 60, label: '1 minute' },
  { seconds: 600, label: '10 minutes' },
  { seconds: 1800, label: '30 minutes' },
  { seconds: 3600, label: '1 hour' },
] as const

function LinkBody({ file }: { file: StoredFile }) {
  const env = useCoreEnv()
  const { toast } = useToast()
  const [ttl, setTtl] = useState(600)
  const [saving, setSaving] = useState(false)
  const createLink = useCreateDownloadLink()
  const link = createLink.data
  const fullUrl = link ? new URL(env.downloadUrl(link.url), window.location.href).href : null

  const download = async () => {
    if (!fullUrl) return
    setSaving(true)
    try {
      await env.saveDownload(fullUrl, file.name)
    } catch (error) {
      toast({
        title: 'Download failed',
        description: errorMessage(error),
        variant: 'danger',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hub-stack-sm">
      <Field label="Link stays valid for">
        <Select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
          {TTL_OPTIONS.map((o) => (
            <option key={o.seconds} value={o.seconds}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button
          variant="secondary"
          loading={createLink.isPending}
          onClick={() => createLink.mutate({ id: file.id, ttlSeconds: ttl })}
        >
          {link ? 'Create a new link' : 'Create link'}
        </Button>
      </div>
      {createLink.error ? <p role="alert">{errorMessage(createLink.error)}</p> : null}
      {link && fullUrl ? (
        <div className="hub-callout" role="status">
          <Field label="Download link">
            <Input readOnly value={fullUrl} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <span className="hub-muted">
            Expires {formatDateTime(link.expiresAt)}. Anyone with this link can download the file
            until then, so share it carefully.
          </span>
          <div className="hub-row">
            <CopyButton value={fullUrl} label="Copy link" />
            <Button size="sm" loading={saving} onClick={() => void download()}>
              Download
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DownloadLinkDialog({
  file,
  onClose,
}: {
  file: StoredFile | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={file ? `Share ${file.name}` : 'Share file'}
      description="Create a signed link that works without signing in, for a short time."
      footer={
        <DialogClose asChild>
          <Button variant="secondary">Done</Button>
        </DialogClose>
      }
    >
      {file ? <LinkBody key={file.id} file={file} /> : null}
    </Dialog>
  )
}

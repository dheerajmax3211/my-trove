import { Button, EmptyState, IllustrationEmpty, PageHeader, Skeleton, useToast } from '@platform/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorState } from '../../../components/ErrorState'
import { ScopeSelect, SCOPE_ALL, SCOPE_PERSONAL, scopeName } from '../../../components/ScopeSelect'
import { usePeople } from '../../../core/people'
import { formatBytes, formatDateTime } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useHouseholds } from '../../households/hooks'
import type { Household } from '../../households/types'
import { DownloadLinkDialog } from '../components/DownloadLinkDialog'
import { FileTile } from '../components/FileTile'
import { UploadForm } from '../components/UploadForm'
import { useDeleteFile, useFiles } from '../hooks'
import type { StoredFile } from '../types'
import styles from './Files.module.css'

/** The uploader can delete; so can a household owner for household files. */
function canDelete(file: StoredFile, uid: string | undefined, households: readonly Household[]) {
  if (file.ownerUid === uid) return true
  return households.find((h) => h.id === file.householdId)?.role === 'OWNER'
}

export function FilesPage() {
  usePageTitle('Files')
  const people = usePeople()
  const { toast } = useToast()
  const households = useHouseholds()
  const [params] = useSearchParams()
  const [scope, setScope] = useState(params.get('household') ?? SCOPE_ALL)
  const [sharing, setSharing] = useState<StoredFile | null>(null)
  const [deleting, setDeleting] = useState<StoredFile | null>(null)
  const remove = useDeleteFile()

  const householdList = households.data ?? []
  const householdScope = scope !== SCOPE_ALL && scope !== SCOPE_PERSONAL ? scope : undefined
  const files = useFiles(householdScope)
  const rows = (files.data ?? [])
    .filter((f) => scope !== SCOPE_PERSONAL || f.householdId === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      <PageHeader
        eyebrow="Files"
        title="Files"
        description="Keep important documents in one place and share them with a short-lived link."
      />
      <div className="hub-stack">
        <UploadForm households={householdList} defaultScope={householdScope} />
        <div className="hub-toolbar">
          <ScopeSelect
            label="Show files for"
            value={scope}
            onChange={setScope}
            households={householdList}
            includeAll
          />
        </div>
        {files.isError ? (
          <ErrorState error={files.error} onRetry={() => void files.refetch()} />
        ) : files.isPending ? (
          <div className="hub-stack-sm" aria-busy="true" aria-label="Loading files">
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            illustration={<IllustrationEmpty />}
            headingAs="h2"
            title="No files yet"
            description="Drop a document above and it will be listed here. Household files are visible to every member."
          />
        ) : (
          <ul className={styles.list} aria-label="Files">
            {rows.map((f) => (
              <li key={f.id} className={styles.item}>
                <FileTile name={f.name} contentType={f.contentType} />
                <div className={styles.body}>
                  <span className={styles.name}>{f.name}</span>
                  <span className={styles.meta}>
                    {formatBytes(f.sizeBytes)}, {scopeName(f.householdId, householdList)}
                    {f.householdId && f.ownerUid !== people.selfUid
                      ? `, added by ${people.nameOf(f.ownerUid)}`
                      : ''}
                  </span>
                  <span className={styles.meta}>Uploaded {formatDateTime(f.createdAt)}</span>
                </div>
                <span className={styles.actions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Get link for ${f.name}`}
                    onClick={() => setSharing(f)}
                  >
                    Get link
                  </Button>
                  {canDelete(f, people.selfUid, householdList) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${f.name}`}
                      onClick={() => setDeleting(f)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DownloadLinkDialog file={sharing} onClose={() => setSharing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
            remove.reset()
          }
        }}
        title="Delete this file?"
        description={
          deleting
            ? `"${deleting.name}" is removed for everyone who can see it, and any links to it stop working.`
            : ''
        }
        confirmLabel="Delete file"
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(
            { id: deleting.id },
            {
              onSuccess: () => {
                toast({ title: 'File deleted', description: deleting.name, variant: 'success' })
                setDeleting(null)
              },
            },
          )
        }}
      />
    </>
  )
}

import { useAuth } from '@platform/auth-web'
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  useToast,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorState } from '../../../components/ErrorState'
import { ScopeSelect, SCOPE_ALL, SCOPE_PERSONAL, scopeName } from '../../../components/ScopeSelect'
import { formatBytes, formatDateTime } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useHouseholds } from '../../households/hooks'
import type { Household } from '../../households/types'
import { DownloadLinkDialog } from '../components/DownloadLinkDialog'
import { UploadForm } from '../components/UploadForm'
import { useDeleteFile, useFiles } from '../hooks'
import type { StoredFile } from '../types'

/** The uploader can delete; so can a household owner for household files. */
function canDelete(file: StoredFile, uid: string | undefined, households: readonly Household[]) {
  if (file.ownerUid === uid) return true
  return households.find((h) => h.id === file.householdId)?.role === 'OWNER'
}

export function FilesPage() {
  usePageTitle('Files')
  const { user } = useAuth()
  const { toast } = useToast()
  const households = useHouseholds()
  const [scope, setScope] = useState(SCOPE_ALL)
  const [sharing, setSharing] = useState<StoredFile | null>(null)
  const [deleting, setDeleting] = useState<StoredFile | null>(null)
  const remove = useDeleteFile()

  const householdList = households.data ?? []
  const householdScope = scope !== SCOPE_ALL && scope !== SCOPE_PERSONAL ? scope : undefined
  const files = useFiles(householdScope)
  const rows = (files.data ?? []).filter((f) => scope !== SCOPE_PERSONAL || f.householdId === null)

  const columns: DataTableColumn<StoredFile>[] = [
    {
      id: 'name',
      header: 'Name',
      sortValue: (f) => f.name,
      cell: (f) => <strong>{f.name}</strong>,
    },
    {
      id: 'size',
      header: 'Size',
      sortValue: (f) => f.sizeBytes,
      cell: (f) => formatBytes(f.sizeBytes),
    },
    {
      id: 'scope',
      header: 'Saved to',
      sortValue: (f) => scopeName(f.householdId, householdList),
      cell: (f) => scopeName(f.householdId, householdList),
    },
    {
      id: 'uploaded',
      header: 'Uploaded',
      sortValue: (f) => f.createdAt,
      cell: (f) => formatDateTime(f.createdAt),
    },
    {
      id: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (f) => (
        <span className="hub-row">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Get link for ${f.name}`}
            onClick={() => setSharing(f)}
          >
            Get link
          </Button>
          {canDelete(f, user?.uid, householdList) ? (
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
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Files"
        title="Files"
        description="Keep important documents in one place and share them with a short-lived link."
      />
      <div className="hub-stack">
        <UploadForm households={householdList} />
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
        ) : (
          <DataTable
            caption="Files"
            columns={columns}
            data={rows}
            getRowId={(f) => f.id}
            loading={files.isPending}
            defaultSort={{ columnId: 'uploaded', direction: 'desc' }}
            emptyState={
              <EmptyState
                headingAs="h2"
                title="No files yet"
                description="Upload a document above and it will be listed here."
              />
            }
          />
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

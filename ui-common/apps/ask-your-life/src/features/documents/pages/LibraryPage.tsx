import {
  BarList,
  BentoCard,
  BentoGrid,
  BigStat,
  Button,
  Callout,
  DataTable,
  EmptyState,
  FileIcon,
  IllustrationEmpty,
  PageHeader,
  PlusIcon,
  ProgressStat,
  Select,
  SearchIcon,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { ModuleLink } from '@platform/workspace-kit'
import { useSearchParams } from 'react-router-dom'
import { SourceBadge, StatusBadge } from '../../../components/Badges'
import { ErrorPanel } from '../../../components/ErrorPanel'
import { PAGE_SIZE } from '../api/documentsApi'
import { SOURCE_TYPES, type DocumentResponse, type SourceType } from '../api/types'
import { DeleteDocumentDialog } from '../components/DeleteDocumentDialog'
import { DocumentDetailDialog } from '../components/DocumentDetailDialog'
import { useDocumentList } from '../hooks/useDocuments'
import { formatDate, SOURCE_LABELS } from '../lib/labels'

export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const [sourceType, setSourceType] = useState<SourceType | null>(null)
  const [offset, setOffset] = useState(0)
  const [toDelete, setToDelete] = useState<DocumentResponse | null>(null)
  const list = useDocumentList(sourceType, offset)

  const open = (id: string | null) => setParams(id ? { open: id } : {}, { replace: id === null })

  const columns: DataTableColumn<DocumentResponse>[] = [
    {
      id: 'title',
      header: 'Title',
      sortValue: (d) => d.title,
      cell: (d) => (
        <Button variant="ghost" size="sm" onClick={() => open(d.id)}>
          {d.title}
        </Button>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      sortValue: (d) => d.sourceType,
      cell: (d) => <SourceBadge type={d.sourceType} />,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (d) => d.status,
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      id: 'chunks',
      header: 'Passages',
      headerLabel: 'Searchable passages',
      align: 'end',
      sortValue: (d) => d.chunkCount,
      cell: (d) => d.chunkCount,
    },
    {
      id: 'created',
      header: 'Added',
      sortValue: (d) => new Date(d.createdAt),
      cell: (d) => formatDate(d.createdAt),
    },
    {
      id: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (d) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${d.title}`}
          onClick={() => setToDelete(d)}
        >
          Delete
        </Button>
      ),
    },
  ]

  const documents = list.data ?? []
  const failed = documents.filter((d) => d.status === 'FAILED').length
  const indexing = documents.filter((d) => d.status === 'PENDING').length
  const isEmptyLibrary = list.data?.length === 0 && offset === 0 && sourceType === null

  let body
  if (list.isError)
    body = (
      <ErrorPanel
        error={list.error}
        onRetry={() => void list.refetch()}
        title="Could not load your library"
      />
    )
  else if (isEmptyLibrary)
    body = (
      <EmptyState
        illustration={<IllustrationEmpty />}
        title="Your library is empty"
        description="Notes, files and receipts you add show up here. Only you can see them."
        action={
          <Button asChild leftIcon={<PlusIcon size={18} />}>
            <ModuleLink to="/add">Add your first note</ModuleLink>
          </Button>
        }
      />
    )
  else
    body = (
      <>
        {documents.length > 0 ? (
          <BentoGrid>
            <BentoCard span={4} title="In this view" icon={<FileIcon size={18} />}>
              <BigStat
                value={documents.length}
                unit={documents.length === 1 ? 'item' : 'items'}
                trend="flat"
                caption={sourceType ? SOURCE_LABELS[sourceType] : 'All sources'}
              />
            </BentoCard>
            <BentoCard span={4} title="Searchable" icon={<SearchIcon size={18} />}>
              <ProgressStat
                label="Ready to search"
                value={Math.round(
                  ((documents.length - indexing - failed) / documents.length) * 100,
                )}
                tone="lilac"
                caption={`${indexing} indexing, ${failed} failed`}
              />
            </BentoCard>
            <BentoCard span={4} tone="dark" title="By source" icon={<FileIcon size={18} />}>
              <BarList
                label="Items by source"
                items={SOURCE_TYPES.map((type) => ({
                  label: SOURCE_LABELS[type],
                  value: documents.filter((d) => d.sourceType === type).length,
                })).filter((item) => item.value > 0)}
              />
            </BentoCard>
          </BentoGrid>
        ) : null}
        {failed > 0 ? (
          <Callout
            variant="warning"
            role="note"
            title={
              failed === 1 ? '1 item could not be indexed' : `${failed} items could not be indexed`
            }
          >
            Search cannot find {failed === 1 ? 'it' : 'them'}. Open the item, delete it and add it
            again.
          </Callout>
        ) : null}
        {indexing > 0 ? (
          <Callout
            variant="info"
            title={
              indexing === 1 ? '1 item is still indexing' : `${indexing} items are still indexing`
            }
          >
            This list updates by itself. Items become searchable when they show Ready.
          </Callout>
        ) : null}
        <DataTable
          caption="Your documents"
          columns={columns}
          data={documents}
          getRowId={(d) => d.id}
          loading={list.isPending}
          defaultSort={{ columnId: 'created', direction: 'desc' }}
          emptyState={
            <EmptyState
              title="Nothing here"
              description={
                sourceType
                  ? `You have no ${SOURCE_LABELS[sourceType].toLowerCase()} items on this page.`
                  : 'There are no more documents.'
              }
              headingAs="h3"
            />
          }
        />
        <div className="ayl-pager">
          <Button
            variant="secondary"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={documents.length < PAGE_SIZE}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </>
    )

  return (
    <>
      <PageHeader
        title="Library"
        description="Everything you have added. Only you can see it."
        actions={
          <Button asChild leftIcon={<PlusIcon size={18} />}>
            <ModuleLink to="/add">Add content</ModuleLink>
          </Button>
        }
      />
      <div className="ayl-stack">
        <div className="ayl-toolbar">
          <label className="ayl-inline-field">
            <span>Show</span>
            <Select
              size="sm"
              value={sourceType ?? ''}
              onChange={(e) => {
                setSourceType(e.target.value === '' ? null : (e.target.value as SourceType))
                setOffset(0)
              }}
            >
              <option value="">All sources</option>
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SOURCE_LABELS[type]}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {body}
      </div>
      <DocumentDetailDialog documentId={openId} onClose={() => open(null)} />
      <DeleteDocumentDialog document={toDelete} onClose={() => setToDelete(null)} />
    </>
  )
}

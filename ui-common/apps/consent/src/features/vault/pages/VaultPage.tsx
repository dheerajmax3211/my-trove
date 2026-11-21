import {
  Button,
  EmptyState,
  Field,
  Input,
  InboxIcon,
  PageHeader,
  PlusIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@platform/ui'
import { useState } from 'react'
import type { Attribute } from '../../../shared/api/types'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingBlock } from '../../../shared/components/LoadingBlock'
import { filterAttributes } from '../api/tree'
import { AttributeDialog } from '../components/AttributeDialog'
import { AttributeTable, AttributeTree } from '../components/AttributeViews'
import { useAttributes, useDeleteAttribute } from '../hooks/useVault'

type Editing = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; attribute: Attribute }

export function VaultPage() {
  const { toast } = useToast()
  const attributes = useAttributes()
  const remove = useDeleteAttribute()
  const [filter, setFilter] = useState('')
  const [view, setView] = useState('tree')
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' })
  const [deleting, setDeleting] = useState<Attribute | null>(null)

  const visible = filterAttributes(attributes.data ?? [], filter)
  const actions = {
    onEdit: (attribute: Attribute) => setEditing({ mode: 'edit', attribute }),
    onDelete: (attribute: Attribute) => setDeleting(attribute),
  }

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.keyPath, {
      onSuccess: () => {
        toast({ title: 'Attribute deleted', description: deleting.keyPath, variant: 'success' })
        setDeleting(null)
      },
    })
  }

  let content
  if (attributes.isPending) content = <LoadingBlock label="Loading your vault" />
  else if (attributes.isError)
    content = <ErrorState error={attributes.error} onRetry={() => void attributes.refetch()} />
  else if (attributes.data.length === 0)
    content = (
      <EmptyState
        icon={<InboxIcon size={24} />}
        title="Your vault is empty"
        description="Add the first piece of information you might want to share, such as a shoe size or an allergy."
        action={
          <Button onClick={() => setEditing({ mode: 'add' })}>Add your first attribute</Button>
        }
      />
    )
  else if (visible.length === 0)
    content = (
      <EmptyState
        title="No attributes match"
        description={`Nothing in your vault has "${filter.trim()}" in its key path.`}
        headingAs="h2"
        action={
          <Button variant="secondary" onClick={() => setFilter('')}>
            Clear filter
          </Button>
        }
      />
    )
  else
    content = (
      <Tabs value={view} onValueChange={setView}>
        <TabsList aria-label="Vault view">
          <TabsTrigger value="tree">Tree</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>
        <TabsContent value="tree">
          <AttributeTree attributes={visible} {...actions} />
        </TabsContent>
        <TabsContent value="table">
          <AttributeTable attributes={visible} {...actions} />
        </TabsContent>
      </Tabs>
    )

  return (
    <>
      <PageHeader
        title="Vault"
        description="Everything you keep about yourself. Apps only ever see what you approve."
        actions={
          <Button leftIcon={<PlusIcon size={18} />} onClick={() => setEditing({ mode: 'add' })}>
            Add attribute
          </Button>
        }
      />
      <div className="page-stack">
        {attributes.data && attributes.data.length > 0 ? (
          <div className="toolbar">
            <Field label="Filter by key path" className="toolbar-grow">
              <Input
                type="search"
                value={filter}
                placeholder="profile.sizes"
                onChange={(e) => setFilter(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
        {content}
      </div>
      <AttributeDialog
        open={editing.mode !== 'closed'}
        onOpenChange={(open) => !open && setEditing({ mode: 'closed' })}
        attribute={editing.mode === 'edit' ? editing.attribute : null}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
            remove.reset()
          }
        }}
        title="Delete this attribute?"
        description={
          <>
            <code className="mono">{deleting?.keyPath}</code> will be removed from your vault. Apps
            that were allowed to read it will no longer receive it. This cannot be undone.
          </>
        }
        confirmLabel="Delete attribute"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onConfirm={confirmDelete}
      />
    </>
  )
}

import { ApiError, useApiMutation, useApiQuery, apiQueryKey } from '@platform/api-client'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  DialogClose,
  EmptyState,
  Field,
  InboxIcon,
  Input,
  PageHeader,
  PlusIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import type { DemoRequest } from './mockApi'
import type { DemoRuntime } from './runtime'

function fieldError(error: ApiError | null, field: string): string | undefined {
  const errors = error?.extensions.errors
  if (errors && typeof errors === 'object' && field in errors) {
    const messages = (errors as Record<string, unknown>)[field]
    return Array.isArray(messages) ? messages.join(' ') : undefined
  }
  return undefined
}

function NewRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [person, setPerson] = useState('')
  const create = useApiMutation<DemoRequest, { title: string; person: string }>({
    path: '/requests',
    invalidate: [apiQueryKey('/requests')],
    onSuccess: (created) => {
      toast({
        title: 'Request created',
        description: `Waiting on ${created.person}.`,
        variant: 'success',
      })
      setTitle('')
      setPerson('')
      onOpenChange(false)
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate({ title, person })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset()
        onOpenChange(next)
      }}
      title="New request"
      description="Who owes you what? The mock API validates on the server and answers with problem+json."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="new-request-form" loading={create.isPending}>
            Create request
          </Button>
        </>
      }
    >
      <form id="new-request-form" className="stack-3" onSubmit={onSubmit} noValidate>
        <Field label="What are you waiting on?" required error={fieldError(create.error, 'title')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Who from?" required error={fieldError(create.error, 'person')}>
          <Input value={person} onChange={(e) => setPerson(e.target.value)} />
        </Field>
        {create.error && !create.error.extensions.errors ? (
          <p role="alert">{create.error.message}</p>
        ) : null}
      </form>
    </Dialog>
  )
}

export function RequestsPage({ runtime }: { runtime: DemoRuntime }) {
  const { toast } = useToast()
  const [status, setStatus] = useState<'all' | 'open' | 'done'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tokens, setTokens] = useState(runtime.stub?.issuedTokens() ?? 0)

  const requests = useApiQuery<DemoRequest[]>(
    '/requests',
    status === 'all' ? {} : { query: { status } },
  )
  const complete = useApiMutation<DemoRequest, { id: string }>({
    path: (v) => `/requests/${v.id}/complete`,
    invalidate: [apiQueryKey('/requests')],
  })

  const columns: DataTableColumn<DemoRequest>[] = [
    { id: 'title', header: 'Request', cell: (r) => r.title, sortValue: (r) => r.title },
    { id: 'person', header: 'From', cell: (r) => r.person, sortValue: (r) => r.person },
    { id: 'due', header: 'Due', cell: (r) => r.due, sortValue: (r) => r.due },
    {
      id: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge variant={r.status === 'done' ? 'success' : 'accent'} dot>
          {r.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (r) =>
        r.status === 'open' ? (
          <Button
            size="sm"
            variant="ghost"
            loading={complete.isPending && complete.variables?.id === r.id}
            onClick={() => complete.mutate({ id: r.id })}
          >
            Mark done
          </Button>
        ) : null,
    },
  ]

  const showApiError = async (path: string) => {
    try {
      await runtime.apiClient.get(path)
    } catch (error) {
      if (error instanceof ApiError) {
        toast({
          title: `${error.status} ${error.title}`,
          description: error.detail ?? error.type,
          variant: 'danger',
          duration: 8000,
        })
      }
    }
  }

  const refreshDemo = async () => {
    runtime.stub?.expireToken()
    const before = runtime.stub?.issuedTokens() ?? 0
    await requests.refetch()
    const after = runtime.stub?.issuedTokens() ?? 0
    setTokens(after)
    toast({
      title: after > before ? 'Token refreshed automatically' : 'No refresh needed',
      description:
        after > before
          ? 'The first call got a 401, the client forced a token refresh and retried once.'
          : 'The token was still valid.',
      variant: after > before ? 'info' : 'neutral',
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Demo app"
        title="Requests"
        description={`Loaded through @platform/api-client with a Bearer token. API target: ${runtime.apiTarget}.`}
        actions={
          <Button leftIcon={<PlusIcon size={18} />} onClick={() => setDialogOpen(true)}>
            New request
          </Button>
        }
      />
      <div className="pg-stack">
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList aria-label="Filter by status">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
        </Tabs>

        {requests.isError ? (
          <EmptyState
            title={requests.error.title}
            description={requests.error.detail ?? 'Something went wrong.'}
            action={<Button onClick={() => void requests.refetch()}>Try again</Button>}
          />
        ) : (
          <DataTable
            caption="Requests"
            columns={columns}
            data={requests.data ?? []}
            getRowId={(r) => r.id}
            loading={requests.isPending}
            defaultSort={{ columnId: 'due', direction: 'asc' }}
            emptyState={
              <EmptyState
                icon={<InboxIcon size={24} />}
                title="Nothing here"
                description="No requests match this filter."
                headingAs="h3"
              />
            }
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle as="h2">API client behaviours</CardTitle>
            <CardDescription>
              Try the failure paths: each one is a real request through the same client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="row-wrap">
              {runtime.stub ? (
                <Button variant="secondary" onClick={() => void refreshDemo()}>
                  Expire token, then refetch
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => void showApiError('/boom')}>
                Trigger 500 (problem+json)
              </Button>
              <Button variant="secondary" onClick={() => void showApiError('/forbidden')}>
                Trigger 403
              </Button>
              <Button variant="secondary" onClick={() => void showApiError('/missing')}>
                Trigger 404
              </Button>
            </div>
            {runtime.stub ? (
              <p className="pg-muted">Tokens issued so far (stub): {tokens}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <NewRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}

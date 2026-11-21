import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  Dialog,
  DialogClose,
  EmptyState,
  Field,
  IconButton,
  Illustration,
  InboxIcon,
  Input,
  PageHeader,
  PlusIcon,
  SearchIcon,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToastProvider,
  Tooltip,
  useToast,
  type BadgeVariant,
  type ButtonSize,
  type ButtonVariant,
  type DataTableColumn,
  type ToastVariant,
} from '@platform/ui'
import type { ReactNode } from 'react'
import type { ControlDef, Values } from '../components/Playground'
import { identityDocs } from './identity-docs'
import { sampleRequests, type SampleRequest } from './sample-data'

export interface ComponentDoc {
  slug: string
  title: string
  description: string
  controls: readonly ControlDef[]
  render: (values: Values) => ReactNode
  block?: boolean
  /** Accessibility behaviour worth knowing about. */
  a11y: readonly string[]
  usage: string
}

const buttonVariants = ['primary', 'secondary', 'ghost', 'danger'] as const
const sizes = ['sm', 'md', 'lg'] as const
const badgeVariants = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'] as const
const toastVariants = ['neutral', 'success', 'info', 'warning', 'danger'] as const

function ToastDemo({
  variant,
  duration,
  withAction,
}: {
  variant: ToastVariant
  duration: number
  withAction: boolean
}) {
  const { toast } = useToast()
  return (
    <Button
      onClick={() =>
        toast({
          title: variant === 'danger' ? 'Could not save' : 'Request sent',
          description: 'Priya will be reminded on Friday.',
          variant,
          duration: duration > 0 ? duration * 1000 : Infinity,
          ...(withAction ? { action: { label: 'Undo', onClick: () => undefined } } : {}),
        })
      }
    >
      Show toast
    </Button>
  )
}

const requestColumns: DataTableColumn<SampleRequest>[] = [
  { id: 'title', header: 'Request', cell: (r) => r.title, sortValue: (r) => r.title },
  { id: 'person', header: 'From', cell: (r) => r.person, sortValue: (r) => r.person },
  {
    id: 'due',
    header: 'Due',
    cell: (r) => r.due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sortValue: (r) => r.due,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (r) => (
      <Badge
        variant={r.status === 'done' ? 'success' : r.status === 'overdue' ? 'danger' : 'accent'}
        dot
      >
        {r.status}
      </Badge>
    ),
    sortValue: (r) => r.status,
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (r) => (r.amount === null ? '-' : `$${r.amount.toLocaleString()}`),
    sortValue: (r) => r.amount,
  },
]

export const componentDocs: readonly ComponentDoc[] = [
  {
    slug: 'button',
    title: 'Button',
    description:
      'The primary action control. Four variants, three sizes, a loading state that keeps keyboard focus, and asChild for router links.',
    controls: [
      { name: 'variant', type: 'select', options: buttonVariants, default: 'primary' },
      { name: 'size', type: 'select', options: sizes, default: 'md' },
      { name: 'label', type: 'text', default: 'Send reminder' },
      { name: 'loading', type: 'boolean', default: false },
      { name: 'disabled', type: 'boolean', default: false },
      { name: 'withIcon', type: 'boolean', default: true },
      { name: 'fullWidth', type: 'boolean', default: false },
    ],
    render: (v) => (
      <Button
        variant={v.variant as ButtonVariant}
        size={v.size as ButtonSize}
        loading={Boolean(v.loading)}
        disabled={Boolean(v.disabled)}
        fullWidth={Boolean(v.fullWidth)}
        leftIcon={v.withIcon ? <PlusIcon size={18} /> : undefined}
      >
        {String(v.label)}
      </Button>
    ),
    a11y: [
      'Native <button type="button">: Enter and Space activate it.',
      'loading sets aria-busy + aria-disabled instead of disabled, so focus is not dropped mid-action; clicks are ignored.',
      'Icons are aria-hidden; the text is the accessible name.',
    ],
    usage: `<Button variant="primary" leftIcon={<PlusIcon />} onClick={save}>Save</Button>\n<Button asChild><Link to="/settings">Settings</Link></Button>`,
  },
  {
    slug: 'icon-button',
    title: 'IconButton',
    description:
      'Icon-only button. The label prop is required (it becomes aria-label) and can also show as a tooltip.',
    controls: [
      { name: 'variant', type: 'select', options: buttonVariants, default: 'ghost' },
      { name: 'size', type: 'select', options: sizes, default: 'md' },
      { name: 'round', type: 'boolean', default: false },
      { name: 'tooltip', type: 'boolean', default: true },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    render: (v) => (
      <IconButton
        label="Search requests"
        icon={<SearchIcon />}
        variant={v.variant as ButtonVariant}
        size={v.size as ButtonSize}
        round={Boolean(v.round)}
        tooltip={Boolean(v.tooltip)}
        disabled={Boolean(v.disabled)}
      />
    ),
    a11y: [
      '`label` is required by the type system; there is no way to ship an unnamed icon button.',
      'Tooltip opens on focus as well as hover.',
    ],
    usage: `<IconButton label="Delete" icon={<TrashIcon />} tooltip onClick={remove} />`,
  },
  {
    slug: 'input',
    title: 'Input',
    description:
      'Text input. Inside <Field> it is automatically labelled, described, and marked invalid.',
    controls: [
      { name: 'size', type: 'select', options: sizes, default: 'md' },
      { name: 'error', type: 'text', default: '' },
      { name: 'required', type: 'boolean', default: false },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    render: (v) => (
      <div style={{ width: '100%' }}>
        <Field
          label="Email"
          description="We only use it to send the sign-in link."
          error={String(v.error) || undefined}
          required={Boolean(v.required)}
          disabled={Boolean(v.disabled)}
        >
          <Input
            size={v.size as 'sm' | 'md' | 'lg'}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>
      </div>
    ),
    a11y: [
      'Label is tied by id (click the label to focus).',
      'Hint and error are linked via aria-describedby; errors use role="alert".',
      'Border is 3:1+ against the surface (tested in tokens).',
    ],
    usage: `<Field label="Email" description="..." error={errors.email}>\n  <Input type="email" />\n</Field>`,
  },
  {
    slug: 'textarea',
    title: 'Textarea',
    description: 'Multi-line input with the same Field wiring as Input.',
    controls: [
      { name: 'rows', type: 'number', default: 4, min: 2, max: 10 },
      { name: 'error', type: 'text', default: '' },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    render: (v) => (
      <div style={{ width: '100%' }}>
        <Field
          label="Notes"
          description="Visible to you only."
          error={String(v.error) || undefined}
          disabled={Boolean(v.disabled)}
        >
          <Textarea rows={Number(v.rows)} placeholder="What do you need back?" />
        </Field>
      </div>
    ),
    a11y: ['Same labelling and error semantics as Input.'],
    usage: `<Field label="Notes"><Textarea rows={5} /></Field>`,
  },
  {
    slug: 'select',
    title: 'Select',
    description:
      'A styled native <select>: correct mobile pickers, type-ahead and form participation for free.',
    controls: [
      { name: 'size', type: 'select', options: sizes, default: 'md' },
      { name: 'error', type: 'text', default: '' },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    render: (v) => (
      <div style={{ width: '100%' }}>
        <Field
          label="Reminder cadence"
          error={String(v.error) || undefined}
          disabled={Boolean(v.disabled)}
        >
          <Select
            size={v.size as 'sm' | 'md' | 'lg'}
            placeholder="Choose a cadence"
            defaultValue=""
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
      </div>
    ),
    a11y: [
      'Native element: screen readers, voice control and mobile OS pickers all work without ARIA.',
    ],
    usage: `<Field label="Plan"><Select placeholder="Choose..."><option value="free">Free</option></Select></Field>`,
  },
  {
    slug: 'checkbox',
    title: 'Checkbox',
    description: 'Radix checkbox with label, optional description and an indeterminate state.',
    controls: [
      {
        name: 'state',
        type: 'select',
        options: ['unchecked', 'checked', 'indeterminate'],
        default: 'unchecked',
      },
      { name: 'description', type: 'boolean', default: true },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    render: (v) => (
      <Checkbox
        key={String(v.state)}
        label="Remind me by email"
        description={v.description ? 'Sent the morning a request is due.' : undefined}
        defaultChecked={v.state === 'indeterminate' ? 'indeterminate' : v.state === 'checked'}
        disabled={Boolean(v.disabled)}
      />
    ),
    a11y: [
      'role="checkbox" with aria-checked true/false/mixed; Space toggles.',
      'Clicking the label toggles it; the description is linked via aria-describedby.',
    ],
    usage: `<Checkbox label="Accept terms" onCheckedChange={setAccepted} />`,
  },
  {
    slug: 'switch',
    title: 'Switch',
    description: 'Immediate on/off setting (role="switch").',
    controls: [
      { name: 'description', type: 'boolean', default: true },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    render: (v) => (
      <Switch
        label="Weekly digest"
        description={v.description ? 'Every Monday, 8am.' : undefined}
        disabled={Boolean(v.disabled)}
      />
    ),
    a11y: [
      'Announced as a switch with on/off state; Space and Enter toggle it.',
      'State is not conveyed by color alone: thumb position moves.',
    ],
    usage: `<Switch label="Dark mode" checked={on} onCheckedChange={setOn} />`,
  },
  {
    slug: 'field',
    title: 'Field, Label, FieldError',
    description:
      'Wires label, hint and error text to a control by id. Use it around Input, Textarea and Select.',
    controls: [
      { name: 'label', type: 'text', default: 'Display name' },
      { name: 'description', type: 'text', default: 'Shown to people you send requests to.' },
      { name: 'error', type: 'text', default: 'Name must be at least 2 characters.' },
      { name: 'required', type: 'boolean', default: true },
      { name: 'hideLabel', type: 'boolean', default: false },
    ],
    render: (v) => (
      <div style={{ width: '100%' }}>
        <Field
          label={String(v.label)}
          description={String(v.description) || undefined}
          error={String(v.error) || undefined}
          required={Boolean(v.required)}
          hideLabel={Boolean(v.hideLabel)}
        >
          <Input defaultValue="A" />
        </Field>
      </div>
    ),
    a11y: [
      '`error` flips aria-invalid on the control and announces the message (role="alert").',
      'hideLabel keeps the label for assistive tech only.',
    ],
    usage: `<Field label="Name" required error={error}><Input /></Field>`,
  },
  {
    slug: 'card',
    title: 'Card',
    description:
      'Surface for grouped content. Compose Header / Title / Description / Content / Footer.',
    controls: [
      { name: 'variant', type: 'select', options: ['outlined', 'elevated'], default: 'outlined' },
      { name: 'interactive', type: 'boolean', default: false },
    ],
    render: (v) => (
      <Card
        variant={v.variant as 'outlined' | 'elevated'}
        interactive={Boolean(v.interactive)}
        style={{ width: '100%' }}
      >
        <CardHeader>
          <CardTitle>Quarterly filing</CardTitle>
          <CardDescription>Waiting on 3 people</CardDescription>
        </CardHeader>
        <CardContent>
          Marcus has not replied since Nov 12. A reminder goes out tomorrow.
        </CardContent>
        <CardFooter>
          <Button size="sm">Remind now</Button>
          <Button size="sm" variant="ghost">
            Snooze
          </Button>
        </CardFooter>
      </Card>
    ),
    a11y: [
      'CardTitle renders a real heading; choose the level with `as` to keep the page outline correct.',
      '`interactive` is styling only: put the real link/button inside.',
    ],
    usage: `<Card><CardHeader><CardTitle as="h2">Title</CardTitle></CardHeader><CardContent>...</CardContent></Card>`,
  },
  {
    slug: 'badge',
    title: 'Badge',
    description:
      'Compact status label. Meaning always comes from the text, never from color alone.',
    controls: [
      { name: 'variant', type: 'select', options: badgeVariants, default: 'accent' },
      { name: 'dot', type: 'boolean', default: true },
      { name: 'label', type: 'text', default: 'Waiting' },
    ],
    render: (v) => (
      <Badge variant={v.variant as BadgeVariant} dot={Boolean(v.dot)}>
        {String(v.label)}
      </Badge>
    ),
    a11y: ['All variant text/background pairs meet 4.5:1 in both themes (tokens test).'],
    usage: `<Badge variant="danger" dot>Overdue</Badge>`,
  },
  {
    slug: 'tabs',
    title: 'Tabs',
    description: 'Accessible tab list with roving focus, built on Radix Tabs.',
    block: true,
    controls: [],
    render: () => (
      <Tabs defaultValue="open">
        <TabsList aria-label="Request status">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="archived" disabled>
            Archived
          </TabsTrigger>
        </TabsList>
        <TabsContent value="open">3 requests are waiting on a reply.</TabsContent>
        <TabsContent value="done">12 requests were completed this quarter.</TabsContent>
      </Tabs>
    ),
    a11y: [
      'Arrow keys move between tabs, Home/End jump, Tab moves into the panel.',
      'Disabled tabs are skipped.',
    ],
    usage: `<Tabs defaultValue="a"><TabsList aria-label="..."><TabsTrigger value="a">A</TabsTrigger></TabsList><TabsContent value="a">...</TabsContent></Tabs>`,
  },
  {
    slug: 'dialog',
    title: 'Dialog',
    description:
      'Modal dialog with required title, optional description, footer actions, and focus management.',
    controls: [
      { name: 'size', type: 'select', options: sizes, default: 'md' },
      { name: 'dismissible', type: 'boolean', default: true },
    ],
    render: (v) => (
      <Dialog
        size={v.size as 'sm' | 'md' | 'lg'}
        dismissible={Boolean(v.dismissible)}
        trigger={<Button variant="secondary">Open dialog</Button>}
        title="Cancel this request?"
        description="Marcus will not be reminded again. You can recreate it later."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Keep it</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger">Cancel request</Button>
            </DialogClose>
          </>
        }
      />
    ),
    a11y: [
      'role="dialog" aria-modal, named by the title and described by the description.',
      'Focus moves in, is trapped, Escape closes, and focus returns to the trigger.',
      'Overlay content renders in the preview panel so it shows that panel’s theme.',
    ],
    usage: `<Dialog trigger={<Button>Open</Button>} title="Title" description="..." footer={<DialogClose asChild><Button>Done</Button></DialogClose>}>...</Dialog>`,
  },
  {
    slug: 'toast',
    title: 'Toast',
    description:
      'Non-blocking notifications via useToast(). Mount ToastProvider once near the root.',
    controls: [
      { name: 'variant', type: 'select', options: toastVariants, default: 'success' },
      {
        name: 'duration',
        label: 'duration (s, 0 = sticky)',
        type: 'number',
        default: 5,
        min: 0,
        max: 30,
      },
      { name: 'withAction', type: 'boolean', default: true },
    ],
    render: (v) => (
      <ToastProvider>
        <ToastDemo
          variant={v.variant as ToastVariant}
          duration={Number(v.duration)}
          withAction={Boolean(v.withAction)}
        />
      </ToastProvider>
    ),
    a11y: [
      'Announced politely via a live region; F8 jumps to the notifications region.',
      'Pauses on hover/focus, swipe or the close button dismisses.',
      'Do not use for information the user must act on: use a Dialog or inline message.',
    ],
    usage: `const { toast } = useToast()\ntoast({ title: 'Saved', variant: 'success' })`,
  },
  {
    slug: 'tooltip',
    title: 'Tooltip',
    description: 'Supplementary label for a control, shown on hover and on keyboard focus.',
    controls: [
      { name: 'side', type: 'select', options: ['top', 'right', 'bottom', 'left'], default: 'top' },
    ],
    render: (v) => (
      <Tooltip content="Archive this request" side={v.side as 'top' | 'right' | 'bottom' | 'left'}>
        <Button variant="secondary">Hover or focus me</Button>
      </Tooltip>
    ),
    a11y: [
      'Opens on focus, closes on Escape; wired with aria-describedby.',
      'Never put essential or interactive content in a tooltip.',
    ],
    usage: `<Tooltip content="Archive"><Button>Archive</Button></Tooltip>`,
  },
  {
    slug: 'skeleton',
    title: 'Skeleton',
    description: 'Loading placeholder with a shimmer that stops under prefers-reduced-motion.',
    controls: [{ name: 'circle', type: 'boolean', default: false }],
    render: (v) => (
      <div
        style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}
        aria-busy="true"
      >
        <Skeleton width={v.circle ? 48 : 120} height={48} circle={Boolean(v.circle)} />
        <div style={{ flex: 1, display: 'grid', gap: 8 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={12} />
        </div>
      </div>
    ),
    a11y: [
      'Decorative (aria-hidden). Mark the container aria-busy and/or include a Spinner label so loading is announced.',
    ],
    usage: `<Skeleton width="60%" height={16} />`,
  },
  {
    slug: 'spinner',
    title: 'Spinner',
    description: 'Inline progress indicator with a screen-reader label.',
    controls: [
      { name: 'size', type: 'number', default: 24, min: 12, max: 64 },
      { name: 'label', type: 'text', default: 'Loading requests' },
    ],
    render: (v) => <Spinner size={Number(v.size)} label={String(v.label)} />,
    a11y: [
      'role="status" with visually hidden label text; use `decorative` when nearby text already says it is busy.',
      'Rotation becomes a gentle pulse under prefers-reduced-motion.',
    ],
    usage: `<Spinner label="Saving" />`,
  },
  {
    slug: 'empty-state',
    title: 'EmptyState',
    description:
      'An invitation, not a dead end: what belongs here and the one thing to do next. Use an illustration for a page or main panel, an icon for a small card.',
    controls: [
      {
        name: 'art',
        label: 'illustration',
        type: 'select',
        options: ['none', 'icon', 'empty', 'search', 'letter', 'key', 'allClear', 'locked'],
        default: 'letter',
      },
      { name: 'action', type: 'boolean', default: true },
    ],
    render: (v) => (
      <EmptyState
        {...(v.art === 'icon'
          ? { icon: <InboxIcon size={24} /> }
          : v.art !== 'none'
            ? {
                illustration: <Illustration name={v.art as 'empty'} size={200} />,
              }
            : {})}
        title="Nothing is waiting on you"
        description="When someone owes you a reply, a document or money, it shows up here."
        action={
          v.action ? <Button leftIcon={<PlusIcon size={18} />}>New request</Button> : undefined
        }
        style={{ width: '100%' }}
      />
    ),
    a11y: [
      'Title is a real heading (h2 by default, configurable); the illustration or icon is hidden from AT.',
    ],
    usage: `<EmptyState illustration={<Illustration name="letter" />} title="No requests" description="..." action={<Button>New</Button>} />`,
  },
  {
    slug: 'data-table',
    title: 'DataTable',
    description:
      'Semantic, sortable table. Click or press Enter/Space on a header to sort; empty values always sort last.',
    block: true,
    controls: [
      { name: 'dense', type: 'boolean', default: false },
      { name: 'loading', type: 'boolean', default: false },
      { name: 'empty', type: 'boolean', default: false },
    ],
    render: (v) => (
      <DataTable
        caption="Open requests"
        showCaption
        columns={requestColumns}
        data={v.empty ? [] : sampleRequests}
        getRowId={(r) => r.id}
        dense={Boolean(v.dense)}
        loading={Boolean(v.loading)}
        defaultSort={{ columnId: 'due', direction: 'asc' }}
        emptyState={
          <EmptyState
            icon={<InboxIcon size={24} />}
            title="No requests"
            description="Nothing matches yet."
            headingAs="h3"
          />
        }
      />
    ),
    a11y: [
      'Real <table> with <caption>, scope="col" headers and aria-sort on sortable columns.',
      'Sortable headers contain a <button>: Tab to reach, Enter/Space to sort; the change is announced in a polite live region.',
      'The scroll region is focusable so keyboard users can scroll wide tables.',
    ],
    usage: `<DataTable caption="People" columns={cols} data={rows} getRowId={(r) => r.id} defaultSort={{ columnId: 'name', direction: 'asc' }} />`,
  },
  {
    slug: 'page-header',
    title: 'PageHeader',
    description:
      'Page title block: eyebrow, h1, description and actions that wrap on narrow screens.',
    block: true,
    controls: [{ name: 'actions', type: 'boolean', default: true }],
    render: (v) => (
      <PageHeader
        eyebrow="Waiting On"
        title="Open requests"
        description="Everything people still owe you, oldest first."
        actions={
          v.actions ? <Button leftIcon={<PlusIcon size={18} />}>New request</Button> : undefined
        }
      />
    ),
    a11y: ['Renders the single <h1> for the page.'],
    usage: `<PageHeader title="Requests" description="..." actions={<Button>New</Button>} />`,
  },
  {
    slug: 'app-shell',
    title: 'AppShell',
    description:
      'Application frame: skip link, docked sidebar on wide screens, off-canvas drawer below 768px, sticky top bar, main landmark.',
    block: true,
    controls: [],
    render: () => (
      <p className="pg-muted">
        AppShell is full-page, so it is previewed on its own page: use the responsive preview below,
        or open the full signed-in demo.
      </p>
    ),
    a11y: [
      'Skip link is the first tab stop and jumps to <main>.',
      'Sidebar is a labelled <nav>; the current page uses aria-current="page".',
      'On mobile the drawer is a modal dialog: focus trapped, Escape closes, focus returns to the menu button; choosing a link closes it.',
    ],
    usage: `<AppShell brand="Waiting On" sidebar={<SidebarNav>...</SidebarNav>} topbar={<UserMenu />}>{children}</AppShell>`,
  },
  ...identityDocs,
]

/** Tiny AppShell used by the responsive preview iframe. */
export function PreviewShell() {
  return (
    <AppShell
      brand="Platform"
      topbar={<Badge variant="accent">preview</Badge>}
      sidebar={
        <SidebarNav label="Preview">
          <SidebarSection title="Workspace">
            <SidebarLink href="#/components/app-shell" active>
              Requests
            </SidebarLink>
            <SidebarLink href="#/components/app-shell">People</SidebarLink>
            <SidebarLink href="#/components/app-shell">Settings</SidebarLink>
          </SidebarSection>
        </SidebarNav>
      }
    >
      <PageHeader title="Responsive shell" description="Narrow the frame to see the drawer." />
    </AppShell>
  )
}

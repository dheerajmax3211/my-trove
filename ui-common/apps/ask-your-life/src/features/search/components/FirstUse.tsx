import { Button, ClockIcon, IllustrationLocked, PlusIcon, SearchIcon, Timeline } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'

const STEPS = [
  {
    id: 'add',
    title: 'Add something',
    description: 'Paste a note, or upload a text, Markdown or HTML file.',
    icon: <PlusIcon size={14} />,
    tone: 'accent' as const,
  },
  {
    id: 'wait',
    title: 'Wait a few seconds',
    description: 'It is indexed so you can search by your exact words or by similar wording.',
    icon: <ClockIcon size={14} />,
  },
  {
    id: 'ask',
    title: 'Ask in your own words',
    description: 'For example, "how much was the deposit?"',
    icon: <SearchIcon size={14} />,
    tone: 'success' as const,
  },
]

/** Shown when the library is empty: what this is, the privacy promise, and the first note to add. */
export function FirstUse() {
  return (
    <section className="ayl-firstuse" aria-labelledby="firstuse-heading">
      <div className="ayl-firstuse-art" aria-hidden="true">
        <IllustrationLocked size={220} />
      </div>
      <div className="ayl-firstuse-body">
        <h2 id="firstuse-heading" className="ayl-firstuse-title">
          Only you can see this
        </h2>
        <p className="ayl-firstuse-lede">
          Everything you add here is private to your account. Search only ever looks at your own
          notes, documents and receipts, and nobody else can read, search or see them.
        </p>
        <Timeline label="How it works" items={STEPS} />
        <Button asChild>
          <ModuleLink to="/add">Add your first note</ModuleLink>
        </Button>
      </div>
    </section>
  )
}

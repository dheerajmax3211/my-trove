import {
  ClockIcon,
  PageHeader,
  PlusIcon,
  SearchIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Timeline,
} from '@platform/ui'
import { useRef, useState } from 'react'
import { AddNoteForm } from '../components/AddNoteForm'
import { TrackedDocument, type TrackedItem } from '../components/TrackedDocument'
import { UploadForm } from '../components/UploadForm'
import type { IngestResponse } from '../api/types'

const AFTER_SAVING = [
  {
    id: 'save',
    title: 'You save it',
    description: 'The text is stored in your account and nowhere else.',
    icon: <PlusIcon size={14} />,
    tone: 'accent' as const,
  },
  {
    id: 'index',
    title: 'We index it',
    description: 'It is split into passages so search can match words and meaning. A few seconds.',
    icon: <ClockIcon size={14} />,
  },
  {
    id: 'ask',
    title: 'You can ask about it',
    description: 'Search shows the matching passage and why it matched.',
    icon: <SearchIcon size={14} />,
    tone: 'success' as const,
  },
]

export function AddPage() {
  const [tab, setTab] = useState('note')
  const [tracked, setTracked] = useState<TrackedItem[]>([])
  const counter = useRef(0)

  const onAdded = ({ outcome, document }: IngestResponse) =>
    setTracked((items) => [{ key: `add-${(counter.current += 1)}`, outcome, document }, ...items])

  return (
    <>
      <PageHeader
        title="Add content"
        description="Paste a note or drop a file. It stays private to you and becomes searchable once it has been indexed."
      />
      <div className="ayl-add">
        <div className="ayl-card ayl-add-main">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="How to add">
              <TabsTrigger value="note">Paste a note</TabsTrigger>
              <TabsTrigger value="file">Upload a file</TabsTrigger>
            </TabsList>
            <TabsContent value="note" forceMount hidden={tab !== 'note'}>
              <AddNoteForm onAdded={onAdded} />
            </TabsContent>
            <TabsContent value="file" forceMount hidden={tab !== 'file'}>
              <UploadForm onAdded={onAdded} />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="ayl-add-aside" aria-label="About adding content">
          {tracked.length > 0 ? (
            <section
              aria-labelledby="recent-heading"
              className="ayl-card ayl-card-dark"
              data-surface="vault"
            >
              <h2 id="recent-heading" className="ayl-h2">
                Added this session
              </h2>
              <ul className="ayl-tracked-list">
                {tracked.map((item) => (
                  <TrackedDocument key={item.key} item={item} />
                ))}
              </ul>
            </section>
          ) : null}
          <section className="ayl-card" aria-labelledby="next-heading">
            <h2 id="next-heading" className="ayl-h2">
              What happens next
            </h2>
            <Timeline label="What happens after you save" items={AFTER_SAVING} compact />
          </section>
          <section className="ayl-card ayl-card-lilac" aria-labelledby="know-heading">
            <h2 id="know-heading" className="ayl-h2">
              Good to know
            </h2>
            <ul className="ayl-notes">
              <li>Nobody else can read or search what you add here.</li>
              <li>Adding identical content twice does not save a second copy.</li>
              <li>PDFs and other binary files are not supported yet.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}

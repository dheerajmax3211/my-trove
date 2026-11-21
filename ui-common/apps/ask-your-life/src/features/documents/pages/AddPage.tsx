import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@platform/ui'
import { useRef, useState } from 'react'
import { AddNoteForm } from '../components/AddNoteForm'
import { TrackedDocument, type TrackedItem } from '../components/TrackedDocument'
import { UploadForm } from '../components/UploadForm'
import type { IngestResponse } from '../api/types'

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
        description="Paste a note or upload a file. It stays private to you and becomes searchable once it has been indexed."
      />
      <div className="ayl-stack">
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
        {tracked.length > 0 ? (
          <section aria-labelledby="recent-heading">
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
      </div>
    </>
  )
}

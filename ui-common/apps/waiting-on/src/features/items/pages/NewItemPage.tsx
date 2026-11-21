import { PageHeader, useToast } from '@platform/ui'
import { ModuleLink, useModuleNavigate } from '@platform/workspace-kit'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ItemForm } from '../components/ItemForm'

export function NewItemPage() {
  usePageTitle('Add something')
  const navigate = useModuleNavigate()
  const { toast } = useToast()
  return (
    <>
      <PageHeader
        eyebrow={<ModuleLink to="/">Back to waiting list</ModuleLink>}
        title="Add something you are waiting for"
        description="Say what is owed, who owes it and when you expected it. Waiting On sets up the follow-ups from that date."
      />
      <div className="wo-page">
        <ItemForm
          onCreated={(item) => {
            toast({
              title: 'Now tracking it',
              description: `We will follow up with ${item.counterparty} for you.`,
              variant: 'success',
            })
            navigate(`/items/${item.id}`)
          }}
        />
      </div>
    </>
  )
}

import { PageHeader, useToast } from '@platform/ui'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ItemForm } from '../components/ItemForm'

export function NewItemPage() {
  usePageTitle('Add item')
  const navigate = useNavigate()
  const { toast } = useToast()
  return (
    <>
      <PageHeader
        eyebrow={<Link to="/">Back to waiting list</Link>}
        title="Add something you are waiting for"
        description="Tell us what is owed and when you expected it. We will set up the follow-ups."
      />
      <div className="wo-page">
        <ItemForm
          onCreated={(item) => {
            toast({
              title: 'Now tracking it',
              description: `We will follow up with ${item.counterparty} for you.`,
              variant: 'success',
            })
            void navigate(`/items/${item.id}`)
          }}
        />
      </div>
    </>
  )
}

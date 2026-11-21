import { Button, EmptyState, PageHeader } from '@platform/ui'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../../../lib/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <>
      <PageHeader title="Page not found" />
      <div className="wo-page">
        <EmptyState
          title="There is nothing at this address"
          description="Check the link, or head back to your waiting list."
          action={
            <Button asChild>
              <Link to="/">Go to your waiting list</Link>
            </Button>
          }
        />
      </div>
    </>
  )
}

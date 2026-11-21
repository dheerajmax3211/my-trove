import { Button, EmptyState, Illustration, PageHeader } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { usePageTitle } from '../../../lib/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <>
      <PageHeader title="Page not found" />
      <div className="wo-page">
        <EmptyState
          illustration={<Illustration name="search" />}
          title="There is nothing at this address"
          description="Check the link, or head back to your waiting list."
          action={
            <Button asChild>
              <ModuleLink to="/">Go to your waiting list</ModuleLink>
            </Button>
          }
        />
      </div>
    </>
  )
}

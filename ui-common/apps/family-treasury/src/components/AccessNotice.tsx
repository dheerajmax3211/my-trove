import { Button, EmptyState } from '@platform/ui'
import { Link } from 'react-router-dom'

/** Shown when a route exists but the person's role does not allow it. Says why and where to go instead. */
export function AccessNotice({ what, to }: { what: string; to: string }) {
  return (
    <EmptyState
      title="Not available for your role"
      description={`${what} is only available to people with a different role in this household.`}
      action={
        <Button asChild variant="secondary">
          <Link to={to}>Back to the dashboard</Link>
        </Button>
      }
    />
  )
}

import { useApiMutation } from '@platform/api-client'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from '@platform/ui'
import { ownerPaths } from '../../api/paths'
import type { StateView } from '../../api/types'
import { ErrorNotice } from '../../components/ErrorNotice'
import { formatDateTime } from '../../lib/format'
import { OWNER_KEYS } from '../queries'

/** The one-tap "I'm here". Works from every state except RELEASED. */
export function CheckInCard({ state }: { state: StateView }) {
  const { toast } = useToast()
  const checkIn = useApiMutation<StateView>({
    path: ownerPaths.checkIn,
    invalidate: OWNER_KEYS,
    onSuccess: (next) =>
      toast({
        title: 'Checked in',
        description: next.armed
          ? `Your next check-in is due ${formatDateTime(next.nextDueAt)}.`
          : 'The switch is not armed yet, so this is just recorded.',
        variant: 'success',
      }),
  })
  const released = state.state === 'RELEASED'
  return (
    <Card aria-labelledby="checkin-title">
      <CardHeader>
        <CardTitle as="h2" id="checkin-title">
          Check in
        </CardTitle>
        <CardDescription>
          {released
            ? 'The vault has already been released, so a check-in can no longer cancel anything.'
            : 'Tell the switch you are fine. It resets every timer and voids any trustee approvals.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="checkin-card">
          <Button
            size="lg"
            fullWidth
            className="checkin-button"
            disabled={released}
            loading={checkIn.isPending}
            onClick={() => checkIn.mutate()}
          >
            I&apos;m here
          </Button>
          {checkIn.error ? <ErrorNotice error={checkIn.error} title="Could not check in" /> : null}
        </div>
      </CardContent>
    </Card>
  )
}

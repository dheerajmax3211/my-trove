import { usePeople } from '../../../core/people'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from '@platform/ui'
import { useState } from 'react'
import { useModuleNavigate } from '@platform/workspace-kit'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useDeleteHousehold, useLeaveHousehold } from '../hooks'
import { canLeave } from '../rules'
import type { HouseholdDetail } from '../types'

export function DangerZone({ household }: { household: HouseholdDetail }) {
  const { selfUid } = usePeople()
  const { toast } = useToast()
  const navigate = useModuleNavigate()
  const leave = useLeaveHousehold(household.id)
  const remove = useDeleteHousehold(household.id)
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const leaveRule = canLeave(household.members, selfUid ?? '')

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Leave or delete</CardTitle>
        <CardDescription>These actions cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hub-stack">
          <div className="hub-stack-sm">
            <div>
              <Button
                variant="secondary"
                disabled={!leaveRule.allowed}
                aria-describedby={leaveRule.allowed ? undefined : 'leave-rule'}
                onClick={() => setLeaving(true)}
              >
                Leave household
              </Button>
            </div>
            <p id="leave-rule" className="hub-muted">
              {leaveRule.reason ??
                'You will lose access to its reminders, files and activity. An owner can invite you back.'}
            </p>
          </div>
          {household.callerRole === 'OWNER' ? (
            <div className="hub-stack-sm">
              <div>
                <Button variant="danger" onClick={() => setDeleting(true)}>
                  Delete household
                </Button>
              </div>
              <p className="hub-muted">
                Deletes the household for everyone, with its reminders, files and invites. Its
                activity history is kept.
              </p>
            </div>
          ) : null}
        </div>
      </CardContent>

      <ConfirmDialog
        open={leaving}
        onOpenChange={(open) => {
          setLeaving(open)
          if (!open) leave.reset()
        }}
        title={`Leave ${household.name}?`}
        description="You will lose access to its reminders, files and activity."
        confirmLabel="Leave household"
        pending={leave.isPending}
        error={leave.error}
        onConfirm={() =>
          leave.mutate(undefined, {
            onSuccess: () => {
              toast({ title: `You left ${household.name}`, variant: 'success' })
              void navigate('/households')
            },
          })
        }
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={(open) => {
          setDeleting(open)
          if (!open) remove.reset()
        }}
        title={`Delete ${household.name}?`}
        description="This removes the household, its reminders, files and invites for every member. It cannot be undone."
        confirmLabel="Delete household"
        confirmPhrase={household.name}
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast({ title: 'Household deleted', description: household.name, variant: 'success' })
              void navigate('/households')
            },
          })
        }
      />
    </Card>
  )
}

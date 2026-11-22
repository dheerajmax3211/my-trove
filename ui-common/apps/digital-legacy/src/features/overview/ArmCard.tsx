import { useApiMutation } from '@platform/api-client'
import { BentoCard, Button, Dialog, DialogClose, ShieldIcon, useToast } from '@platform/ui'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { ModuleLink } from '@platform/workspace-kit'
import { ownerPaths } from '../../api/paths'
import type { StateView } from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { OWNER_KEYS } from '../queries'

export function ArmCard({
  state,
  className,
  style,
}: {
  state: StateView
  className?: string
  style?: CSSProperties
}) {
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const arm = useApiMutation<StateView>({
    path: ownerPaths.arm,
    invalidate: OWNER_KEYS,
    onSuccess: () =>
      toast({
        title: 'Switch armed',
        description: 'The countdown to your first check-in has started.',
        variant: 'success',
      }),
  })
  const disarm = useApiMutation<StateView>({
    path: ownerPaths.disarm,
    invalidate: OWNER_KEYS,
    onSuccess: () => {
      setConfirmOpen(false)
      toast({ title: 'Switch disarmed', description: 'All timers stopped.', variant: 'success' })
    },
  })
  const released = state.state === 'RELEASED'

  return (
    <BentoCard
      span={5}
      title="Arm or disarm"
      icon={<ShieldIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="stack-3">
        <p className="small muted" style={{ margin: 0 }}>
          {state.armed
            ? 'The switch is armed: missing a check-in starts the process that can release your vault.'
            : 'While disarmed the switch does nothing. Arm it once your vault, trustees and policy are ready.'}
        </p>
        <div className="stack-3">
          {!state.armed && !state.readiness.armable ? (
            <Callout tone="warning" title="Not ready to arm yet">
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {state.readiness.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <p>
                Fix this on the <ModuleLink to="/trustees">Trustees</ModuleLink> and{' '}
                <ModuleLink to="/policy">Check-in policy</ModuleLink> pages.
              </p>
            </Callout>
          ) : null}
          {state.armed ? (
            <Dialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Disarm the switch?"
              description="Disarming stops every timer and cancels any release in progress. Trustees keep their sealed shares. You can arm again later."
              trigger={
                <Button variant="danger" disabled={released}>
                  Disarm
                </Button>
              }
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="secondary">Keep it armed</Button>
                  </DialogClose>
                  <Button
                    variant="danger"
                    loading={disarm.isPending}
                    onClick={() => disarm.mutate()}
                  >
                    Disarm the switch
                  </Button>
                </>
              }
            >
              {disarm.error ? <ErrorNotice error={disarm.error} title="Could not disarm" /> : null}
            </Dialog>
          ) : (
            <Button
              loading={arm.isPending}
              disabled={!state.readiness.armable || released}
              onClick={() => arm.mutate()}
            >
              Arm the switch
            </Button>
          )}
          {arm.error ? <ErrorNotice error={arm.error} title="Could not arm" /> : null}
        </div>
      </div>
    </BentoCard>
  )
}

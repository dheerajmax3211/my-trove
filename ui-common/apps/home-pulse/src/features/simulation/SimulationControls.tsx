import { Badge, BentoCard, Button, SparkleIcon, useToast } from '@platform/ui'
import { errorMessage } from '../../lib/errors'
import type { Slot } from '../appliances/components/slot'
import { useStartSimulation, useStopSimulation } from './hooks'

/** The label that goes next to anything made from simulated readings. */
export function SimulatedBadge() {
  return (
    <Badge variant="info" title="These readings come from the built-in simulator, not a real plug.">
      Simulated
    </Badge>
  )
}

/** "No hardware?" call to action for an appliance without a device. */
export function SimulatePlugButton({
  applianceId,
  size = 'md',
}: {
  applianceId: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const { toast } = useToast()
  const start = useStartSimulation(applianceId)
  return (
    <>
      <Button
        size={size}
        variant="secondary"
        loading={start.isPending}
        leftIcon={<SparkleIcon size={18} />}
        onClick={() =>
          start.mutate(
            { days: 7, scenario: 'NORMAL' },
            {
              onSuccess: () =>
                toast({
                  title: 'Simulated plug added',
                  description:
                    'A week of simulated readings is in. Everything it makes is labelled Simulated.',
                  variant: 'success',
                }),
            },
          )
        }
      >
        No hardware? Simulate a plug
      </Button>
      {start.error ? (
        <p role="alert" className="hp-form-error">
          {errorMessage(start.error)}
        </p>
      ) : null}
    </>
  )
}

/** Shown while an appliance runs on simulated data: spike it to see an alert, or remove the simulation. */
export function SimulationCard({ applianceId, className, style }: { applianceId: string } & Slot) {
  const { toast } = useToast()
  const start = useStartSimulation(applianceId)
  const stop = useStopSimulation(applianceId)
  const error = start.error ?? stop.error
  return (
    <BentoCard
      span={12}
      title="Simulated plug"
      icon={<SparkleIcon size={18} />}
      actions={<SimulatedBadge />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="hp-stack-3">
        <p className="hp-small">
          This appliance runs on a built-in simulated plug: a week of invented readings that went
          through the same pipeline as a real one. Nothing here was measured. Connect a real device
          when you have one; remove the simulation first.
        </p>
        {error ? (
          <p role="alert" className="hp-form-error">
            {errorMessage(error)}
          </p>
        ) : null}
        <div className="hp-button-row">
          <Button
            variant="secondary"
            loading={start.isPending}
            onClick={() =>
              start.mutate(
                { days: 7, scenario: 'ANOMALY' },
                {
                  onSuccess: (result) =>
                    toast({
                      title: result.alertOpened ? 'Spike added: an alert opened' : 'Spike added',
                      variant: 'success',
                    }),
                },
              )
            }
          >
            Add a spike
          </Button>
          <Button
            variant="secondary"
            loading={stop.isPending}
            onClick={() =>
              stop.mutate(undefined, {
                onSuccess: () =>
                  toast({
                    title: 'Simulation removed',
                    description: 'The simulated readings and alerts are gone.',
                    variant: 'success',
                  }),
              })
            }
          >
            Remove the simulation
          </Button>
        </div>
      </div>
    </BentoCard>
  )
}

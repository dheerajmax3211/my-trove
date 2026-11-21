import { Button, Stepper, type StepperStep } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { BaselineDiagram } from './BaselineDiagram'

const STEPS: StepperStep[] = [
  {
    id: 'add',
    label: 'Add the appliance',
    description: 'Name it and say what it is: a fridge, an air conditioner, a pump.',
  },
  {
    id: 'connect',
    label: 'Register a smart plug',
    description:
      'Put a smart plug or sensor on it. Register it here and we give you a one-time token for the device to send readings with.',
  },
  {
    id: 'learn',
    label: 'Let it learn for about a week',
    description:
      'Home Pulse watches how much power the appliance draws and how it switches on and off. That pattern becomes its baseline: what normal looks like for this one appliance.',
  },
  {
    id: 'alert',
    label: 'Get told when it drifts',
    description:
      'When it draws more than usual, runs non-stop or goes quiet, you get an alert that says what changed and what to check.',
  },
]

/** The first-run home: what the product does, how a plug turns into a baseline, and the one thing to do next. */
export function FirstRun() {
  return (
    <section className="hp-firstrun" aria-labelledby="hp-firstrun-title">
      <div className="hp-firstrun-copy">
        <h2 id="hp-firstrun-title" className="hp-firstrun-title">
          Add your first appliance
        </h2>
        <p className="hp-firstrun-lead">
          Home Pulse learns what normal looks like for each appliance and warns you before it fails.
          It needs a smart plug that reports power, one per appliance.
        </p>
        <Stepper
          orientation="vertical"
          label="How Home Pulse works"
          steps={STEPS}
          current={0}
          className="hp-firstrun-steps"
        />
        <div className="hp-button-row">
          <Button size="lg" asChild>
            <ModuleLink to="/appliances/new">Add an appliance</ModuleLink>
          </Button>
        </div>
      </div>
      <figure className="hp-firstrun-figure">
        <BaselineDiagram />
        <figcaption>
          A fridge draws power in cycles. The shaded band is what Home Pulse learned as normal. When
          the cycles climb out of it, you get an alert.
        </figcaption>
      </figure>
    </section>
  )
}

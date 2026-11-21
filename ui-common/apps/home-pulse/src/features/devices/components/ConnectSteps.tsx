import { Stepper, type StepperStep } from '@platform/ui'

const STEPS: StepperStep[] = [
  { id: 'appliance', label: 'Choose the appliance' },
  { id: 'name', label: 'Name the device' },
  { id: 'token', label: 'Copy the token' },
  { id: 'reading', label: 'First reading arrives' },
]

export type ConnectStep = 'appliance' | 'name' | 'token' | 'reading'

/** The same four steps in every part of connecting a device, so a person always knows where they are. */
export function ConnectSteps({ at }: { at: ConnectStep }) {
  return (
    <Stepper
      label="Connecting a device"
      steps={STEPS}
      current={STEPS.findIndex((s) => s.id === at)}
      className="hp-connect-steps"
    />
  )
}

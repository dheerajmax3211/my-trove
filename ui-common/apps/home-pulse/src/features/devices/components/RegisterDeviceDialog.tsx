import { Button, Dialog, DialogClose, Field, Input, Select } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { errorMessage, fieldErrorsFrom } from '../../../lib/errors'
import type { Appliance } from '../../appliances/types'
import { useRegisterDevice } from '../hooks'
import type { RegisteredDevice } from '../types'

export interface RegisterDeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appliances: readonly Appliance[]
  /** Appliances that already have an active device (the service allows one per appliance). */
  occupied: ReadonlySet<string>
  defaultApplianceId?: string
  onRegistered: (registered: RegisteredDevice) => void
}

export function RegisterDeviceDialog({
  open,
  onOpenChange,
  appliances,
  occupied,
  defaultApplianceId,
  onRegistered,
}: RegisterDeviceDialogProps) {
  const free = appliances.filter((a) => !occupied.has(a.id))
  const [chosen, setChosen] = useState('')
  // A preselected appliance applies until the person picks another, and only while it is still free.
  const applianceId =
    chosen || (defaultApplianceId && !occupied.has(defaultApplianceId) ? defaultApplianceId : '')
  const [label, setLabel] = useState('')
  const [problem, setProblem] = useState<{ appliance?: string; label?: string }>({})
  const register = useRegisterDevice(applianceId)

  const serverLabelError = register.error
    ? fieldErrorsFrom(register.error, ['label']).label
    : undefined

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = {
      ...(applianceId ? {} : { appliance: 'Choose the appliance this device is attached to.' }),
      ...(label.trim() ? {} : { label: 'Give the device a name you will recognise.' }),
    }
    setProblem(found)
    if (Object.keys(found).length > 0) return
    register.mutate(label.trim(), {
      onSuccess: (registered) => {
        onRegistered(registered)
        register.reset()
        setLabel('')
        onOpenChange(false)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Register a device"
      description="A device is the smart plug or sensor that measures one appliance. You get a one-time token for it."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={register.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="register-device-form" loading={register.isPending}>
            Register device
          </Button>
        </>
      }
    >
      <form id="register-device-form" className="hp-stack-4" onSubmit={submit} noValidate>
        {register.error && !serverLabelError ? (
          <p role="alert" className="hp-form-error">
            {errorMessage(register.error)}
          </p>
        ) : null}
        <Field
          label="Appliance"
          required
          error={problem.appliance}
          description={
            free.length < appliances.length
              ? 'Appliances that already have an active device are left out. Revoke it first to replace it.'
              : undefined
          }
        >
          <Select
            placeholder="Choose an appliance"
            value={applianceId}
            onChange={(e) => setChosen(e.target.value)}
          >
            {free.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Device name" required error={problem.label ?? serverLabelError}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Smart plug behind the fridge"
            autoComplete="off"
          />
        </Field>
      </form>
    </Dialog>
  )
}

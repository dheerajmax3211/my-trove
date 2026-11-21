import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  useToast,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useGuardedMutation } from '../../../api/hooks'
import type { HouseholdView, UpdateSettingsRequest } from '../../../api/types'
import { AmountField } from '../../../components/AmountField'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { parseAmount, toDecimalString } from '../../../lib/money'
import { useHousehold } from '../../household/hooks/useHousehold'

/** Owner-only: the approval limit and how long a request waits. */
export function SettingsCard() {
  const h = useHousehold()
  const { toast } = useToast()
  const limit = h.household.approvalThresholdMinor
  const [threshold, setThreshold] = useState(
    limit === null ? '' : toDecimalString(limit, h.currency),
  )
  const [hours, setHours] = useState(String(h.household.approvalExpiryHours))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutation, submit } = useGuardedMutation<HouseholdView, UpdateSettingsRequest>({
    run: (api, vars) => api.updateSettings(h.household.id, vars),
    householdId: h.household.id,
    onSuccess: () => toast({ title: 'Settings saved', variant: 'success' }),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    let thresholdMinor: number | null = null
    if (threshold.trim() !== '') {
      const parsed = parseAmount(threshold, h.currency)
      if (parsed.ok) thresholdMinor = parsed.minor
      else next.threshold = parsed.message
    }
    const expiry = Number(hours)
    if (!Number.isInteger(expiry) || expiry < 1 || expiry > 8760)
      next.hours = 'Enter a whole number of hours from 1 to 8760.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    submit({ approvalThresholdMinor: thresholdMinor, approvalExpiryHours: expiry })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Approval settings</CardTitle>
        <CardDescription>
          Spends strictly above the limit wait for a second person. Deposits and transfers are not
          affected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="ft-form" onSubmit={onSubmit} noValidate>
          <AmountField
            label="Approval limit"
            required={false}
            value={threshold}
            onChange={setThreshold}
            currency={h.currency}
            error={errors.threshold}
            description="Leave empty for no approvals."
          />
          <Field label="Requests expire after (hours)" required error={errors.hours}>
            <Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          {mutation.error ? <ErrorNotice error={mutation.error} /> : null}
          <div>
            <Button type="submit" loading={mutation.isPending}>
              Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useModuleNavigate } from '@platform/workspace-kit'
import { AmountField } from '../../../components/AmountField'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { useIdempotentMutation } from '../../../api/hooks'
import type { CreateHouseholdRequest, HouseholdView } from '../../../api/types'
import { describeError } from '../../../lib/errors'
import { parseAmount } from '../../../lib/money'
import { writeStored } from '../../../lib/storage'
import { ModuleBar } from '../components/ModuleBar'
import { LAST_HOUSEHOLD_KEY } from '../nav'

interface CreateVars {
  name: string
  currency: string
  thresholdMinor: number | null
  expiry: number
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY', 'CHF', 'SEK', 'NZD']

/** Create a household. Also what a brand-new user sees first. */
export function WelcomePage() {
  const navigate = useModuleNavigate()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [threshold, setThreshold] = useState('')
  const [hours, setHours] = useState('72')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { mutation, submit } = useIdempotentMutation<HouseholdView, CreateVars>({
    run: (api, vars, key) => api.createHousehold(buildRequest(vars), key),
    refreshHouseholds: true,
    onSuccess: (household) => {
      writeStored(LAST_HOUSEHOLD_KEY, household.id)
      navigate(`/h/${household.id}`)
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim() === '') next.name = 'Give the household a name.'
    let thresholdMinor: number | null = null
    if (threshold.trim() !== '') {
      const parsed = parseAmount(threshold, currency)
      if (parsed.ok) thresholdMinor = parsed.minor
      else next.threshold = parsed.message
    }
    const expiry = Number(hours)
    if (!Number.isInteger(expiry) || expiry < 1 || expiry > 8760) {
      next.hours = 'Enter a whole number of hours from 1 to 8760.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    submit({ name: name.trim(), currency, thresholdMinor, expiry })
  }

  const serverError = mutation.error ? describeError(mutation.error) : null

  return (
    <>
      <ModuleBar currentHouseholdId={null} />
      <PageHeader
        title="Set up your household"
        description="A shared pool of money your family already holds, with a trustworthy record of every change."
      />
      <Card className="ft-narrow">
        <CardHeader>
          <CardTitle as="h2">New household</CardTitle>
          <CardDescription>
            You become the owner. You can add the others afterwards from Members and roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="ft-form" onSubmit={onSubmit} noValidate>
            <Field label="Household name" required error={errors.name ?? undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field
              label="Currency"
              description="Every account in the household uses this currency."
            >
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <AmountField
              label="Approval limit"
              required={false}
              value={threshold}
              onChange={setThreshold}
              currency={currency}
              error={errors.threshold}
              description="Spends above this need a second person to approve. Leave empty for no approvals."
            />
            <Field
              label="Approval expires after (hours)"
              required
              error={errors.hours}
              description="A pending request closes by itself after this long."
            >
              <Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            {serverError ? <ErrorNotice error={mutation.error} /> : null}
            <Button type="submit" loading={mutation.isPending}>
              Create household
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  )
}

function buildRequest(vars: CreateVars): CreateHouseholdRequest {
  return {
    name: vars.name,
    currency: vars.currency,
    approvalThresholdMinor: vars.thresholdMinor,
    approvalExpiryHours: vars.expiry,
  }
}

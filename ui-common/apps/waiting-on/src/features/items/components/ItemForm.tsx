import {
  Button,
  Field,
  Form,
  FormActions,
  FormGrid,
  FormSection,
  Input,
  Select,
  Switch,
} from '@platform/ui'
import { useRef, useState, type FormEvent } from 'react'
import { useClock } from '../../../lib/clock'
import { describeError, serverFieldErrors } from '../../../lib/errors'
import type { Item } from '../api/types'
import { ITEM_CATEGORIES } from '../api/types'
import { useCreateItem } from '../hooks/useItems'
import {
  CURRENCIES,
  daysUntil,
  effectivePlan,
  emptyValues,
  hasErrors,
  planToStrings,
  toCreateInput,
  validateNewItem,
  type FieldKey,
  type NewItemErrors,
  type NewItemValues,
} from '../logic/form'
import { defaultPlan } from '../logic/schedule'
import { CATEGORY_LABEL } from '../logic/labels'
import { SchedulePreview } from './SchedulePreview'

const PLAN_FIELDS = [
  ['nudgeAfterDays', 'Nudge on day', 'The first friendly reminder.'],
  ['escalateAfterDays', 'Escalate on day', 'The formal escalation letter.'],
  ['finalNoticeAfterDays', 'Final notice on day', 'Use 0 to skip the final notice.'],
  ['expireAfterDays', 'Expire on day', 'When to give up and close the item.'],
] as const

function omit(errors: NewItemErrors, key: string): NewItemErrors {
  const next = { ...errors }
  delete next[key as keyof NewItemErrors]
  return next
}

export function ItemForm({ onCreated }: { onCreated: (item: Item) => void }) {
  const clock = useClock()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<NewItemValues>(emptyValues)
  const [errors, setErrors] = useState<NewItemErrors>({})
  const create = useCreateItem()
  const serverErrors = serverFieldErrors(create.error).fields
  const fieldError = (key: FieldKey) => errors[key] ?? serverErrors[key]
  const planError = (key: keyof NonNullable<NewItemErrors['plan']>) =>
    errors.plan?.[key] ?? serverErrors[`plan.${key}`]

  const set = <K extends keyof NewItemValues>(key: K, value: NewItemValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    if (key in errors) setErrors((current) => omit(current, key))
  }

  const toggleCustomise = (on: boolean) => {
    if (on) {
      const days = daysUntil(values.expectedBy, clock())
      const base = effectivePlan({ ...values, customise: false }, clock())
      const start = base ?? defaultPlan(values.category || 'OTHER', days ?? 0)
      setValues((current) => ({ ...current, customise: true, plan: planToStrings(start) }))
    } else {
      setValues((current) => ({ ...current, customise: false }))
      setErrors((current) => omit(current, 'plan'))
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    create.reset()
    const found = validateNewItem(values)
    setErrors(found)
    if (hasErrors(found)) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }
    create.mutate(toCreateInput(values), { onSuccess: onCreated })
  }

  return (
    <div className="wo-form-layout">
      <Form
        ref={formRef}
        width="full"
        className="wo-form-col"
        onSubmit={onSubmit}
        aria-label="New waiting item"
      >
        <FormSection
          title="The item"
          description="Say what is owed and who owes it. The email is optional and only used to address your letters."
        >
          <Field
            label="What are you waiting for?"
            variant="floating"
            required
            error={fieldError('title')}
          >
            <Input
              value={values.title}
              maxLength={200}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <FormGrid>
            <Field
              label="Who are you waiting on?"
              variant="floating"
              required
              error={fieldError('counterparty')}
            >
              <Input
                value={values.counterparty}
                maxLength={200}
                onChange={(e) => set('counterparty', e.target.value)}
              />
            </Field>
            <Field
              label="Their email (optional)"
              variant="floating"
              error={fieldError('counterpartyEmail')}
            >
              <Input
                type="email"
                autoComplete="off"
                value={values.counterpartyEmail}
                onChange={(e) => set('counterpartyEmail', e.target.value)}
              />
            </Field>
          </FormGrid>
          <Field
            label="Category"
            required
            description="Sets the default schedule and the wording of your letters."
            error={fieldError('category')}
          >
            <Select
              placeholder="Choose a category"
              value={values.category}
              onChange={(e) => set('category', e.target.value as NewItemValues['category'])}
            >
              {ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        <FormSection
          title="What it is worth and when"
          description="The date they promised, or the date you reasonably expected it. Follow-ups are counted from it."
        >
          <FormGrid>
            <Field label="Amount" variant="floating" error={fieldError('amount')}>
              <Input
                inputMode="decimal"
                value={values.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </Field>
            <Field label="Currency" variant="floating" error={fieldError('currency')}>
              <Select value={values.currency} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <Field label="Expected by" required error={fieldError('expectedBy')}>
            <Input
              type="date"
              value={values.expectedBy}
              onChange={(e) => set('expectedBy', e.target.value)}
            />
          </Field>
        </FormSection>

        <FormSection
          title="Follow-up schedule"
          description="The defaults suit most items. Change the days if you want to chase sooner or later."
        >
          <Switch
            label="Customise the follow-up schedule"
            description="Optional."
            checked={values.customise}
            onCheckedChange={toggleCustomise}
          />
          {values.customise ? (
            <fieldset className="wo-plan">
              <legend>Follow-up days, counted from today</legend>
              {PLAN_FIELDS.map(([key, label, hint]) => (
                <Field key={key} label={label} description={hint} error={planError(key)}>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={values.plan[key]}
                    onChange={(e) => set('plan', { ...values.plan, [key]: e.target.value })}
                  />
                </Field>
              ))}
            </fieldset>
          ) : null}
        </FormSection>

        {create.isError && !Object.keys(serverErrors).length ? (
          <p className="wo-alert" role="alert">
            {describeError(create.error)}
          </p>
        ) : null}
        <FormActions
          status="You can resolve or cancel it any time. Nothing is sent without you."
          sticky
        >
          <Button type="submit" loading={create.isPending}>
            Start tracking
          </Button>
        </FormActions>
      </Form>
      <div className="wo-aside">
        <SchedulePreview values={values} />
      </div>
    </div>
  )
}

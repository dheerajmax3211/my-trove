import {
  Badge,
  Button,
  Checkbox,
  Field,
  FileDrop,
  Form,
  FormActions,
  FormGrid,
  FormSection,
  Input,
  PageHeader,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'

interface Values {
  name: string
  email: string
  document: string
  duration: string
  note: string
  notify: boolean
  watermark: boolean
}

const initial: Values = {
  name: '',
  email: '',
  document: '',
  duration: '7',
  note: '',
  notify: true,
  watermark: false,
}

function validate(v: Values): Partial<Record<keyof Values, string>> {
  const errors: Partial<Record<keyof Values, string>> = {}
  if (v.name.trim().length < 2) errors.name = 'Enter the name of the person you are lending to.'
  if (!/^\S+@\S+\.\S+$/.test(v.email)) errors.email = 'Enter an email like name@example.com.'
  if (!v.document) errors.document = 'Choose the document to lend.'
  return errors
}

/**
 * The form pattern: sections with an explanation on the left and a white card of fields on the
 * right, floating labels for short fields, stacked for long ones, messages that ease open, and a
 * sticky action bar that appears once there is something to save.
 */
export function FormsPage() {
  const [values, setValues] = useState<Values>(initial)
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const { toast } = useToast()
  const errors = validate(values)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  const show = (k: keyof Values) => (touched[k] || submitted ? errors[k] : undefined)
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((s) => ({ ...s, [k]: v }))
  const blur = (k: keyof Values) => () => setTouched((t) => ({ ...t, [k]: true }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length === 0) {
      toast({
        title: 'Key sent',
        description: `${values.name} can open the document for ${values.duration} days.`,
        variant: 'success',
      })
    }
  }

  return (
    <div className="pg-stack">
      <PageHeader
        eyebrow="Pattern"
        title="Lend a document"
        description="One person, one document, for as long as you choose. Fields validate when you leave them; errors ease in and say how to fix it."
      />
      <Form onSubmit={submit} aria-label="Lend a document">
        <FormSection
          title="Who is it for"
          description="They get an email with a link. It stops working when the time is up."
        >
          <FormGrid>
            <Field
              label="Full name"
              variant="floating"
              required
              error={show('name')}
              success={touched.name && !errors.name ? 'Looks good' : undefined}
            >
              <Input
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                onBlur={blur('name')}
                autoComplete="name"
              />
            </Field>
            <Field
              label="Email"
              variant="floating"
              required
              error={show('email')}
              success={touched.email && !errors.email}
            >
              <Input
                type="email"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                onBlur={blur('email')}
                autoComplete="email"
              />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection
          title="What to lend"
          description="Pick a document and how long it stays open. You can end access early at any time."
        >
          <FormGrid>
            <Field
              label="Document"
              required
              error={show('document')}
              style={{ gridColumn: '1 / -1' }}
            >
              <Select
                value={values.document}
                onChange={(e) => set('document', e.target.value)}
                onBlur={blur('document')}
                placeholder="Choose a document"
              >
                <option value="w9">Vendor W-9</option>
                <option value="insurance">Home insurance policy</option>
                <option value="deed">Property deed</option>
              </Select>
            </Field>
            <Field label="Open for" variant="floating">
              <Select value={values.duration} onChange={(e) => set('duration', e.target.value)}>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
              </Select>
            </Field>
            <Field label="Reference" variant="floating" hint="Optional">
              <Input placeholder="e.g. Tax year 2026" />
            </Field>
            <Field
              label="Note to the recipient"
              hint={`${values.note.length} / 200`}
              description="Shown at the top of the shared page."
              style={{ gridColumn: '1 / -1' }}
            >
              <Textarea
                rows={3}
                maxLength={200}
                value={values.note}
                onChange={(e) => set('note', e.target.value)}
              />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection
          title="Attachments"
          description="Add anything they should see alongside the document."
        >
          <Field label="Supporting files" description="PDF or images, up to 5 MB each.">
            <FileDrop
              multiple
              accept=".pdf,image/*"
              maxSize={5 * 1024 * 1024}
              hint="PDF, PNG or JPG, up to 5 MB"
            />
          </Field>
        </FormSection>

        <FormSection title="Options">
          <Switch
            label="Email me when it is opened"
            description="One email, the first time they view it."
            checked={values.notify}
            onCheckedChange={(v) => set('notify', v)}
          />
          <Checkbox
            label="Watermark each page with their name"
            checked={values.watermark}
            onCheckedChange={(v) => set('watermark', v === true)}
          />
        </FormSection>

        <FormActions
          visible={dirty}
          status={
            submitted && Object.keys(errors).length > 0 ? (
              <Badge variant="danger" dot>
                {Object.keys(errors).length} to fix
              </Badge>
            ) : (
              'Unsent changes'
            )
          }
        >
          <Button
            variant="ghost"
            onClick={() => {
              setValues(initial)
              setTouched({})
              setSubmitted(false)
            }}
          >
            Discard
          </Button>
          <Button type="submit" variant="glow">
            Send the key
          </Button>
        </FormActions>
      </Form>
    </div>
  )
}

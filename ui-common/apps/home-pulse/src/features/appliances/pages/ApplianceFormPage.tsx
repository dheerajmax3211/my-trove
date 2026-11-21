import { PageHeader, useToast } from '@platform/ui'
import { useParams } from 'react-router-dom'
import { ModuleLink, useModuleNavigate } from '@platform/workspace-kit'
import { Button } from '@platform/ui'
import { ErrorState } from '../../../components/ErrorState'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { ApplianceForm } from '../components/ApplianceForm'
import { EMPTY_FORM, toFormValues } from '../formState'
import { useAppliance, useCreateAppliance, useUpdateAppliance } from '../hooks'
import type { ApplianceInput } from '../types'

export function AddAppliancePage() {
  useDocumentTitle('Add appliance')
  const navigate = useModuleNavigate()
  const { toast } = useToast()
  const create = useCreateAppliance()

  const submit = (input: ApplianceInput) =>
    create.mutate(input, {
      onSuccess: (appliance) => {
        toast({
          title: 'Appliance added',
          description: 'Next, register a device so it can report power readings.',
          variant: 'success',
        })
        void navigate(`/appliances/${appliance.id}`)
      },
    })

  return (
    <>
      <PageHeader
        eyebrow="Appliances"
        title="Add an appliance"
        description="Tell us what it is. You will connect a smart plug or sensor in the next step."
      />
      <ApplianceForm
        initial={EMPTY_FORM}
        submitLabel="Add appliance"
        busy={create.isPending}
        error={create.error}
        onSubmit={submit}
        onCancel={() => void navigate('/')}
      />
    </>
  )
}

export function EditAppliancePage() {
  const { id = '' } = useParams()
  const navigate = useModuleNavigate()
  const { toast } = useToast()
  const appliance = useAppliance(id)
  const update = useUpdateAppliance(id)
  useDocumentTitle(appliance.data ? `Edit ${appliance.data.name}` : 'Edit appliance')

  if (appliance.isPending) return <PageSkeleton label="Loading appliance" />
  if (appliance.isError)
    return (
      <ErrorState
        title="Could not load this appliance"
        error={appliance.error}
        onRetry={() => void appliance.refetch()}
      />
    )

  const back = `/appliances/${id}`
  return (
    <>
      <PageHeader
        eyebrow={appliance.data.name}
        title="Edit appliance"
        actions={
          <Button variant="ghost" asChild>
            <ModuleLink to={back}>Back to appliance</ModuleLink>
          </Button>
        }
      />
      <ApplianceForm
        initial={toFormValues(appliance.data)}
        submitLabel="Save changes"
        busy={update.isPending}
        error={update.error}
        onSubmit={(input) =>
          update.mutate(input, {
            onSuccess: () => {
              toast({ title: 'Changes saved', variant: 'success' })
              void navigate(back)
            },
          })
        }
        onCancel={() => void navigate(back)}
      />
    </>
  )
}

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@platform/ui'
import { useModuleNavigate } from '@platform/workspace-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTreasuryApi } from '../../../api/hooks'
import { treasuryKeys } from '../../../api/keys'
import type { HouseholdView } from '../../../api/types'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { writeStored } from '../../../lib/storage'
import { LAST_HOUSEHOLD_KEY } from '../nav'

/** Join a household someone else created, with the one-time code they sent. */
export function JoinHouseholdCard() {
  const navigate = useModuleNavigate()
  const api = useTreasuryApi()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()

  const join = useMutation<HouseholdView, unknown, string>({
    mutationFn: (value) => api.acceptInvite(value),
    onSuccess: async (household) => {
      await queryClient.invalidateQueries({ queryKey: treasuryKeys.households() })
      writeStored(LAST_HOUSEHOLD_KEY, household.id)
      navigate(`/h/${household.id}`)
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (code.trim() === '') return setError('Paste the invite code you were sent.')
    setError(undefined)
    if (!join.isPending) join.mutate(code.trim())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Join a household</CardTitle>
        <CardDescription>
          Someone in a household sent you a code? Paste it here. It works once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="ft-form" onSubmit={onSubmit} noValidate>
          <Field label="Invite code" required error={error}>
            <Input
              value={code}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          {join.error ? <ErrorNotice error={join.error} /> : null}
          <Button type="submit" loading={join.isPending}>
            Join household
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

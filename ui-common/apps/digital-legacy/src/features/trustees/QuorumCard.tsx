import { useApiMutation } from '@platform/api-client'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Select,
  useToast,
} from '@platform/ui'
import { useState } from 'react'
import { ModuleLink } from '@platform/workspace-kit'
import { ownerPaths } from '../../api/paths'
import type { StateView } from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { OWNER_KEYS } from '../queries'
import { describeQuorum } from './quorumAdvice'

/** Chooses t of n. The quorum is part of the policy, so saving it re-saves the policy with the new t. */
export function QuorumCard({ state, trusteeCount }: { state: StateView; trusteeCount: number }) {
  const { toast } = useToast()
  const current = state.policy?.quorum ?? null
  const [choice, setChoice] = useState<number | null>(null)
  const t = choice ?? current ?? Math.min(2, Math.max(1, trusteeCount))
  const save = useApiMutation<StateView, NonNullable<StateView['policy']>>({
    method: 'PUT',
    path: ownerPaths.policy,
    invalidate: OWNER_KEYS,
    onSuccess: () => {
      setChoice(null)
      toast({
        title: 'Quorum saved',
        description: 'Seal fresh shares so trustees hold shares for the new threshold.',
        variant: 'success',
      })
    },
  })
  const options = Array.from({ length: Math.max(trusteeCount, 1) }, (_, i) => i + 1)
  const noPolicy = state.policy === null
  const tooMany = current !== null && current > trusteeCount

  return (
    <Card aria-labelledby="quorum-title">
      <CardHeader>
        <CardTitle as="h2" id="quorum-title">
          How many trustees must agree
        </CardTitle>
        <CardDescription>
          The vault key is split so that this many trustees, working together, can rebuild it. It is
          both the number of approvals needed and the number of shares needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="stack-3">
          {noPolicy ? (
            <Callout tone="info">
              <p>
                The quorum is part of your check-in policy. Set that up first on the{' '}
                <ModuleLink to="/policy">Check-in policy</ModuleLink> page, then come back to choose it.
              </p>
            </Callout>
          ) : null}
          {tooMany ? (
            <Callout tone="warning" title="Your quorum is larger than your trustee count">
              <p>
                The quorum is {current} but you have {trusteeCount} active trustee
                {trusteeCount === 1 ? '' : 's'}. Pick a smaller number or invite more people.
              </p>
            </Callout>
          ) : null}
          <Field label="Trustees needed (t)" controlId="quorum-select">
            <Select
              value={String(t)}
              disabled={noPolicy || trusteeCount === 0}
              onChange={(e) => setChoice(Number(e.target.value))}
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  {n} of {trusteeCount}
                </option>
              ))}
            </Select>
          </Field>
          <div className="stack-2" aria-live="polite">
            {describeQuorum(t, trusteeCount).map((line) => (
              <p key={line} style={{ margin: 0 }}>
                {line}
              </p>
            ))}
          </div>
          {state.armed ? (
            <p className="small muted" style={{ margin: 0 }}>
              The switch is armed: saving the policy restarts your check-in interval, exactly like a
              check-in.
            </p>
          ) : null}
          {save.error ? <ErrorNotice error={save.error} title="Could not save the quorum" /> : null}
          <div>
            <Button
              loading={save.isPending}
              disabled={noPolicy || choice === null || choice === current || trusteeCount === 0}
              onClick={() => state.policy && save.mutate({ ...state.policy, quorum: t })}
            >
              Save quorum
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

import { useApiMutation } from '@platform/api-client'
import { BentoCard, Button, ClockIcon, Field, Select, useToast } from '@platform/ui'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { ownerPaths } from '../../api/paths'
import type { StateView } from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { DAY, formatDateTime, formatDuration } from '../../lib/format'
import { OWNER_KEYS } from '../queries'
import { pauseOptions } from './pauseOptions'

/** Vacation mode: hold the timers for a bounded stretch. Bounded on purpose, see the limits shown. */
export function PauseCard({
  state,
  className,
  style,
}: {
  state: StateView
  className?: string
  style?: CSSProperties
}) {
  const { toast } = useToast()
  const options = pauseOptions(state)
  const [days, setDays] = useState('7')
  const selected = options.choices.includes(Number(days) * DAY)
    ? Number(days) * DAY
    : (options.choices[options.choices.length - 1] ?? 0)

  const pause = useApiMutation<StateView, { durationSeconds: number }>({
    path: ownerPaths.pause,
    invalidate: OWNER_KEYS,
    onSuccess: (next) =>
      toast({
        title: 'Vacation mode on',
        description: `Timers are paused until ${formatDateTime(next.pausedUntil)}.`,
        variant: 'success',
      }),
  })
  const resume = useApiMutation<StateView>({
    path: ownerPaths.resume,
    invalidate: OWNER_KEYS,
    onSuccess: () =>
      toast({ title: 'Pause ended', description: 'Timers are running again.', variant: 'success' }),
  })

  return (
    <BentoCard
      span={12}
      title="Vacation mode"
      icon={<ClockIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="stack-3">
        <p className="small muted" style={{ margin: 0 }}>
          Pause the countdown while you are away and cannot check in. A pause can never be longer
          than your policy allows, and the total is capped per year so it cannot become a way to
          switch the system off.
        </p>
        <div className="stack-3">
          <p className="small muted" style={{ margin: 0 }}>
            Longest single pause: {formatDuration(state.pause.maxSingleSeconds)}. Used this year:{' '}
            {formatDuration(state.pause.usedSeconds)} of{' '}
            {formatDuration(state.pause.yearlyBudgetSeconds)}.
          </p>
          {state.pausedUntil ? (
            <div className="row-wrap">
              <span>Paused until {formatDateTime(state.pausedUntil)}.</span>
              <Button
                variant="secondary"
                loading={resume.isPending}
                onClick={() => resume.mutate()}
              >
                End pause now
              </Button>
            </div>
          ) : options.blocked ? (
            <Callout tone="info">
              <p>{options.blocked}</p>
            </Callout>
          ) : (
            <div className="row-wrap" style={{ alignItems: 'end' }}>
              <Field label="Pause for" controlId="pause-length">
                <Select value={String(selected / DAY)} onChange={(e) => setDays(e.target.value)}>
                  {options.choices.map((seconds) => (
                    <option key={seconds} value={seconds / DAY}>
                      {seconds / DAY} {seconds === DAY ? 'day' : 'days'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="secondary"
                loading={pause.isPending}
                onClick={() => pause.mutate({ durationSeconds: selected })}
              >
                Start vacation mode
              </Button>
            </div>
          )}
          {pause.error ? <ErrorNotice error={pause.error} title="Could not pause" /> : null}
          {resume.error ? (
            <ErrorNotice error={resume.error} title="Could not end the pause" />
          ) : null}
        </div>
      </div>
    </BentoCard>
  )
}

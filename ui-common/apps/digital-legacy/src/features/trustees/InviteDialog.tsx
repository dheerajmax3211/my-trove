import { useApiMutation } from '@platform/api-client'
import { Button, Dialog, DialogClose, Field, Input, Select } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { ownerPaths } from '../../api/paths'
import type { InviteResponse } from '../../api/types'
import { Callout } from '../../components/Callout'
import { CopyButton } from '../../components/CopyButton'
import { ErrorNotice } from '../../components/ErrorNotice'
import { formatDateTime } from '../../lib/format'
import { trusteePortalOrigin } from '../../lib/trusteePortal'
import { OWNER_KEYS } from '../queries'

const CHANNELS = [
  ['email', 'Email'],
  ['text', 'Text message'],
  ['chat', 'A messaging app'],
  ['person', 'In person'],
] as const

/** The token sits in the URL fragment, which browsers never send to a server. */
export function inviteLink(origin: string, token: string): string {
  return `${origin}/trustee/accept#invite=${token}`
}

function message(name: string, link: string, channel: string): string {
  const where = channel === 'person' ? 'Open this on your own device' : 'Open this link'
  return `Hi ${name}, I would like you to be a trustee of my digital legacy. ${where} to register your key: ${link}\nWe will compare a short fingerprint by phone afterwards so we both know the key is yours.`
}

export function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [label, setLabel] = useState('')
  const [channel, setChannel] = useState<string>('email')
  const [touched, setTouched] = useState(false)
  const invite = useApiMutation<InviteResponse, { label: string }>({
    path: ownerPaths.trustees,
    invalidate: OWNER_KEYS,
  })
  const created = invite.data
  const link = created ? inviteLink(trusteePortalOrigin(), created.inviteToken) : ''
  const blank = label.trim() === ''

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!blank) invite.mutate({ label: label.trim() })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setLabel('')
          setTouched(false)
          invite.reset()
        }
        onOpenChange(next)
      }}
      title={created ? `Invite for ${created.label}` : 'Invite a trustee'}
      description={
        created
          ? 'Send this link to them yourself. It is shown only this once.'
          : 'A trustee is someone you trust to take part in opening your vault if you can no longer check in.'
      }
      footer={
        created ? (
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        ) : (
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" form="invite-form" loading={invite.isPending}>
              Create invite
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="stack-3">
          <Callout tone="warning" title="Copy this now">
            <p>
              We store only a digest of this invite, so it cannot be shown again. It works once and
              expires {formatDateTime(created.inviteExpiresAt)}.
            </p>
          </Callout>
          <Field label="Invite link">
            <Input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="mono"
            />
          </Field>
          <div className="row-wrap">
            <CopyButton text={link} label="Copy link" />
            <CopyButton
              text={message(created.label, link, channel)}
              label="Copy a ready-made message"
            />
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            The token sits after the # in the link, so it is never sent to any server when it is
            opened.
          </p>
        </div>
      ) : (
        <form id="invite-form" className="stack-3" onSubmit={onSubmit} noValidate>
          <Field label="Their name" required error={touched && blank ? 'Enter a name.' : undefined}>
            <Input
              value={label}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field
            label="How will you send them the link?"
            description="This only tailors the message we prepare. It is not stored."
          >
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </Select>
          </Field>
          {invite.error ? (
            <ErrorNotice error={invite.error} title="Could not create the invite" />
          ) : null}
        </form>
      )}
    </Dialog>
  )
}

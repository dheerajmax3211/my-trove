import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  Field,
  Input,
  Select,
  useToast,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { PersonLabel } from '../../../components/People'
import { usePeople } from '../../../core/people'
import { errorMessage } from '../../../lib/errors'
import { formatDate } from '../../../lib/format'
import { useChangeRole, useRemoveMember } from '../hooks'
import { canChangeRole, canRemoveMember, LAST_OWNER_REASON, ownerCount } from '../rules'
import type { HouseholdDetail, HouseholdRole, Member } from '../types'
import styles from './Members.module.css'

function NameForm({ member, onClose }: { member: Member; onClose: () => void }) {
  const people = usePeople()
  const [value, setValue] = useState(people.nicknameOf(member.uid) ?? '')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    people.setNickname(member.uid, value)
    onClose()
  }
  return (
    <form id="name-person-form" className="hub-stack-sm" onSubmit={submit} noValidate>
      <Field label="Name" description="Leave it empty to remove the name.">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          maxLength={60}
        />
      </Field>
    </form>
  )
}

/** The service knows people only by sign-in uid, so a name is something you give them, on this device. */
function NameDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  return (
    <Dialog
      open={member !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Name this person"
      description="The household only knows people by their sign-in. A name you give here is kept on this device and shows wherever they appear."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="name-person-form">
            Save name
          </Button>
        </>
      }
    >
      {member ? <NameForm key={member.uid} member={member} onClose={onClose} /> : null}
    </Dialog>
  )
}

export function MembersCard({ household }: { household: HouseholdDetail }) {
  const people = usePeople()
  const { toast } = useToast()
  const changeRole = useChangeRole(household.id)
  const removeMember = useRemoveMember(household.id)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [naming, setNaming] = useState<Member | null>(null)
  const callerUid = people.selfUid
  const onlyOwnerLeft = ownerCount(household.members) === 1
  const isOwner = household.callerRole === 'OWNER'

  const onRoleChange = (member: Member, role: HouseholdRole) =>
    changeRole.mutate(
      { uid: member.uid, role },
      {
        onSuccess: () =>
          toast({
            title: 'Role updated',
            description: `${member.uid === callerUid ? 'You are' : `${people.plainNameOf(member.uid)} is`} now ${role === 'OWNER' ? 'an owner' : 'a member'}.`,
            variant: 'success',
          }),
        onError: (error) =>
          toast({
            title: 'Could not change the role',
            description: errorMessage(error),
            variant: 'danger',
          }),
      },
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Members</CardTitle>
        <CardDescription>
          {isOwner
            ? 'Owners can invite people, change roles and remove members.'
            : 'Only owners can invite people, change roles or remove members.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hub-stack-sm">
          <ul className={styles.list} aria-label="Household members">
            {household.members.map((m) => {
              const name = people.plainNameOf(m.uid)
              const roleRule = canChangeRole(household.callerRole, household.members, m)
              const removeRule = canRemoveMember(household.callerRole, household.members, m)
              return (
                <li key={m.uid} className={styles.member}>
                  <div className={styles.who}>
                    <PersonLabel uid={m.uid} size="md" />
                    <span className={styles.joined}>Joined {formatDate(m.joinedAt)}</span>
                  </div>
                  <div className={styles.controls}>
                    {isOwner ? (
                      <Select
                        size="sm"
                        aria-label={`Role for ${name}`}
                        value={m.role}
                        disabled={!roleRule.allowed || changeRole.isPending}
                        title={roleRule.reason}
                        onChange={(e) => onRoleChange(m, e.target.value as HouseholdRole)}
                        style={{ width: 'auto' }}
                      >
                        <option value="OWNER">Owner</option>
                        <option value="MEMBER">Member</option>
                      </Select>
                    ) : (
                      <Badge variant={m.role === 'OWNER' ? 'accent' : 'neutral'}>
                        {m.role === 'OWNER' ? 'Owner' : 'Member'}
                      </Badge>
                    )}
                    {m.uid !== callerUid ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Name ${name}`}
                        onClick={() => setNaming(m)}
                      >
                        Name
                      </Button>
                    ) : null}
                    {isOwner && m.uid !== callerUid ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!removeRule.allowed}
                        title={removeRule.reason}
                        aria-label={`Remove ${name}`}
                        onClick={() => setRemoving(m)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="hub-muted">
            {onlyOwnerLeft
              ? `Only one owner right now. ${LAST_OWNER_REASON}`
              : 'A household always keeps at least one owner.'}
          </p>
        </div>
      </CardContent>
      <NameDialog member={naming} onClose={() => setNaming(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null)
            removeMember.reset()
          }
        }}
        title={`Remove ${removing ? people.plainNameOf(removing.uid) : 'member'}?`}
        description="They lose access to this household's reminders, files and activity. They can rejoin with a new invite."
        confirmLabel="Remove member"
        pending={removeMember.isPending}
        error={removeMember.error}
        onConfirm={() => {
          if (!removing) return
          removeMember.mutate(
            { uid: removing.uid },
            {
              onSuccess: () => {
                toast({
                  title: 'Member removed',
                  description: people.plainNameOf(removing.uid),
                  variant: 'success',
                })
                setRemoving(null)
              },
            },
          )
        }}
      />
    </Card>
  )
}

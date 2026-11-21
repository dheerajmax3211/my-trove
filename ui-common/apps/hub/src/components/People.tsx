import { Avatar, Badge, type AvatarSize } from '@platform/ui'
import { usePeople } from '../core/people'
import styles from './People.module.css'

/** A person as a row label: avatar, a readable name and "You" for the signed-in user. */
export function PersonLabel({ uid, size = 'sm' }: { uid: string; size?: AvatarSize }) {
  const people = usePeople()
  return (
    <span className={styles.person}>
      <Avatar name={people.plainNameOf(uid)} size={size} decorative />
      <span className={styles.name} title={uid}>
        {people.plainNameOf(uid)}
      </span>
      {people.isSelf(uid) ? <Badge variant="accent">You</Badge> : null}
    </span>
  )
}

/** Overlapping avatars for a handful of people, with a "+N" for the rest. The names are read out once. */
export function AvatarStack({
  uids,
  max = 4,
  size = 'sm',
}: {
  uids: readonly string[]
  max?: number
  size?: AvatarSize
}) {
  const people = usePeople()
  const shown = uids.slice(0, max)
  const rest = uids.length - shown.length
  const names = uids.map((uid) => people.nameOf(uid))
  return (
    <span className={styles.stack} role="img" aria-label={`People: ${names.join(', ')}`}>
      {shown.map((uid) => (
        <Avatar
          key={uid}
          name={people.plainNameOf(uid)}
          size={size}
          decorative
          className={styles.stacked}
        />
      ))}
      {rest > 0 ? (
        <span className={styles.more} aria-hidden="true">
          +{rest}
        </span>
      ) : null}
    </span>
  )
}

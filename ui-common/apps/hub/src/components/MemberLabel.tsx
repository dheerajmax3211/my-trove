import { Badge } from '@platform/ui'
import { shortId } from '../lib/format'

/** A person as the backend knows them: only a Firebase uid. "You" for the signed-in user. */
export function MemberLabel({ uid, currentUid }: { uid: string; currentUid: string | undefined }) {
  return (
    <span className="hub-row">
      <span className="hub-mono" title={uid}>
        {shortId(uid)}
      </span>
      {uid === currentUid ? <Badge variant="accent">You</Badge> : null}
    </span>
  )
}

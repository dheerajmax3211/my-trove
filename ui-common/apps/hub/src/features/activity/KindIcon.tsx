import { BellIcon, FileIcon, KeyIcon, UsersIcon } from '@platform/ui'
import type { EventKind } from './sentence'

/** The small glyph that says what kind of thing an event was about. Decorative: the sentence says it in words. */
export function KindIcon({ kind }: { kind: EventKind }) {
  switch (kind) {
    case 'reminder':
      return <BellIcon size={14} />
    case 'file':
      return <FileIcon size={14} />
    case 'invite':
      return <KeyIcon size={14} />
    default:
      return <UsersIcon size={14} />
  }
}

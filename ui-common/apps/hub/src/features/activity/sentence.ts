import { formatBytes } from '../../lib/format'
import { actionLabel, describeDetails } from './describe'
import type { AuditEvent } from './types'

export type EventKind = 'household' | 'reminder' | 'file' | 'invite'
export type EventTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'brass'

export interface EventSentence {
  /** "Ana added a reminder". */
  title: string
  /** The thing it was about: the reminder's title, the file's name. */
  description?: string
  kind: EventKind
  tone: EventTone
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

const opt = (description: string | undefined): { description?: string } =>
  description ? { description } : {}

/**
 * One audit event as a sentence a person would say. `nameOf` turns a uid into "You", a name or "Member 3fK9".
 * Unknown actions fall back to the raw action name so a new backend event is never hidden.
 */
export function describeEvent(event: AuditEvent, nameOf: (uid: string) => string): EventSentence {
  const who = nameOf(event.actorUid)
  const d = event.details
  const subject = nameOf(event.subjectId)
  const fileName = str(d.name)
  const sized =
    typeof d.sizeBytes === 'number'
      ? `${fileName ?? 'File'} (${formatBytes(d.sizeBytes)})`
      : fileName
  switch (event.action) {
    case 'household.created':
      return {
        title: `${who} created the household`,
        ...opt(str(d.name)),
        kind: 'household',
        tone: 'accent',
      }
    case 'household.deleted':
      return { title: `${who} deleted a household`, kind: 'household', tone: 'danger' }
    case 'member.joined':
      return {
        title: `${who} joined the household`,
        ...opt(d.role === 'OWNER' ? 'As an owner' : 'As a member'),
        kind: 'household',
        tone: 'success',
      }
    case 'member.left':
      return { title: `${who} left the household`, kind: 'household', tone: 'warning' }
    case 'member.removed':
      return {
        title: `${who} removed ${subject} from the household`,
        kind: 'household',
        tone: 'warning',
      }
    case 'member.role_changed':
      return {
        title: `${who} made ${subject} ${d.to === 'OWNER' ? 'an owner' : 'a member'}`,
        kind: 'household',
        tone: 'neutral',
      }
    case 'invite.created':
      return {
        title: `${who} created an invite code`,
        ...opt(d.role === 'OWNER' ? 'Joins as an owner' : 'Joins as a member'),
        kind: 'invite',
        tone: 'brass',
      }
    case 'invite.revoked':
      return { title: `${who} revoked an invite code`, kind: 'invite', tone: 'warning' }
    case 'reminder.created':
      return {
        title: `${who} added a reminder`,
        ...opt(str(d.title)),
        kind: 'reminder',
        tone: 'accent',
      }
    case 'reminder.updated':
      return {
        title: `${who} changed a reminder`,
        ...opt(str(d.title)),
        kind: 'reminder',
        tone: 'neutral',
      }
    case 'reminder.cancelled':
      return {
        title: `${who} cancelled a reminder`,
        ...opt(str(d.title)),
        kind: 'reminder',
        tone: 'warning',
      }
    case 'file.uploaded':
      return { title: `${who} added a file`, ...opt(sized), kind: 'file', tone: 'accent' }
    case 'file.deleted':
      return { title: `${who} deleted a file`, ...opt(fileName), kind: 'file', tone: 'warning' }
    case 'file.download_link_issued':
      return {
        title: `${who} shared a link to a file`,
        ...opt(fileName),
        kind: 'file',
        tone: 'brass',
      }
    default:
      return {
        title: `${who}: ${actionLabel(event.action)}`,
        ...opt(describeDetails(event) || undefined),
        kind: 'household',
        tone: 'neutral',
      }
  }
}

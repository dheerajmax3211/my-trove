import { BentoCard, InboxIcon } from '@platform/ui'

/**
 * Replies by email are not connected yet. Waiting On does not read mail sent to an item, so this card says
 * so instead of showing an address that would look like it works. Record outcomes with the actions above.
 */
export function ReplyAddressCard() {
  return (
    <BentoCard span={5} title="Replies by email" icon={<InboxIcon size={18} />}>
      <p className="wo-detail-note">
        Not connected yet. Waiting On does not read email replies, so answers you get will not show
        up here or change this item.
      </p>
      <p className="wo-fineprint">
        For now, resolve the item when it is paid or approved, snooze it to chase later, or cancel
        it. Waiting On does not send email for you, so you send the letters yourself.
      </p>
    </BentoCard>
  )
}

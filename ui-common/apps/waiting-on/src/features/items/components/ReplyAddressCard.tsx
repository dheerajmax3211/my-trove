import { BentoCard, InboxIcon } from '@platform/ui'
import { CopyButton } from '../../../components/CopyButton'
import type { Item } from '../api/types'

export function ReplyAddressCard({ item }: { item: Item }) {
  return (
    <BentoCard span={5} title="Reply address" icon={<InboxIcon size={18} />}>
      <p className="wo-detail-note" style={{ marginBottom: 'var(--pp-space-4)' }}>
        A private email address that belongs to this item alone.
      </p>
      <div className="wo-address">
        <code>{item.replyAddress}</code>
        <CopyButton text={item.replyAddress} what="reply address" />
      </div>
      <h3 className="wo-subheading">How forwarding replies works</h3>
      <ol className="wo-steps">
        <li>
          Put this address in Cc or Reply-To when you email {item.counterparty}, or forward any
          answer you get to it.
        </li>
        <li>
          Waiting On reads the message and adds it to the timeline. A payment confirmation resolves
          the item, a refusal brings the escalation forward, and a request for more information
          pauses follow-ups for 7 days. Anything else is only recorded.
        </li>
      </ol>
      <p className="wo-fineprint">
        Keep the address private: anyone who knows it can add a message to this item. Waiting On
        does not send email for you, so you send the letters yourself.
      </p>
    </BentoCard>
  )
}

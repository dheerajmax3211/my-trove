import { Button, InboxIcon } from '@platform/ui'
import { Link } from 'react-router-dom'

/** Shown when the user has never added anything: explains the product and offers the first step. */
export function FirstUse() {
  return (
    <section className="wo-first-use" aria-labelledby="first-use-title">
      <span className="wo-first-use-icon" aria-hidden="true">
        <InboxIcon size={28} />
      </span>
      <h2 id="first-use-title">Stop chasing people. Let Waiting On do it.</h2>
      <p>
        Add anything you are waiting to hear back on: a refund, an insurance claim, an expense
        reimbursement, an approval or a delivery. We keep following up for weeks, even when you have
        forgotten about it.
      </p>
      <ol className="wo-steps">
        <li>
          <strong>Add what you are waiting for</strong> and the date you expected it.
        </li>
        <li>
          <strong>We follow up on a schedule:</strong> a friendly nudge, then a firm escalation
          letter, then a final notice, and finally we close it if nobody ever answers.
        </li>
        <li>
          <strong>Forward replies to the item&apos;s own address</strong> and we read them for you:
          paid closes the item, a refusal speeds up the escalation.
        </li>
      </ol>
      <Button asChild>
        <Link to="/new">Add your first item</Link>
      </Button>
    </section>
  )
}

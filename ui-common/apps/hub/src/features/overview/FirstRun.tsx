import { Button, IllustrationKey, FileIcon, BellIcon, UsersIcon } from '@platform/ui'
import { useState, type ReactNode } from 'react'
import { CreateHouseholdDialog } from '../households/components/CreateHouseholdDialog'
import { JoinHouseholdDialog } from '../households/components/JoinHouseholdDialog'
import styles from './FirstRun.module.css'

const POINTS: ReadonlyArray<{ icon: ReactNode; title: string; text: string }> = [
  {
    icon: <UsersIcon size={22} />,
    title: 'A household is the people you share with',
    text: 'Create one for your family or flat, then invite the others with a one-time code. Owners decide who else can manage it.',
  },
  {
    icon: <BellIcon size={22} />,
    title: 'Reminders everyone sees',
    text: 'One list for the boiler service, the school form and the passport. Each reminder tells every member when it is due, and can repeat daily, weekly or monthly.',
  },
  {
    icon: <FileIcon size={22} />,
    title: 'Files you can hand over for a while',
    text: 'Keep the insurance papers where the household can find them. To share one outside, create a link that stops working after a minute to an hour.',
  },
]

/**
 * What a household is, in plain words, with the two ways in. Shown on the overview and on the households
 * page for someone who is not in a household yet.
 */
export function FirstRun({ headingId = 'first-run-heading' }: { headingId?: string }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  return (
    <section className={styles.firstRun} aria-labelledby={headingId}>
      <div className={styles.lead}>
        <div className={styles.art} aria-hidden="true">
          <IllustrationKey size={200} />
        </div>
        <div className={styles.copy}>
          <h2 id={headingId} className={styles.headline}>
            Share the small stuff with the people you live with
          </h2>
          <p className={styles.standfirst}>
            You are not in a household yet. Start one, or join the one a family member already has.
          </p>
          <div className={styles.actions}>
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              Create a household
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setJoinOpen(true)}>
              Join with a code
            </Button>
          </div>
        </div>
      </div>
      <ul className={styles.points} aria-label="What you can do in a household">
        {POINTS.map((point) => (
          <li key={point.title} className={styles.point}>
            <span className={styles.icon} aria-hidden="true">
              {point.icon}
            </span>
            <h3 className={styles.pointTitle}>{point.title}</h3>
            <p className={styles.pointText}>{point.text}</p>
          </li>
        ))}
      </ul>
      <CreateHouseholdDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinHouseholdDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </section>
  )
}

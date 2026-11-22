import {
  ActivityIcon,
  ArrowRightIcon,
  BentoCard,
  BentoGrid,
  BigStat,
  KeyIcon,
  LockIcon,
  Reveal,
  ShieldIcon,
  TreeIcon,
  UsersIcon,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { controls } from '../content/security'
import { HeroTicket } from '../pages/HeroTicket'
import styles from './Bento.module.css'

function control(id: string) {
  const found = controls.find((c) => c.id === id)
  if (!found) throw new Error(`Missing security control: ${id}`)
  return found
}

/** What is built and tested, as a bento, with the one interactive example: approve, deny, revoke. */
export function TrustBento() {
  const audit = control('audit')
  const legacy = control('legacy')
  const permissions = control('permissions')
  const rls = control('rls')
  const signIn = control('sign-in')
  return (
    <section
      id="security"
      className={`st-wrap st-section ${styles.section}`}
      aria-labelledby="trust-title"
    >
      <Reveal className="st-head">
        <h2 id="trust-title" className="st-h2">
          Trust you can check
        </h2>
        <p className="st-lead">
          Everything below is built and tested. The security page also says, just as plainly, what
          is not.
        </p>
      </Reveal>

      <BentoGrid>
        <BentoCard
          span={5}
          rowSpan={2}
          tone="dark"
          title="Try an access request"
          icon={<KeyIcon size={18} />}
        >
          <HeroTicket />
        </BentoCard>
        <BentoCard span={4} title={permissions.title} icon={<UsersIcon size={18} />}>
          <BigStat size="md" value={5} unit="personas" caption="Anything not granted is denied." />
          <p className={styles.text}>{permissions.what}</p>
        </BentoCard>
        <BentoCard span={3} title="Platform tokens" icon={<ShieldIcon size={18} />}>
          <BigStat size="md" value={10} unit="minutes" caption="How long one token lives." />
          <p className={styles.text}>Signed with RS256, carrying your roles and plan.</p>
        </BentoCard>
        <BentoCard span={4} title={audit.title} icon={<ActivityIcon size={18} />}>
          <p className={styles.text}>{audit.what}</p>
        </BentoCard>
        <BentoCard span={3} tone="lime" title="Legacy vault" icon={<TreeIcon size={18} />}>
          <p className={styles.text}>{legacy.what}</p>
        </BentoCard>
        <BentoCard span={4} title={signIn.title} icon={<LockIcon size={18} />}>
          <p className={styles.text}>{signIn.what}</p>
        </BentoCard>
        <BentoCard span={4} title={rls.title} icon={<ShieldIcon size={18} />}>
          <p className={styles.text}>{rls.what}</p>
        </BentoCard>
        <BentoCard
          span={4}
          tone="lilac"
          title="What is not here"
          icon={<ArrowRightIcon size={18} />}
        >
          <p className={styles.text}>
            No outside audit, no production deployment, no real payments. The limits are listed as
            plainly as the controls.
          </p>
          <Link to="/security" className={styles.more}>
            Everything that is built, and every limit
            <ArrowRightIcon size={16} aria-hidden="true" />
          </Link>
        </BentoCard>
      </BentoGrid>
    </section>
  )
}

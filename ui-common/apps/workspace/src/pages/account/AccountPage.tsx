import { useAuth } from '@platform/auth-web'
import {
  Avatar,
  Badge,
  BentoCard,
  BentoGrid,
  BigStat,
  Button,
  Callout,
  CoinsIcon,
  KeyValueList,
  LinkIcon,
  PageHeader,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  PersonaBadge,
  personas,
  useTheme,
  type Persona,
  type ThemePreference,
} from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  PERMISSION_LABELS,
  PERSONA_SUMMARY,
  groupPermissions,
  planInfo,
  primaryPersona,
} from '../../lib/personas'
import { useOnboarding } from '../../onboarding/OnboardingProvider'
import styles from './AccountPage.module.css'

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const number = new Intl.NumberFormat('en')

/** Who you are here: profile, roles and permissions, plan, preferences, and (later) connected apps. */
export function AccountPage() {
  const session = useWorkspaceSession()
  const { signOut } = useAuth()
  const onboarding = useOnboarding()
  const { theme, setTheme } = useTheme()
  usePageTitle('Account')

  const name = session.displayName ?? session.email ?? 'Your account'
  const main = primaryPersona(session.roles)
  const held: Persona[] = personas.filter((persona) =>
    session.roles.some((role) => role.toUpperCase() === persona),
  )
  const groups = groupPermissions(session.permissions)
  const plan = planInfo(session.plan)

  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile, what your role allows, and your preferences."
      />

      <BentoGrid>
        <div className={styles.leftCol}>
          <BentoCard span={5} title="Profile" icon={<UserIcon size={18} />}>
            <div className={styles.profile}>
              <Avatar name={name} size="lg" />
              <p className={styles.bigName}>{session.displayName ?? name}</p>
            </div>
            <KeyValueList
              className={styles.facts}
              items={[
                { id: 'email', label: 'Email', value: session.email ?? 'Not set' },
                { id: 'id', label: 'Account id', value: session.uid, mono: true },
              ]}
            />
          </BentoCard>

          <BentoCard
            span={5}
            tone="dark"
            title="Plan"
            icon={<CoinsIcon size={18} />}
            actions={<Badge variant="accent">{plan?.name ?? session.plan}</Badge>}
          >
            {plan ? (
              <>
                <BigStat
                  value={plan.perMonth}
                  locale="en"
                  caption="requests a month"
                  secondary={[{ label: 'Per minute', value: number.format(plan.perMinute) }]}
                />
                <p className={styles.planNote}>
                  Up to {number.format(plan.perMinute)} requests a minute and{' '}
                  {number.format(plan.perMonth)} a month. Today shows how much of the month you have
                  used.
                </p>
              </>
            ) : (
              <p className={styles.planNote}>This plan has no limits we can show.</p>
            )}
          </BentoCard>
        </div>

        <BentoCard span={7} title="Role and permissions" icon={<ShieldIcon size={18} />}>
          <p className={styles.lead}>{PERSONA_SUMMARY[main]}</p>
          <p className={styles.roles}>
            {(held.length > 0 ? held : [main]).map((persona) => (
              <PersonaBadge key={persona} persona={persona} />
            ))}
          </p>
          {groups.length === 0 ? (
            <p className={styles.muted}>Your account has no permissions yet.</p>
          ) : (
            <div className={styles.groups}>
              {groups.map((group) => (
                <section key={group.title} aria-label={group.title} className={styles.group}>
                  <h4 className={styles.groupTitle}>{group.title}</h4>
                  <ul className={styles.perms}>
                    {group.permissions.map((permission) => (
                      <li key={permission}>
                        <span>{PERMISSION_LABELS[permission] ?? permission}</span>
                        <code>{permission}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className={styles.muted}>
            Roles are changed by an admin or the owner. A change reaches this page within about a
            minute.
          </p>
        </BentoCard>

        <BentoCard span={6} title="Preferences" icon={<SettingsIcon size={18} />}>
          <div className={styles.pref}>
            <div>
              <h4 className={styles.groupTitle} id="theme-label">
                Theme
              </h4>
              <p className={styles.muted}>System follows your device.</p>
            </div>
            <div role="group" aria-labelledby="theme-label" className={styles.segmented}>
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={theme === option.value}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.pref}>
            <div>
              <h4 className={styles.groupTitle}>Welcome tour</h4>
              <p className={styles.muted}>
                Pick the products to pin and see a first step for each.
              </p>
            </div>
            <Button variant="secondary" onClick={onboarding.reopen}>
              Open the welcome tour
            </Button>
          </div>
        </BentoCard>

        <BentoCard span={6} title="Connected apps" icon={<LinkIcon size={18} />}>
          <Callout variant="note" title="Coming with the developer portal">
            Apps that other developers build will be listed here, with what each can read and a
            button to disconnect it. Nothing is connected to your account today.
          </Callout>
        </BentoCard>
      </BentoGrid>

      <div className={styles.signOut}>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </>
  )
}

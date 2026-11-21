import { useAuth } from '@platform/auth-web'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  KeyValueList,
  PageHeader,
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

      <div className={styles.stack}>
        <section className={styles.section} aria-labelledby="profile-title">
          <h2 id="profile-title" className={styles.title}>
            Profile
          </h2>
          <div className={styles.profile}>
            <Avatar name={name} size="lg" />
            <KeyValueList
              className={styles.facts}
              items={[
                { id: 'name', label: 'Name', value: session.displayName ?? 'Not set' },
                { id: 'email', label: 'Email', value: session.email ?? 'Not set' },
                { id: 'id', label: 'Account id', value: session.uid, mono: true },
              ]}
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="roles-title">
          <h2 id="roles-title" className={styles.title}>
            Role and permissions
          </h2>
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
                  <h3 className={styles.groupTitle}>{group.title}</h3>
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
        </section>

        <section className={styles.section} aria-labelledby="plan-title">
          <h2 id="plan-title" className={styles.title}>
            Plan
          </h2>
          <p className={styles.roles}>
            <Badge variant="accent">{plan?.name ?? session.plan}</Badge>
          </p>
          {plan ? (
            <p className={styles.lead}>
              Up to {number.format(plan.perMinute)} requests a minute and{' '}
              {number.format(plan.perMonth)} a month. Today shows how much of the month you have
              used.
            </p>
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="prefs-title">
          <h2 id="prefs-title" className={styles.title}>
            Preferences
          </h2>
          <div className={styles.pref}>
            <div>
              <h3 className={styles.groupTitle} id="theme-label">
                Theme
              </h3>
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
              <h3 className={styles.groupTitle}>Welcome tour</h3>
              <p className={styles.muted}>
                Pick the products to pin and see a first step for each.
              </p>
            </div>
            <Button variant="secondary" onClick={onboarding.reopen}>
              Open the welcome tour
            </Button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="apps-title">
          <h2 id="apps-title" className={styles.title}>
            Connected apps
          </h2>
          <Callout variant="note" title="Coming with the developer portal">
            Apps that other developers build will be listed here, with what each can read and a
            button to disconnect it. Nothing is connected to your account today.
          </Callout>
        </section>

        <div className={styles.signOut}>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </>
  )
}

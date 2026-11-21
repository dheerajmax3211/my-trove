import { useAuth } from '@platform/auth-web'
import { Button, Callout, Field, Input, KeyCut, Logo, VaultRings } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { useState, type FormEvent } from 'react'
import { ModuleMark } from '../../components/ModuleMark'
import { usePageTitle } from '../../lib/usePageTitle'
import { isProduct } from '../../modules/registry'
import type { Runtime } from '../../runtime'
import styles from './SignInPage.module.css'

/** The page a signed-out visitor sees: what My-Trove is, how to get in, and a way to look around first. */
export function SignInPage({
  runtime,
  modules,
}: {
  runtime: Runtime
  modules: readonly ProductModule[]
}) {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  usePageTitle('Sign in')

  // An email link opened on a device that does not know the address asks for it again.
  const confirming = auth.emailLinkPending
  const implicitDemo = runtime.mode === 'demo'
  const products = modules.filter(isProduct)

  const google = async () => {
    setBusy('google')
    await auth.signInWithGoogle()
    setBusy(null)
  }

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy('email')
    const ok = confirming
      ? await auth.completeEmailLinkSignIn(address)
      : await auth.sendEmailLink(address, { url: window.location.origin })
    setBusy(null)
    if (ok && !confirming) setSentTo(address)
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} data-surface="vault" aria-labelledby="signin-title">
        <VaultRings className={styles.rings} />
        <div className={styles.heroInner}>
          <Logo size="lg" />
          <div className={styles.pitch}>
            <h1 id="signin-title" className={styles.headline}>
              Keep your household&rsquo;s life data in one private place.
            </h1>
            <p className={styles.lead}>
              My-Trove brings your follow-ups, consent, home, documents, legacy plans and household
              money into one workspace, and you decide who can see each part.
            </p>
          </div>
          <ul className={styles.products} aria-label="What is inside">
            {products.map((module) => (
              <li key={module.id}>
                <ModuleMark module={module} size={32} />
                <span>
                  <strong>{module.title}</strong>
                  <span className={styles.tagline}>{module.tagline}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <KeyCut className={styles.keycut} height={20} />
      </section>

      <main className={styles.panel}>
        <div className={styles.form}>
          <h2 className={styles.formTitle}>{confirming ? 'Confirm your email' : 'Sign in'}</h2>

          {implicitDemo ? (
            <Callout variant="note" title="Demo build">
              No sign-in service is set up here, so you will be signed in as a demo user with sample
              data.
            </Callout>
          ) : null}

          {auth.error ? (
            <Callout variant="danger" title="Could not sign you in">
              {auth.error.message}
            </Callout>
          ) : null}

          {sentTo ? (
            <Callout variant="success" title="Check your inbox">
              We sent a sign-in link to {sentTo}. Open it on this device to finish.
            </Callout>
          ) : null}

          {!confirming ? (
            <Button size="lg" fullWidth loading={busy === 'google'} onClick={() => void google()}>
              Continue with Google
            </Button>
          ) : null}

          {!implicitDemo || confirming ? (
            <>
              {!confirming ? (
                <p className={styles.or}>
                  <span>or use your email</span>
                </p>
              ) : (
                <p className={styles.muted}>
                  You opened a sign-in link on a new device. Type the address it was sent to.
                </p>
              )}
              <form onSubmit={(event) => void submitEmail(event)} className={styles.emailForm}>
                <Field label="Email address">
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </Field>
                <Button type="submit" variant="secondary" fullWidth loading={busy === 'email'}>
                  {confirming ? 'Finish signing in' : 'Email me a sign-in link'}
                </Button>
              </form>
            </>
          ) : null}

          <div className={styles.demo}>
            <p className={styles.demoTitle}>Just looking?</p>
            <p className={styles.muted}>
              Open the workspace with sample data. No account, nothing saved, and you can switch
              between roles to see what each one sees.
            </p>
            <Button asChild variant="ghost">
              <a href="/?demo=1">Try the demo</a>
            </Button>
          </div>

          <p className={styles.site}>
            New here? <a href={runtime.siteUrl}>Read what My-Trove is on our site</a>.
          </p>
        </div>
      </main>
    </div>
  )
}

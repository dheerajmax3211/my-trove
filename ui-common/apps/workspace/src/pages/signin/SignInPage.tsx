import { useAuth } from '@platform/auth-web'
import {
  ArrowRightIcon,
  Aurora,
  Button,
  Callout,
  Field,
  Grain,
  Input,
  Logo,
  Reveal,
  SpotlightCard,
  SplitText,
} from '@platform/ui'
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
    <div className={styles.page} data-theme="dark">
      <section className={styles.hero} aria-labelledby="signin-title">
        <Aurora palette="brand" intensity="vivid" />
        <Grain opacity={0.06} />
        <div className={styles.heroInner}>
          <Logo size="lg" />
          <div className={styles.pitch}>
            <SplitText as="h1" id="signin-title" className={styles.headline} immediate>
              Keep your household’s life data in one private place.
            </SplitText>
            <Reveal delay={0.5} distance={14}>
              <p className={styles.lead}>
                My-Trove brings your follow-ups, consent, home, documents, legacy plans and
                household money into one workspace, and you decide who can see each part.
              </p>
            </Reveal>
          </div>
          <ul className={styles.products} aria-label="What is inside">
            {products.map((module, index) => (
              <Reveal as="li" key={module.id} delay={0.7 + index * 0.07} distance={18} scale={0.97}>
                <SpotlightCard className={styles.product} tilt={2} radius={220}>
                  <ModuleMark module={module} size={36} />
                  <span className={styles.productText}>
                    <strong>{module.title}</strong>
                    <span className={styles.tagline}>{module.tagline}</span>
                  </span>
                </SpotlightCard>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <main className={styles.panel}>
        <Reveal className={styles.form} distance={20} duration={0.9} delay={0.2}>
          <h2 className={styles.formTitle}>{confirming ? 'Confirm your email' : 'Sign in'}</h2>
          <p className={styles.formLead}>
            {confirming ? 'One last step.' : 'Welcome back. Your workspace is where you left it.'}
          </p>

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
            <div>
              <p className={styles.demoTitle}>Just looking?</p>
              <p className={styles.muted}>
                Open the workspace with sample data. No account, nothing saved, and you can switch
                between roles to see what each one sees.
              </p>
            </div>
            <Button asChild variant="glow" rightIcon={<ArrowRightIcon size={16} />}>
              <a href="/?demo=1">Try the demo</a>
            </Button>
          </div>

          <p className={styles.site}>
            New here? <a href={runtime.siteUrl}>Read what My-Trove is on our site</a>.
          </p>
        </Reveal>
      </main>
    </div>
  )
}

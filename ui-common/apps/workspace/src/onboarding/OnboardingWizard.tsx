import { Button, Checkbox, Container, KeyCut, Logo, Stepper } from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModuleMark } from '../components/ModuleMark'
import { usePageTitle } from '../lib/usePageTitle'
import { canOpen, isProduct, moduleBase } from '../modules/registry'
import { useWorkspace } from '../workspace/context'
import { firstActionFor } from './firstActions'
import { useOnboarding } from './OnboardingProvider'
import styles from './OnboardingWizard.module.css'

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'products', label: 'Your products' },
  { id: 'start', label: 'First steps' },
] as const

const TITLES = [
  'Welcome to My-Trove',
  'Which products will you use first?',
  'Start with one small thing',
] as const

/**
 * The first-sign-in wizard: what My-Trove is, which products to pin, and one concrete first action
 * for each. It can be skipped at any point and re-opened from Account.
 */
export function OnboardingWizard() {
  const { modules } = useWorkspace()
  const session = useWorkspaceSession()
  const onboarding = useOnboarding()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const available = modules.filter((module) => isProduct(module) && canOpen(module, session))
  const [picked, setPicked] = useState<string[]>(() =>
    onboarding.pinned.filter((id) => available.some((module) => module.id === id)),
  )
  const title = TITLES[step] ?? TITLES[0]
  usePageTitle('Welcome')

  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    heading.current?.focus()
  }, [step])

  const toggle = (id: string, on: boolean) =>
    setPicked((current) =>
      on ? [...current.filter((x) => x !== id), id] : current.filter((x) => x !== id),
    )

  const pinnedModules = picked
    .map((id) => available.find((module) => module.id === id))
    .filter((module) => module !== undefined)

  const finish = (to?: string) => {
    onboarding.complete(picked)
    void navigate(to ?? '/')
  }

  return (
    <div className={styles.page}>
      <header className={styles.band} data-surface="vault">
        <Container size="narrow" className={styles.bandInner}>
          <div className={styles.topline}>
            <Logo size="md" />
            <Button variant="ghost" size="sm" onClick={onboarding.skip}>
              Skip for now
            </Button>
          </div>
          <Stepper
            steps={STEPS}
            current={step}
            label="Getting started"
            onStepSelect={(index) => setStep(index)}
            className={styles.stepper}
          />
        </Container>
        <KeyCut className={styles.keycut} height={18} />
      </header>

      <main className={styles.main} aria-labelledby="onboarding-title">
        <Container size="narrow">
          <h1 id="onboarding-title" ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h1>

          {step === 0 ? (
            <>
              <p className={styles.lead}>
                My-Trove is one private workspace for the paperwork and promises of a household.
              </p>
              <ul className={styles.facts}>
                <li>
                  <strong>Several products, one sign-in.</strong> Follow-ups, consent, home
                  monitoring, private search, legacy planning and the household ledger live side by
                  side.
                </li>
                <li>
                  <strong>You decide who sees what.</strong> Consent lets you share part of your
                  data with a person or an app, and take it back.
                </li>
                <li>
                  <strong>Today shows what needs you.</strong> A due follow-up, an alert or a
                  reminder from any product lands in one list.
                </li>
              </ul>
              <div className={styles.actions}>
                <Button size="lg" onClick={() => setStep(1)}>
                  Choose your products
                </Button>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className={styles.lead}>
                Pinned products come first in the sidebar. Every product stays available; this only
                changes the order, and you can change it later from Account.
              </p>
              {available.length === 0 ? (
                <p className={styles.muted}>Your role does not include any products yet.</p>
              ) : (
                <fieldset className={styles.choices}>
                  <legend className={styles.legend}>Products to pin</legend>
                  {available.map((module) => (
                    <div key={module.id} className={styles.choice}>
                      <ModuleMark module={module} size={36} />
                      <Checkbox
                        label={module.title}
                        description={module.tagline}
                        checked={picked.includes(module.id)}
                        onCheckedChange={(state) => toggle(module.id, state === true)}
                      />
                    </div>
                  ))}
                </fieldset>
              )}
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button size="lg" onClick={() => setStep(2)}>
                  {picked.length === 0 ? 'Continue without pinning' : 'Continue'}
                </Button>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              {pinnedModules.length === 0 ? (
                <p className={styles.lead}>
                  You have not pinned a product. Today will show what needs you once you start using
                  one, and the command palette (Ctrl or Cmd plus K) finds any page.
                </p>
              ) : (
                <>
                  <p className={styles.lead}>
                    One concrete first step for each product you pinned.
                  </p>
                  <ul className={styles.firstSteps}>
                    {pinnedModules.map((module) => {
                      const action = firstActionFor(module)
                      return (
                        <li key={module.id} className={styles.firstStep}>
                          <ModuleMark module={module} size={36} />
                          <div className={styles.firstStepText}>
                            <h2>{action.title}</h2>
                            <p>
                              {module.title}. {action.description}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`${action.title} in ${module.title}`}
                            onClick={() =>
                              finish(
                                action.to === '/'
                                  ? moduleBase(module)
                                  : `${moduleBase(module)}${action.to}`,
                              )
                            }
                          >
                            Start
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button size="lg" onClick={() => finish()}>
                  Open Today
                </Button>
              </div>
            </>
          ) : null}
        </Container>
      </main>
    </div>
  )
}

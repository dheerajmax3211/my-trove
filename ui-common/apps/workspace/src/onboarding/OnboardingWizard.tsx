import {
  ArrowRightIcon,
  Badge,
  Button,
  Checkbox,
  Logo,
  Reveal,
  SpotlightCard,
  Stagger,
  Stepper,
} from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
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

  /** The whole card toggles; the checkbox inside stays the accessible control. */
  const clickCard = (event: MouseEvent, id: string) => {
    if ((event.target as HTMLElement).closest('button, label, input, a')) return
    toggle(id, !picked.includes(id))
  }

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <header className={styles.top}>
          <Logo size="md" />
          <div className={styles.topEnd}>
            {session.isDemo ? <Badge variant="warning">Demo data</Badge> : null}
            <Button variant="ghost" size="sm" onClick={onboarding.skip}>
              Skip for now
            </Button>
          </div>
        </header>

        <Stepper
          steps={STEPS}
          current={step}
          label="Getting started"
          onStepSelect={(index) => setStep(index)}
          className={styles.stepper}
        />

        <main className={styles.main} aria-labelledby="onboarding-title">
          <div key={step} className={styles.step}>
            <h1 id="onboarding-title" ref={heading} tabIndex={-1} className={styles.title}>
              {title}
            </h1>

            {step === 0 ? (
              <>
                <p className={styles.lead}>
                  My-Trove is one private workspace for the paperwork and promises of a household.
                </p>
                <Stagger as="ul" className={styles.facts} interval={0.1} distance={20}>
                  <li>
                    <strong>Several products, one sign-in.</strong> Follow-ups, consent, home
                    monitoring, private search, legacy planning and the household ledger live side
                    by side.
                  </li>
                  <li>
                    <strong>You decide who sees what.</strong> Consent lets you share part of your
                    data with a person or an app, and take it back.
                  </li>
                  <li>
                    <strong>Today shows what needs you.</strong> A due follow-up, an alert or a
                    reminder from any product lands in one list.
                  </li>
                </Stagger>
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
                  Pinned products come first in the sidebar. Every product stays available; this
                  only changes the order, and you can change it later from Account.
                </p>
                {available.length === 0 ? (
                  <p className={styles.muted}>Your role does not include any products yet.</p>
                ) : (
                  <fieldset className={styles.choices}>
                    <legend className={styles.legend}>Products to pin</legend>
                    <Stagger as="div" className={styles.grid} interval={0.06} distance={16}>
                      {available.map((module) => {
                        const on = picked.includes(module.id)
                        return (
                          <SpotlightCard
                            key={module.id}
                            className={styles.choice}
                            tilt={2}
                            radius={240}
                            data-picked={on || undefined}
                            data-product={module.id}
                            onClick={(event) => clickCard(event, module.id)}
                          >
                            <ModuleMark module={module} size={44} />
                            <Checkbox
                              label={module.title}
                              description={module.tagline}
                              checked={on}
                              onCheckedChange={(state) => toggle(module.id, state === true)}
                            />
                          </SpotlightCard>
                        )
                      })}
                    </Stagger>
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
                    You have not pinned a product. Today will show what needs you once you start
                    using one, and the command palette (Ctrl or Cmd plus K) finds any page.
                  </p>
                ) : (
                  <>
                    <p className={styles.lead}>
                      One concrete first step for each product you pinned.
                    </p>
                    <Stagger as="ul" className={styles.firstSteps} interval={0.08} distance={16}>
                      {pinnedModules.map((module) => {
                        const action = firstActionFor(module)
                        return (
                          <li key={module.id} className={styles.firstStep}>
                            <ModuleMark module={module} size={44} />
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
                    </Stagger>
                  </>
                )}
                <div className={styles.actions}>
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button size="lg" onClick={() => finish()} rightIcon={<ArrowRightIcon size={18} />}>
                    Open Today
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </main>
        <Reveal className={styles.foot} delay={0.4} direction="none">
          <p>Step {step + 1} of {STEPS.length}. You can change all of this later from Account.</p>
        </Reveal>
      </div>
    </div>
  )
}

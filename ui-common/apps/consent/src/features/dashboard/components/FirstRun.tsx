import { Button, Illustration, PlusIcon } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'

const STEPS = [
  {
    title: 'Put a fact in your vault',
    text: 'Store it under a path such as profile.sizes.shoe and mark how sensitive it is.',
  },
  {
    title: 'An app asks for one slice',
    text: 'It names the paths it wants, why, and for how long. The request lands here, and nothing is shared yet.',
  },
  {
    title: 'You decide',
    text: 'Approve all of it, narrow it, or deny it. Every read is logged in a chain you can verify, and you can revoke access at any time.',
  },
]

/** The first-run page: what consent means here, in plain words, and the one thing to do first. */
export function FirstRun() {
  return (
    <section className="firstrun" aria-labelledby="firstrun-title">
      <div className="firstrun-art" aria-hidden="true">
        <Illustration name="key" size={280} />
      </div>
      <div className="firstrun-text">
        <h2 id="firstrun-title" className="firstrun-title">
          Your data stays in your vault until you say otherwise
        </h2>
        <p className="firstrun-lead">
          Consent is where you keep facts about yourself, like a shoe size or an allergy, and lend
          an app one slice of them for a set time. You can take it back whenever you like.
        </p>
        <ol className="firstrun-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <div className="row-wrap">
          <Button leftIcon={<PlusIcon size={18} />} asChild>
            <ModuleLink to="/vault?add=1">Add your first attribute</ModuleLink>
          </Button>
        </div>
      </div>
    </section>
  )
}

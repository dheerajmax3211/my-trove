import { Button, Illustration, Stepper } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'

const STEPS = [
  {
    id: 'write',
    label: 'Write what you want to leave',
    description:
      'Where your accounts are, instructions, a letter, a password. It is locked in this browser before anything is uploaded.',
  },
  {
    id: 'trust',
    label: 'Choose the people you trust',
    description:
      'Each trustee gets one piece of the key. You decide how many must agree, so no one person can open it alone.',
  },
  {
    id: 'run',
    label: 'Check in, or let it run',
    description:
      'Tap "I\'m here" now and then. If you stop, you are reminded first. Only after trustees approve, and a cool-off passes, can they open the vault.',
  },
]

/** Shown before there is a vault: what this product is, in plain words, and what is locked where. */
export function FirstRun() {
  return (
    <div className="page-stack">
      <section
        className="switch-hero pp-grain first-run-hero"
        data-surface="vault"
        aria-labelledby="first-run-title"
      >
        <div className="switch-hero-body">
          <h1 id="first-run-title" className="switch-hero-title">
            You have no vault yet
          </h1>
          <p className="switch-hero-detail">
            Digital Legacy keeps what your family would need if you were no longer around, and hands
            it to the people you choose only if you stop checking in. Until then, nobody can read
            it, including us.
          </p>
          <div className="switch-actions">
            <Button asChild size="lg" className="checkin-button">
              <ModuleLink to="/vault">Create your vault</ModuleLink>
            </Button>
          </div>
          <p className="switch-hero-note">
            Creating the vault does not start anything. The switch stays off until you arm it.
          </p>
        </div>
        <div className="first-run-art" aria-hidden="true">
          <Illustration name="locked" size={260} />
        </div>
      </section>

      <section className="ladder" aria-labelledby="how-title">
        <h2 className="section-title" id="how-title">
          How it works
        </h2>
        <Stepper
          label="How Digital Legacy works"
          orientation="vertical"
          current={0}
          steps={STEPS}
          className="how-steps"
        />
      </section>

      <section className="split" aria-labelledby="where-title">
        <h2 className="section-title" id="where-title">
          What is locked, and where
        </h2>
        <div className="split-columns">
          <div className="stack-2">
            <h3 className="split-heading">Stays on your device</h3>
            <ul className="plain-list">
              <li>Everything you write in the vault</li>
              <li>The key that locks it, held only in memory while you work</li>
              <li>The passphrase that protects your key file</li>
            </ul>
          </div>
          <div className="stack-2">
            <h3 className="split-heading">What the server holds</h3>
            <ul className="plain-list">
              <li>The vault as scrambled ciphertext it cannot read</li>
              <li>Each trustee&apos;s piece of the key, sealed so only that trustee can open it</li>
              <li>Who your trustees are, and when you check in</li>
            </ul>
          </div>
        </div>
        <p className="small muted">
          If you lose your key file and forget its passphrase, nobody can recover it for you. You
          will be asked to save a backup before the vault is created.
        </p>
      </section>
    </div>
  )
}

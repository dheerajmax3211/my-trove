import { BentoCard, LockIcon, ShieldIcon } from '@platform/ui'
import type { CSSProperties } from 'react'

interface Slot {
  className?: string
  style?: CSSProperties
}

/**
 * A padlock drawn in SVG. When the key is in memory the shackle is lifted and the ring around it glows; when the
 * vault is locked the shackle drops shut. The state is also said in words next to it, so the drawing is decoration.
 */
export function LiveLock({ open }: { open: boolean }) {
  return (
    <svg
      className="dl-lock"
      data-open={open ? 'true' : 'false'}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="dl-lock-halo" cx="60" cy="60" r="54" />
      <path className="dl-lock-shackle" d="M42 54V40a18 18 0 0 1 36 0v14" />
      <rect className="dl-lock-body" x="30" y="52" width="60" height="42" rx="10" />
      <circle className="dl-lock-hole" cx="60" cy="70" r="5" />
      <rect className="dl-lock-hole" x="58" y="72" width="4" height="12" rx="2" />
    </svg>
  )
}

/**
 * Always visible on the vault page: whether the key is in memory right now, and what stays on this device and what
 * is uploaded, in three plain facts.
 */
export function LocalEncryptionNotice({
  unlocked,
  className,
  style,
}: { unlocked: boolean } & Slot) {
  return (
    <BentoCard
      tone="dark"
      span={4}
      rowSpan={2}
      title="Locked on this device"
      icon={<LockIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="dl-encryption">
        <div className="dl-lock-row">
          <LiveLock open={unlocked} />
          <p role="status" className="dl-lock-state">
            <strong>{unlocked ? 'Key in memory' : 'Vault locked'}</strong>
            <span>
              {unlocked
                ? 'Readable and editable until you lock, sign out or reload.'
                : 'The key is not in this browser. Nothing can be read.'}
            </span>
          </p>
        </div>
        <p className="dl-enc-text">
          What you write is turned into ciphertext in this browser with AES-256-GCM, under a random
          key that never leaves it. The server receives only the ciphertext, a nonce and the
          algorithm name. It cannot read your vault, and neither can we.
        </p>
        <ul className="sealed-facts">
          <li>
            <strong>Written here</strong>
            <span>Your text exists only in this tab while you edit.</span>
          </li>
          <li>
            <strong>Locked here</strong>
            <span>The key is held in memory and is wiped when you lock, sign out or reload.</span>
          </li>
          <li>
            <strong>Never stored</strong>
            <span>Your text and key are not written to local storage, cookies or logs.</span>
          </li>
        </ul>
      </div>
    </BentoCard>
  )
}

const BACKUP_STEPS: { title: string; text: string }[] = [
  {
    title: 'Choose a passphrase',
    text: 'It protects your key file. Pick something you can remember and that nobody else knows.',
  },
  {
    title: 'Download the key file',
    text: 'Saving the vault asks for this once. The file is encrypted with your passphrase.',
  },
  {
    title: 'Keep it somewhere safe',
    text: 'A password manager or a USB stick in a drawer. It is the only way back in after you lock.',
  },
]

/** Why a key file exists, as the three steps you will go through when you save the vault. */
export function BackupStepsCard({ className, style }: Slot) {
  return (
    <BentoCard
      span={8}
      title="Back up your key"
      icon={<ShieldIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <ol className="dl-steps">
        {BACKUP_STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="dl-step-n" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <strong>{step.title}</strong>
              <span className="small muted">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </BentoCard>
  )
}

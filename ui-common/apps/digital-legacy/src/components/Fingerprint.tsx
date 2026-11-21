import { formatFingerprint } from '../crypto'

/** A key fingerprint in groups of four, big enough to read aloud over the phone. */
export function Fingerprint({ value, label }: { value: string; label: string }) {
  return (
    <p className="fingerprint" aria-label={label}>
      {formatFingerprint(value)}
    </p>
  )
}

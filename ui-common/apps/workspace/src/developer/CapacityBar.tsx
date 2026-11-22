import type { Capacity } from './limits'
import styles from './Developer.module.css'

/** A used-of-limit meter in words and a bar. The words carry the meaning; the colour only backs them up. */
export function CapacityBar({ label, capacity }: { label: string; capacity: Capacity }) {
  const percent = capacity.limit === 0 ? 100 : Math.min(100, (capacity.used / capacity.limit) * 100)
  return (
    <div className={styles.stack}>
      <p className={styles.row}>
        <strong>{label}</strong>
        <span>
          {capacity.used} of {capacity.limit}
        </span>
        {capacity.full ? (
          <span className={styles.muted}>Full. Revoke one to add another.</span>
        ) : null}
      </p>
      <div
        className={`${styles.meter} ${capacity.full ? styles.meterFull : ''}`}
        role="img"
        aria-label={`${label}: ${capacity.used} of ${capacity.limit} used`}
      >
        <span className={styles.meterFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

import { PlusIcon, Reveal, cx } from '@platform/ui'
import { useId, useState } from 'react'
import { faq } from '../content/faq'
import styles from './Faq.module.css'

/** Questions people ask, as a smooth accordion: one answer open at a time. */
export function Faq() {
  const base = useId()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section id="faq" className={`st-wrap st-section ${styles.section}`} aria-labelledby="faq-title">
      <Reveal className={styles.head}>
        <h2 id="faq-title" className="st-h2">
          Questions people ask
        </h2>
      </Reveal>
      <Reveal delay={0.1} className={styles.list}>
        {faq.map((item, index) => {
          const isOpen = open === index
          const buttonId = `${base}-q${index}`
          const panelId = `${base}-a${index}`
          return (
            <div key={item.question} className={cx(styles.item, isOpen && styles.open)}>
              <h3 className={styles.question}>
                <button
                  type="button"
                  id={buttonId}
                  className={styles.button}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  <span>{item.question}</span>
                  <span className={styles.icon} aria-hidden="true">
                    <PlusIcon size={20} />
                  </span>
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className={styles.panel}
                data-open={isOpen ? 'true' : 'false'}
              >
                <div className={styles.clip}>
                  <p className={styles.answer}>{item.answer}</p>
                </div>
              </div>
            </div>
          )
        })}
      </Reveal>
    </section>
  )
}

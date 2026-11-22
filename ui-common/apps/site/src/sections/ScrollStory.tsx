import { ProductMark, Reveal, useScrollStory } from '@platform/ui'
import { useRef, type CSSProperties } from 'react'
import { products } from '../content/products'
import styles from './ScrollStory.module.css'

const steps = [
  {
    title: 'Six products, one vault',
    text: 'Waiting On, Consent, Home Pulse, Ask Your Life, Digital Legacy and Family Treasury each keep one kind of paperwork. You sign in once.',
  },
  {
    title: 'One gateway in front',
    text: 'Every request passes the same gateway. It works out who is calling, what they may do and which plan they are on, then counts the call.',
  },
  {
    title: 'You decide who sees what',
    text: 'An app or a person sees the slice you approve, for as long as you choose. Anything else is refused and logged.',
  },
  {
    title: 'And you can take it back',
    text: 'Revoke a grant and the next read is refused, even if the app still holds a token.',
  },
] as const

const PRODUCT_Y = (i: number) => 31 + i * 72
const VIEWER_Y = [60, 200, 340] as const

/**
 * The pinned scroll story. On a wide screen the section pins and the scroll position scrubs a
 * timeline: the products appear, join the gateway, and the gateway hands out narrow, revocable
 * slices. Without JavaScript, on a phone or under reduced motion it is a complete static layout
 * (the diagram in its final state, the four steps as a list), and the timeline never runs.
 */
export function ScrollStory() {
  const ref = useRef<HTMLElement>(null)

  useScrollStory(ref, ({ gsap, root }) => {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 56rem) and (min-height: 34rem)', () => {
      const q = gsap.utils.selector(root)
      root.dataset.story = 'on'

      gsap.set(q('[data-product]'), { autoAlpha: 0, x: -30 })
      gsap.set(q('[data-in]'), { strokeDashoffset: 1 })
      gsap.set(q('[data-out-1], [data-out-2]'), { strokeDashoffset: 1 })
      gsap.set(q('[data-out-3]'), { strokeDashoffset: 1 })
      gsap.set(q('[data-gateway]'), { autoAlpha: 0, scale: 0.6, transformOrigin: '500px 200px' })
      gsap.set(q('[data-viewer]'), { autoAlpha: 0, x: 30 })
      gsap.set(q('[data-ended]'), { autoAlpha: 0 })
      gsap.set(q('[data-step]'), { autoAlpha: 0, y: 24 })
      gsap.set(q('[data-step="0"]'), { autoAlpha: 1, y: 0 })
      gsap.set(q('[data-tick]'), { scaleX: 0, transformOrigin: '0 50%' })

      const tl = gsap.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: root,
          pin: true,
          scrub: 0.7,
          start: 'top top',
          end: () => `+=${Math.round(window.innerHeight * 3.4)}`,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })

      const swap = (from: number, to: number, at: string) => {
        tl.to(q(`[data-step="${from}"]`), { autoAlpha: 0, y: -24, duration: 0.4 }, at)
        tl.fromTo(
          q(`[data-step="${to}"]`),
          { autoAlpha: 0, y: 24 },
          { autoAlpha: 1, y: 0, duration: 0.5 },
          `${at}+=0.35`,
        )
      }

      // 1. The products arrive.
      tl.to(q('[data-product]'), { autoAlpha: 1, x: 0, stagger: 0.12, duration: 0.6 }, 0.1)
      tl.to(q('[data-tick="0"]'), { scaleX: 1, duration: 1 }, 0)
      // 2. They meet the gateway.
      swap(0, 1, '>+=0.3')
      tl.to(
        q('[data-gateway]'),
        { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'back.out(1.6)' },
        '<+=0.2',
      )
      tl.to(q('[data-in]'), { strokeDashoffset: 0, stagger: 0.1, duration: 0.7 }, '<+=0.1')
      tl.to(q('[data-tick="1"]'), { scaleX: 1, duration: 1 }, '<')
      // 3. You decide.
      swap(1, 2, '>+=0.5')
      tl.to(q('[data-viewer]'), { autoAlpha: 1, x: 0, stagger: 0.12, duration: 0.6 }, '<+=0.3')
      tl.to(
        q('[data-out-1], [data-out-2]'),
        { strokeDashoffset: 0, stagger: 0.12, duration: 0.8 },
        '<+=0.3',
      )
      tl.to(q('[data-out-3]'), { strokeDashoffset: 0.72, duration: 0.5 }, '<+=0.2')
      tl.to(q('[data-tick="2"]'), { scaleX: 1, duration: 1 }, '<')
      // 4. And you take it back.
      swap(2, 3, '>+=0.5')
      tl.to(q('[data-out-2]'), { strokeDashoffset: -1, duration: 0.7 }, '<+=0.3')
      tl.to(q('[data-granted="1"]'), { autoAlpha: 0, duration: 0.3 }, '<')
      tl.to(q('[data-ended]'), { autoAlpha: 1, duration: 0.4 }, '<+=0.3')
      tl.to(q('[data-tick="3"]'), { scaleX: 1, duration: 1 }, '<')
      tl.to({}, { duration: 0.6 })

      return () => {
        delete root.dataset.story
      }
    })
    return () => mm.revert()
  })

  return (
    <section
      ref={ref}
      id="how-it-works"
      className={`st-dark ${styles.story}`}
      data-theme="dark"
      aria-labelledby="story-title"
    >
      <div className={`st-wrap ${styles.stage}`}>
        <Reveal className={styles.head}>
          <h2 id="story-title" className={styles.title}>
            One gateway, six products. You decide who sees what.
          </h2>
        </Reveal>

        <div className={styles.diagramWrap}>
          <svg
            className={styles.diagram}
            viewBox="0 0 1000 400"
            role="img"
            aria-label="Six products on the left connect to one gateway in the middle. From the gateway, a line reaches you and a sample app, each with exactly the access you approved, and a line to someone else stops short because nothing was shared. You can end the app's access at any time."
          >
            {products.map((p, i) => (
              <path
                key={p.id}
                data-in=""
                d={`M230 ${PRODUCT_Y(i)} C 330 ${PRODUCT_Y(i)}, 340 200, 432 200`}
                pathLength={1}
                className={styles.inPath}
                style={{ '--c': `var(--pp-color-product-${p.id})` } as CSSProperties}
              />
            ))}
            {VIEWER_Y.map((y, i) => (
              <path
                key={y}
                {...{ [`data-out-${i + 1}`]: '' }}
                d={`M568 200 C 670 200, 670 ${y}, 770 ${y}`}
                pathLength={1}
                className={i === 2 ? styles.blocked : styles.outPath}
              />
            ))}

            {products.map((p, i) => (
              <g key={p.id} transform={`translate(0 ${PRODUCT_Y(i) - 23})`}>
                <g data-product="" className={styles.productNode}>
                  <rect width="230" height="46" rx="23" className={styles.pill} />
                  <circle cx="26" cy="23" r="8" fill={`var(--pp-color-product-${p.id})`} />
                  <text x="46" y="28" className={styles.nodeText}>
                    {p.name}
                  </text>
                </g>
              </g>
            ))}

            <g data-gateway="" className={styles.gateway}>
              <circle cx="500" cy="200" r="86" className={styles.gateHalo} />
              <circle cx="500" cy="200" r="68" className={styles.gateRing} />
              <circle cx="500" cy="200" r="48" className={styles.gateCore} />
              <path
                d="M500 182a13 13 0 0 1 6 24.6l2.8 22.4h-17.6l2.8-22.4A13 13 0 0 1 500 182Z"
                fill="var(--pp-color-lime)"
              />
              <text x="500" y="316" textAnchor="middle" className={styles.gateLabel}>
                The gateway
              </text>
            </g>

            {[
              { y: VIEWER_Y[0], name: 'You', sub: 'Everything you keep' },
              {
                y: VIEWER_Y[1],
                name: 'Shoe Finder, a sample app',
                sub: 'Your shoe size, for 30 days',
              },
              { y: VIEWER_Y[2], name: 'Someone else', sub: 'Nothing: not shared' },
            ].map((v, i) => (
              <g key={v.name} transform={`translate(770 ${v.y - 30})`}>
                <g data-viewer="" className={styles.viewer}>
                  <rect width="230" height="60" rx="18" className={styles.pill} />
                  <text x="20" y="26" className={styles.nodeText}>
                    {v.name}
                  </text>
                  <text x="20" y="46" className={styles.subText} data-granted={i}>
                    {v.sub}
                  </text>
                  {i === 1 ? (
                    <text x="20" y="46" className={styles.endText} data-ended="">
                      Access ended
                    </text>
                  ) : null}
                </g>
              </g>
            ))}
          </svg>
        </div>

        <div className={styles.captions}>
          <div className={styles.ticks} aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={styles.tickTrack}>
                <span data-tick={i} className={styles.tick} />
              </span>
            ))}
          </div>
          <ol className={styles.steps}>
            {steps.map((step, i) => (
              <li key={step.title} data-step={i} className={styles.step}>
                <span className={styles.stepNo} aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepText}>{step.text}</p>
                  {i === 0 ? (
                    <ul className={styles.marks} aria-label="The six products">
                      {products.map((p) => (
                        <li key={p.id}>
                          <ProductMark product={p.id} size={32} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

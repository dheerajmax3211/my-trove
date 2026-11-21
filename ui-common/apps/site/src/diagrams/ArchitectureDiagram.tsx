import { useId } from 'react'
import { products } from '../content/products'
import styles from './ArchitectureDiagram.module.css'

const SERVICE_TOP = 142
const ROW = 29

/**
 * The request path in one picture: who calls, the gateway that checks and counts, the services
 * behind it, and where the usage events go. Everything drawn here exists; the dashed box is the
 * one thing that does not yet (API keys arrive with the developer portal).
 */
export function ArchitectureDiagram() {
  const id = useId()
  const arrow = `${id}-arrow`
  const titleId = `${id}-title`
  const descId = `${id}-desc`

  return (
    <svg
      className={styles.svg}
      viewBox="0 0 900 470"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      focusable="false"
    >
      <title id={titleId}>How a request travels through My-Trove</title>
      <desc id={descId}>
        Callers (you in the workspace, and apps you approved) send requests to the gateway. The
        gateway checks the credential with the auth service, then forwards to the six products and
        the shared service. Each call is also published to Kafka, which the platform service turns
        into usage analytics, plans and quotas stored in TimescaleDB.
      </desc>
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M1 1.5L8 5L1 8.5" className={styles.arrowHead} />
        </marker>
      </defs>

      {/* callers */}
      <g>
        <rect className={styles.box} x="16" y="70" width="190" height="64" rx="12" />
        <text className={styles.strong} x="34" y="97">
          You, in the workspace
        </text>
        <text className={styles.small} x="34" y="117">
          Firebase sign-in
        </text>

        <rect className={styles.box} x="16" y="156" width="190" height="64" rx="12" />
        <text className={styles.strong} x="34" y="183">
          An app you approved
        </text>
        <text className={styles.small} x="34" y="203">
          Consent access token
        </text>

        <rect className={styles.ghost} x="16" y="242" width="190" height="64" rx="12" />
        <text className={styles.strong} x="34" y="269">
          An API key
        </text>
        <text className={styles.small} x="34" y="289">
          With the developer portal
        </text>
      </g>

      {/* callers to gateway */}
      <g className={styles.line}>
        <path d="M206 102H290" markerEnd={`url(#${arrow})`} />
        <path d="M206 188H290" markerEnd={`url(#${arrow})`} />
      </g>
      <path className={styles.ghostLine} d="M206 274H290" />

      {/* gateway */}
      <g>
        <rect className={styles.gateway} x="292" y="40" width="256" height="300" rx="16" />
        <rect className={styles.brass} x="316" y="40" width="56" height="5" rx="2" />
        <text className={styles.heading} x="316" y="82">
          Gateway
        </text>
        <text className={styles.small} x="316" y="104">
          The only public entrance
        </text>
        {[
          'Checks who is calling',
          'Swaps it for a platform token',
          'Checks the permission',
          'Applies the plan limits',
          'Counts the call',
        ].map((line, i) => (
          <g key={line}>
            <circle className={styles.dot} cx="324" cy={142 + i * 36} r="4" />
            <text className={styles.body} x="340" y={147 + i * 36}>
              {line}
            </text>
          </g>
        ))}
      </g>

      {/* auth */}
      <g>
        <rect className={styles.box} x="640" y="40" width="244" height="76" rx="12" />
        <text className={styles.strong} x="658" y="68">
          Auth
        </text>
        <text className={styles.small} x="658" y="88">
          Roles, permissions, token swap,
        </text>
        <text className={styles.small} x="658" y="104">
          public keys
        </text>
      </g>
      <path
        className={styles.line}
        d="M548 78H640"
        markerStart={`url(#${arrow})`}
        markerEnd={`url(#${arrow})`}
      />

      {/* services */}
      <g>
        <rect className={styles.box} x="640" y="130" width="244" height="228" rx="12" />
        <text className={styles.strong} x="658" y="155">
          Products and shared service
        </text>
        {products.map((product, i) => (
          <g key={product.id}>
            <rect
              x="658"
              y={SERVICE_TOP + 22 + i * ROW}
              width="4"
              height="18"
              rx="2"
              style={{ fill: `var(--pp-color-product-${product.id})` }}
            />
            <text className={styles.body} x="674" y={SERVICE_TOP + 36 + i * ROW}>
              {product.name}
            </text>
          </g>
        ))}
        <rect
          x="658"
          y={SERVICE_TOP + 22 + products.length * ROW}
          width="4"
          height="18"
          rx="2"
          className={styles.neutralBar}
        />
        <text className={styles.body} x="674" y={SERVICE_TOP + 36 + products.length * ROW}>
          Households, reminders, files
        </text>
      </g>
      <path className={styles.line} d="M548 236H640" markerEnd={`url(#${arrow})`} />

      {/* usage path */}
      <path className={styles.line} d="M420 340V396" markerEnd={`url(#${arrow})`} />
      <text className={styles.small} x="432" y="372">
        a usage event per call
      </text>

      <g>
        <rect className={styles.box} x="326" y="398" width="188" height="56" rx="12" />
        <text className={styles.strong} x="344" y="422">
          Kafka
        </text>
        <text className={styles.small} x="344" y="440">
          platform.usage.v1
        </text>
      </g>
      <path className={styles.line} d="M514 426H580" markerEnd={`url(#${arrow})`} />
      <g>
        <rect className={styles.box} x="582" y="398" width="188" height="56" rx="12" />
        <text className={styles.strong} x="600" y="422">
          Platform service
        </text>
        <text className={styles.small} x="600" y="440">
          Usage, plans, quotas
        </text>
      </g>
      <path className={styles.line} d="M770 426H810" markerEnd={`url(#${arrow})`} />
      <g>
        <rect className={styles.box} x="812" y="398" width="72" height="56" rx="12" />
        <text className={styles.strong} x="826" y="422">
          Time
        </text>
        <text className={styles.strong} x="826" y="440">
          series
        </text>
      </g>
    </svg>
  )
}

import { PageHeader } from '@platform/ui'
import {
  contrastRatio,
  productIds,
  productKey,
  productNames,
  layout,
  spacing,
  radius,
  textStyles,
  themes,
  lightShadows,
  darkShadows,
  motion,
  type ThemeColors,
  type ThemeName,
} from '@platform/tokens'
import { ThemePanel } from '../components/Playground'

const textPairs: [keyof ThemeColors, keyof ThemeColors][] = [
  ['text', 'canvas'],
  ['textMuted', 'canvas'],
  ['textSubtle', 'canvas'],
  ['onAccent', 'accent'],
  ['accentText', 'canvas'],
  ['dangerText', 'surface'],
  ['successText', 'surface'],
  ['warningText', 'surface'],
  ['infoText', 'surface'],
  ['brassText', 'surface'],
  ['onVault', 'vault'],
  ['onVaultMuted', 'vault'],
  ['vaultAccent', 'vault'],
  ['vaultBrass', 'vault'],
]

const isProduct = (k: string) => k.startsWith('product')
const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)

function Swatches({ theme }: { theme: ThemeName }) {
  const colors = themes[theme].colors
  return (
    <div className="sw-grid">
      {(Object.keys(colors) as (keyof ThemeColors)[])
        .filter((role) => !isProduct(role))
        .map((role) => (
          <div className="sw" key={role}>
            <div
              className="sw-chip"
              style={{
                background: `var(--pp-color-${role.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()})`,
              }}
            />
            <div className="sw-meta">
              <strong>{role}</strong>
              <code>{colors[role]}</code>
            </div>
          </div>
        ))}
    </div>
  )
}

function ProductAccents({ theme }: { theme: ThemeName }) {
  const colors = themes[theme].colors
  return (
    <table className="pg-table">
      <caption>Product accents (fill, label on fill, text on canvas, tint)</caption>
      <tbody>
        {productIds.map((id) => {
          const k = `product${cap(productKey(id))}`
          const accent = colors[k as keyof ThemeColors]
          const on = colors[`${k}On` as keyof ThemeColors]
          const text = colors[`${k}Text` as keyof ThemeColors]
          const subtle = colors[`${k}Subtle` as keyof ThemeColors]
          return (
            <tr key={id}>
              <th scope="row">{productNames[id]}</th>
              <td>
                <span className="pg-chip" style={{ background: accent, color: on }}>
                  {accent}
                </span>
              </td>
              <td>
                <span className="pg-chip" style={{ background: subtle, color: text }}>
                  {contrastRatio(text, colors.canvas).toFixed(1)}:1
                </span>
              </td>
              <td>
                <strong>{contrastRatio(on, accent).toFixed(1)}:1</strong>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Contrast({ theme }: { theme: ThemeName }) {
  const colors = themes[theme].colors
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 'var(--pp-text-body-small-size)',
      }}
    >
      <caption style={{ textAlign: 'start', fontWeight: 600, paddingBottom: 8 }}>
        Contrast (WCAG AA needs 4.5:1)
      </caption>
      <tbody>
        {textPairs.map(([fg, bg]) => {
          const ratio = contrastRatio(colors[fg], colors[bg])
          return (
            <tr key={`${fg}-${bg}`}>
              <td style={{ padding: '4px 0' }}>
                <span
                  style={{
                    color: colors[fg],
                    background: colors[bg],
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  {fg} on {bg}
                </span>
              </td>
              <td style={{ textAlign: 'end' }}>
                <strong>{ratio.toFixed(2)}:1</strong> {ratio >= 4.5 ? 'pass' : 'FAIL'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function TokensPage() {
  return (
    <>
      <PageHeader
        eyebrow="Foundations"
        title="Design tokens"
        description="Paper, ink, patina and brass, with a vault that stays dark in both themes and one accent per product. Defined once as platform-neutral TypeScript, emitted as CSS variables."
      />
      <div className="pg-stack">
        <h2 className="pg-h2" style={{ marginBottom: 0 }}>
          Color roles
        </h2>
        <div className="pg-panels">
          {(['light', 'dark'] as const).map((theme) => (
            <ThemePanel key={theme} theme={theme} block>
              <div className="pg-stack">
                <Swatches theme={theme} />
                <ProductAccents theme={theme} />
                <Contrast theme={theme} />
              </div>
            </ThemePanel>
          ))}
        </div>

        <h2 className="pg-h2" style={{ marginBottom: 0 }}>
          Type scale
        </h2>
        <p className="pg-muted">
          Plus Jakarta Sans (app display and text, 400 to 800), Young Serif (public site headlines
          only) and JetBrains Mono. Display styles are fluid between a 375px and a 1280px viewport.
        </p>
        <div className="pg-stack">
          {Object.entries(textStyles).map(([name, t]) => (
            <div
              key={name}
              style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}
            >
              <code style={{ width: '6rem' }}>{name}</code>
              <span
                style={{
                  fontFamily: `var(--pp-font-${t.family})`,
                  fontSize: `var(--pp-text-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}-size)`,
                  lineHeight: `var(--pp-text-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}-line)`,
                  fontWeight: t.weight,
                  letterSpacing: `${t.tracking}em`,
                }}
              >
                Waiting on three replies
              </span>
              <span className="pg-muted">
                {t.size}/{t.lineHeight} {t.family} {t.weight}
              </span>
            </div>
          ))}
        </div>

        <div className="pg-panels">
          <div>
            <h2 className="pg-h2">Spacing (4px grid)</h2>
            {Object.entries(spacing).map(([k, v]) => (
              <div className="scale-row" key={k}>
                <code style={{ width: '3rem' }}>{k}</code>
                <div className="scale-bar" style={{ width: `var(--pp-space-${k})`, minWidth: 2 }} />
                <span className="pg-muted">{v}px</span>
              </div>
            ))}
          </div>
          <div>
            <h2 className="pg-h2">Radius</h2>
            <div className="row-wrap">
              {Object.entries(radius).map(([k, v]) => (
                <div key={k} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      background: 'var(--pp-color-accent-subtle)',
                      border: '2px solid var(--pp-color-accent)',
                      borderRadius: `var(--pp-radius-${k})`,
                    }}
                  />
                  <code>{k}</code>
                  <div className="pg-muted">{v}px</div>
                </div>
              ))}
            </div>
            <h2 className="pg-h2" style={{ marginTop: 24 }}>
              Layout widths
            </h2>
            <ul className="pg-notes">
              {Object.entries(layout).map(([k, v]) => (
                <li key={k}>
                  <code>{k}</code>: {v}px
                </li>
              ))}
            </ul>
            <h2 className="pg-h2" style={{ marginTop: 24 }}>
              Motion
            </h2>
            <ul className="pg-notes">
              {Object.entries(motion.duration).map(([k, v]) => (
                <li key={k}>
                  <code>{k}</code>: {v}ms
                </li>
              ))}
              {Object.entries(motion.easing).map(([k, v]) => (
                <li key={k}>
                  <code>{k}</code>: cubic-bezier({v.join(', ')})
                </li>
              ))}
              <li>All durations collapse to ~0 under prefers-reduced-motion.</li>
            </ul>
          </div>
        </div>

        <h2 className="pg-h2" style={{ marginBottom: 0 }}>
          Shadows
        </h2>
        <div className="pg-panels">
          {(['light', 'dark'] as const).map((theme) => (
            <ThemePanel key={theme} theme={theme}>
              {(
                Object.keys(
                  theme === 'light' ? lightShadows : darkShadows,
                ) as (keyof typeof lightShadows)[]
              ).map((k) => (
                <div
                  key={k}
                  className="shadow-tile"
                  style={{ boxShadow: `var(--pp-shadow-${k})`, width: '7rem' }}
                >
                  {k}
                </div>
              ))}
            </ThemePanel>
          ))}
        </div>
      </div>
    </>
  )
}

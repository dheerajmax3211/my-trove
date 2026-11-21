import { PageHeader } from '@platform/ui'
import {
  contrastRatio,
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
]

function Swatches({ theme }: { theme: ThemeName }) {
  const colors = themes[theme].colors
  return (
    <div className="sw-grid">
      {(Object.keys(colors) as (keyof ThemeColors)[]).map((role) => (
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
        description="Paper and verdigris: warm paper surfaces, near-black green ink, a deep verdigris accent and a burnt-orange focus ring. Defined once as platform-neutral TypeScript, emitted as CSS variables."
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
                <Contrast theme={theme} />
              </div>
            </ThemePanel>
          ))}
        </div>

        <h2 className="pg-h2" style={{ marginBottom: 0 }}>
          Type scale
        </h2>
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

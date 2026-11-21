import {
  Field,
  Input,
  PortalContainerProvider,
  Select,
  Switch,
  Card,
  CardContent,
  type SelectProps,
} from '@platform/ui'
import { useState, type ReactNode } from 'react'

export type ControlDef =
  | { name: string; label?: string; type: 'select'; options: readonly string[]; default: string }
  | { name: string; label?: string; type: 'boolean'; default: boolean }
  | { name: string; label?: string; type: 'text'; default: string }
  | { name: string; label?: string; type: 'number'; default: number; min?: number; max?: number }

export type Values = Record<string, string | boolean | number>

export function ThemePanel({
  theme,
  children,
  block,
}: {
  theme: 'light' | 'dark'
  children: ReactNode
  block?: boolean
}) {
  // Overlays (dialogs, tooltips, toasts) portal into the panel so they pick up the panel's theme.
  const [element, setElement] = useState<HTMLElement | null>(null)
  return (
    <section
      className="pg-panel"
      data-theme={theme}
      ref={setElement}
      aria-label={`${theme} theme preview`}
    >
      <div className="pg-panel-title">
        <span>{theme}</span>
      </div>
      <PortalContainerProvider container={element}>
        <div className={block ? 'pg-panel-body pg-panel-body--block' : 'pg-panel-body'}>
          {children}
        </div>
      </PortalContainerProvider>
    </section>
  )
}

export interface PlaygroundProps {
  controls: readonly ControlDef[]
  render: (values: Values) => ReactNode
  /** Lay content out as a block instead of an inline flex row (tables, tabs...). */
  block?: boolean
}

/** Live controls on top, the same component rendered in light and dark below. */
export function Playground({ controls, render, block }: PlaygroundProps) {
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(controls.map((c) => [c.name, c.default])),
  )
  const set = (name: string, value: string | boolean | number) =>
    setValues((v) => ({ ...v, [name]: value }))

  return (
    <div className="pg-stack">
      {controls.length > 0 ? (
        <Card>
          <CardContent>
            <form
              className="pg-controls"
              aria-label="Component controls"
              onSubmit={(e) => e.preventDefault()}
            >
              {controls.map((c) => {
                const label = c.label ?? c.name
                if (c.type === 'boolean')
                  return (
                    <Switch
                      key={c.name}
                      label={label}
                      checked={Boolean(values[c.name])}
                      onCheckedChange={(v) => set(c.name, v)}
                    />
                  )
                if (c.type === 'select')
                  return (
                    <Field key={c.name} label={label}>
                      <Select
                        size="sm"
                        value={String(values[c.name])}
                        onChange={
                          ((e) => set(c.name, e.target.value)) satisfies SelectProps['onChange']
                        }
                      >
                        {c.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )
                if (c.type === 'number')
                  return (
                    <Field key={c.name} label={label}>
                      <Input
                        size="sm"
                        type="number"
                        value={Number(values[c.name])}
                        min={c.min}
                        max={c.max}
                        onChange={(e) => set(c.name, Number(e.target.value))}
                      />
                    </Field>
                  )
                return (
                  <Field key={c.name} label={label}>
                    <Input
                      size="sm"
                      value={String(values[c.name])}
                      onChange={(e) => set(c.name, e.target.value)}
                    />
                  </Field>
                )
              })}
            </form>
          </CardContent>
        </Card>
      ) : null}
      <div className="pg-panels">
        <ThemePanel theme="light" block={block ?? false}>
          {render(values)}
        </ThemePanel>
        <ThemePanel theme="dark" block={block ?? false}>
          {render(values)}
        </ThemePanel>
      </div>
    </div>
  )
}

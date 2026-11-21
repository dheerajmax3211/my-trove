import { Select, useTheme, type ThemePreference } from '@platform/ui'

export function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="row-wrap small">
      <span className="hide-sm">Theme</span>
      <Select
        size="sm"
        aria-label="Theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemePreference)}
        style={{ width: 'auto' }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </div>
  )
}

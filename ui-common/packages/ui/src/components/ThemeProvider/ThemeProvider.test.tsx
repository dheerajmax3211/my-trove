import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider'

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <>
      <output data-testid="state">{`${theme}/${resolvedTheme}`}</output>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setTheme('system')}>system</button>
    </>
  )
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  window.localStorage.clear()
})

describe('ThemeProvider', () => {
  it('defaults to system and leaves data-theme unset so prefers-color-scheme applies', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('state')).toHaveTextContent('system/light')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('sets and persists an explicit theme, and clears it for system', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByText('dark'))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('pp-theme')).toBe('dark')
    await userEvent.click(screen.getByText('system'))
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('restores the persisted theme on mount', () => {
    window.localStorage.setItem('pp-theme', 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('state')).toHaveTextContent('dark/dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})

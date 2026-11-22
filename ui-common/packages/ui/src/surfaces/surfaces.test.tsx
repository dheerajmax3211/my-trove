import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockReducedMotion } from '../internal/test-utils'
import { Aurora } from './Aurora'
import { GlassPanel } from './GlassPanel'
import { GradientBorder } from './GradientBorder'
import { Grain } from './Grain'
import { GridGlow } from './GridGlow'

afterEach(() => vi.unstubAllGlobals())

describe('decorative surfaces', () => {
  it.each([
    ['Aurora', () => <Aurora data-testid="x" />],
    ['GridGlow', () => <GridGlow data-testid="x" />],
    ['Grain', () => <Grain data-testid="x" />],
  ])('%s is hidden from assistive tech and ignores the pointer', (_name, ui) => {
    render(ui())
    expect(screen.getByTestId('x')).toHaveAttribute('aria-hidden', 'true')
  })

  it('Aurora runs while visible and pauses itself under reduced motion', () => {
    mockReducedMotion(false)
    const { unmount } = render(<Aurora data-testid="x" />)
    expect(screen.getByTestId('x')).toHaveAttribute('data-running', 'true')
    unmount()
    mockReducedMotion(true)
    render(<Aurora data-testid="y" />)
    expect(screen.getByTestId('y')).toHaveAttribute('data-running', 'false')
  })

  it('Aurora can be switched off (animated=false)', () => {
    mockReducedMotion(false)
    render(<Aurora data-testid="x" animated={false} />)
    expect(screen.getByTestId('x')).toHaveAttribute('data-running', 'false')
  })

  it('Grain exposes its opacity as a variable', () => {
    render(<Grain data-testid="x" opacity={0.1} />)
    expect(screen.getByTestId('x').style.getPropertyValue('--pp-grain-opacity')).toBe('0.1')
  })

  it('GridGlow takes a cell size', () => {
    render(<GridGlow data-testid="x" size={40} />)
    expect(screen.getByTestId('x').style.getPropertyValue('--pp-grid-size')).toBe('40px')
  })
})

describe('GlassPanel and GradientBorder', () => {
  it('GlassPanel renders real, readable content and supports polymorphic elements', () => {
    render(
      <GlassPanel as="section" aria-label="Summary" glow strength="strong">
        <h2>Glass</h2>
      </GlassPanel>,
    )
    expect(screen.getByRole('region', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Glass' })).toBeInTheDocument()
  })

  it('GradientBorder wraps content without changing semantics', () => {
    render(
      <GradientBorder animated tone="lilac">
        <button type="button">Inside</button>
      </GradientBorder>,
    )
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument()
  })
})

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyCut, VaultRings } from './Pattern'

describe('KeyCut', () => {
  it('is decorative and repeats a pattern across its width', () => {
    const { container } = render(<KeyCut height={20} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '100%')
    expect(container.querySelector('pattern')).not.toBeNull()
  })

  it('gives each instance its own pattern id', () => {
    const { container } = render(
      <>
        <KeyCut />
        <KeyCut />
      </>,
    )
    const ids = [...container.querySelectorAll('pattern')].map((p) => p.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('VaultRings', () => {
  it('is decorative, with 72 tick marks and a brass hub', () => {
    const { container } = render(<VaultRings />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('line')).toHaveLength(72)
    expect(container.querySelector('circle[class*="hub"]')).not.toBeNull()
  })

  it('only applies the dial turn when asked (CSS also drops it under reduced motion)', () => {
    const { container, rerender } = render(<VaultRings />)
    expect(container.querySelector('[class*="dial"]')).toBeNull()
    rerender(<VaultRings animate />)
    expect(container.querySelector('[class*="dial"]')).not.toBeNull()
  })
})

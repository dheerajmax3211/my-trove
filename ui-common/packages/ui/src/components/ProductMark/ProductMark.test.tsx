import { productIds } from '@platform/tokens'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProductMark, type ProductMarkId } from './ProductMark'

const all: ProductMarkId[] = [...productIds, 'core', 'admin']

describe('ProductMark', () => {
  it.each(all)('renders a glyph for %s', (id) => {
    const { container } = render(<ProductMark product={id} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.firstElementChild).toHaveAttribute('data-product-mark', id)
  })

  it('is decorative by default and an image when titled', () => {
    const { rerender } = render(<ProductMark product="consent" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    rerender(<ProductMark product="consent" title="Consent" />)
    expect(screen.getByRole('img', { name: 'Consent' })).toBeInTheDocument()
  })

  it("uses the product's own accent variables, not the ambient accent", () => {
    const { container } = render(<ProductMark product="home-pulse" variant="solid" />)
    const style = (container.firstElementChild as HTMLElement).style
    expect(style.getPropertyValue('--_accent')).toBe('var(--pp-color-product-home-pulse)')
    expect(style.getPropertyValue('--_on')).toBe('var(--pp-color-product-home-pulse-on)')
  })

  it('gives each of the six products a distinct accent', () => {
    const accents = productIds.map((id) => {
      const { container, unmount } = render(<ProductMark product={id} />)
      const value = (container.firstElementChild as HTMLElement).style.getPropertyValue('--_accent')
      unmount()
      return value
    })
    expect(new Set(accents).size).toBe(6)
  })

  it('sizes the tile and the glyph', () => {
    const { container } = render(<ProductMark product="waiting-on" size={64} />)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--_size')).toBe(
      '64px',
    )
    expect(container.querySelector('svg')).toHaveAttribute('width', '35')
  })
})

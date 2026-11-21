import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar, avatarProduct, initialsOf } from './Avatar'

describe('initialsOf', () => {
  it.each([
    ['Priya Natarajan', 'PN'],
    ['sam', 'S'],
    ['alex.k@example.com', 'AK'],
    ['Mary Jane Watson', 'MW'],
    ['  ', '?'],
    ['', '?'],
  ])('%s -> %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })
})

describe('Avatar', () => {
  it('shows initials and is named after the person', () => {
    render(<Avatar name="Priya Natarajan" />)
    expect(screen.getByRole('img', { name: 'Priya Natarajan' })).toBeInTheDocument()
    expect(screen.getByText('PN')).toBeInTheDocument()
  })

  it('can be decorative when the name is written beside it', () => {
    render(<Avatar name="Priya Natarajan" decorative />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the image, and falls back to initials if it fails to load', () => {
    const { container } = render(<Avatar name="Aiko Tanaka" src="/a.png" />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/a.png')
    expect(img).toHaveAttribute('alt', '')
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('AT')).toBeInTheDocument()
  })

  it('picks the same tint for the same name, spread across the six products', () => {
    expect(avatarProduct('Priya')).toBe(avatarProduct('priya'))
    const names = ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lee']
    expect(new Set(names.map(avatarProduct)).size).toBeGreaterThan(2)
  })

  it('sizes in px and supports a square shape', () => {
    const { container } = render(<Avatar name="Dee" size="xl" shape="square" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue('--_size')).toBe('80px')
    expect(el.className).toContain('square')
  })
})

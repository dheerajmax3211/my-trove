import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from '../EmptyState/EmptyState'
import { Illustration, illustrations, type IllustrationName } from './Illustration'

const names = Object.keys(illustrations) as IllustrationName[]

describe('Illustration', () => {
  it('ships exactly six drawings', () => {
    expect(names).toHaveLength(6)
  })

  it.each(names)('%s renders an svg that is decorative by default', (name) => {
    const { container } = render(<Illustration name={name} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('viewBox', '0 0 240 180')
  })

  it('can be named with a title', () => {
    render(<Illustration name="key" title="A key on a tag" />)
    expect(screen.getByRole('img', { name: 'A key on a tag' })).toBeInTheDocument()
  })

  it('keeps its 4:3 proportion at any size', () => {
    const { container } = render(<Illustration name="empty" size={120} />)
    expect(container.querySelector('svg')).toHaveAttribute('height', '90')
  })
})

describe('EmptyState illustration slot', () => {
  it('renders the illustration above the heading, hidden from assistive tech', () => {
    render(
      <EmptyState
        illustration={<Illustration name="letter" />}
        title="Nothing waiting"
        description="You are clear."
      />,
    )
    expect(screen.getByRole('heading', { name: 'Nothing waiting' })).toBeInTheDocument()
    const art = document.querySelector('svg') as SVGElement
    expect(art.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('prefers the illustration over the icon', () => {
    render(
      <EmptyState
        icon={<svg data-testid="icon" />}
        illustration={<svg data-testid="art" />}
        title="T"
      />,
    )
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
    expect(screen.getByTestId('art')).toBeInTheDocument()
  })

  it('renders a primary and a secondary action', () => {
    render(
      <EmptyState
        title="T"
        action={<button type="button">Do it</button>}
        secondaryAction={<button type="button">Learn more</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Learn more' })).toBeInTheDocument()
  })
})

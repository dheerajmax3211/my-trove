import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Container } from '../Container/Container'
import { Section, SectionHeader } from './Section'

describe('Container', () => {
  it('renders the chosen element and width class', () => {
    render(
      <Container as="article" size="narrow" data-testid="c">
        Hello
      </Container>,
    )
    const el = screen.getByTestId('c')
    expect(el.tagName).toBe('ARTICLE')
    expect(el.className).toContain('narrow')
  })
})

describe('Section', () => {
  it('is a named landmark when labelled', () => {
    render(
      <Section aria-label="Hero">
        <p>Body</p>
      </Section>,
    )
    expect(screen.getByRole('region', { name: 'Hero' })).toBeInTheDocument()
  })

  it('the vault tone opts into the vault surface so children remap automatically', () => {
    render(
      <Section tone="vault" aria-label="Dark">
        x
      </Section>,
    )
    expect(screen.getByRole('region', { name: 'Dark' })).toHaveAttribute('data-surface', 'vault')
  })

  it('other tones do not set the vault surface', () => {
    render(
      <Section tone="paper" aria-label="Paper">
        x
      </Section>,
    )
    expect(screen.getByRole('region', { name: 'Paper' })).not.toHaveAttribute('data-surface')
  })

  it('draws decorative patterns that assistive tech ignores', () => {
    const { container } = render(
      <Section pattern="rings" aria-label="Hero">
        x
      </Section>,
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('can render full-bleed without a container', () => {
    render(
      <Section container={false} aria-label="Bleed">
        <div data-testid="child" />
      </Section>,
    )
    expect(screen.getByTestId('child').parentElement?.className).toContain('inner')
  })
})

describe('SectionHeader', () => {
  it('renders eyebrow, a single headline, description and actions', () => {
    render(
      <SectionHeader
        as="h1"
        headingId="t"
        eyebrow="Waiting On"
        title="Know who owes you"
        description="One calm list."
        actions={<button type="button">Open</button>}
      />,
    )
    const h1 = screen.getByRole('heading', { level: 1, name: 'Know who owes you' })
    expect(h1).toHaveAttribute('id', 't')
    expect(screen.getByText('Waiting On')).toBeInTheDocument()
    expect(screen.getByText('One calm list.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('defaults to an h2', () => {
    render(<SectionHeader title="Security" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Security' })).toBeInTheDocument()
  })
})

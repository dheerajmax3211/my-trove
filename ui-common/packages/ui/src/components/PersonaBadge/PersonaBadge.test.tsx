import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PersonaBadge, personas } from './PersonaBadge'

describe('PersonaBadge', () => {
  it('knows exactly the five personas', () => {
    expect(personas).toEqual(['OWNER', 'ADMIN', 'DEVELOPER', 'MEMBER', 'AUDITOR'])
  })

  it.each([
    ['OWNER', 'Owner'],
    ['ADMIN', 'Admin'],
    ['DEVELOPER', 'Developer'],
    ['MEMBER', 'Member'],
    ['AUDITOR', 'Auditor'],
  ] as const)('%s reads as text "%s" with a glyph', (persona, label) => {
    const { container } = render(<PersonaBadge persona={persona} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild).toHaveAttribute('data-persona', persona)
  })

  it('can hide the glyph; the label always remains', () => {
    const { container } = render(<PersonaBadge persona="ADMIN" hideIcon />)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })
})

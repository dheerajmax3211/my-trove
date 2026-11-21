import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '../Button/Button'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renders the title as the page h1 with description and actions', () => {
    render(
      <PageHeader
        eyebrow="Waiting On"
        title="Open requests"
        description="Things people owe you."
        actions={<Button>New</Button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Open requests' })).toBeInTheDocument()
    expect(screen.getByText('Things people owe you.')).toBeInTheDocument()
    expect(screen.getByText('Waiting On')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })
})

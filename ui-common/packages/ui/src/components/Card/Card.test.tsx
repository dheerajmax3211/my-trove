import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card'

describe('Card', () => {
  it('composes header, content and footer and renders the title as a heading', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription>Billing details</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByText('Billing details')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('lets the heading level fit the page outline', () => {
    render(<CardTitle as="h2">Section</CardTitle>)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })
})

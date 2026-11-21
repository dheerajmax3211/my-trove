import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'

function Example() {
  return (
    <Tabs defaultValue="one">
      <TabsList aria-label="Sections">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
        <TabsTrigger value="three" disabled>
          Three
        </TabsTrigger>
      </TabsList>
      <TabsContent value="one">Panel one</TabsContent>
      <TabsContent value="two">Panel two</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('shows the default panel and wires roles', () => {
    render(<Example />)
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel one')
  })

  it('switches panel on click', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel two')
  })

  it('moves between tabs with arrow keys (skipping disabled) and Home/End', async () => {
    render(<Example />)
    await userEvent.tab()
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel two')
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
  })

  it('Tab from the tablist moves focus into the active panel', async () => {
    render(<Example />)
    await userEvent.tab()
    await userEvent.tab()
    expect(screen.getByRole('tabpanel')).toHaveFocus()
  })
})

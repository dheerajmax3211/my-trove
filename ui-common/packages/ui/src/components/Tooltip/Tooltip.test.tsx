import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Button } from '../Button/Button'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('opens on keyboard focus and describes the trigger', async () => {
    render(
      <Tooltip content="Save your work">
        <Button>Save</Button>
      </Tooltip>,
    )
    await userEvent.tab()
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Save your work')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription(
      'Save your work',
    )
  })

  it('opens on hover and closes on Escape', async () => {
    render(
      <Tooltip content="More info" delayDuration={0}>
        <Button>Info</Button>
      </Tooltip>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Info' }))
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})

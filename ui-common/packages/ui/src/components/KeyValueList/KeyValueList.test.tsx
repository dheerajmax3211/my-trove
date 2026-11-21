import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyValueList } from './KeyValueList'

describe('KeyValueList', () => {
  it('renders a real description list of term and definition pairs', () => {
    const { container } = render(
      <KeyValueList
        items={[
          { label: 'Name', value: 'Priya' },
          { label: 'Plan', value: 'Pro', hint: '600 a minute' },
        ]}
      />,
    )
    expect(container.querySelector('dl')).not.toBeNull()
    expect(container.querySelectorAll('dt')).toHaveLength(2)
    expect(container.querySelectorAll('dd')).toHaveLength(2)
    expect(screen.getByText('Name').tagName).toBe('DT')
    expect(screen.getByText('600 a minute')).toBeInTheDocument()
  })

  it('sets ids and keys in the monospace face', () => {
    render(<KeyValueList items={[{ label: 'Id', value: 'abc-123', mono: true }]} />)
    expect(screen.getByText('abc-123').className).toContain('mono')
  })

  it('shows an empty message', () => {
    render(<KeyValueList items={[]} empty="No details yet" />)
    expect(screen.getByText('No details yet')).toBeInTheDocument()
  })

  it('supports stacked and dense layouts', () => {
    const { container } = render(
      <KeyValueList layout="stacked" dense items={[{ label: 'A', value: 'B' }]} />,
    )
    expect(container.querySelector('dl')?.className).toContain('stacked')
    expect(container.querySelector('dl')?.className).toContain('dense')
  })
})

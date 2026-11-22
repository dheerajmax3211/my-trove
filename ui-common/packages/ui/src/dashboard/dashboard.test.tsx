import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from '../components/Button/Button'
import { SidebarLink, SidebarNav, SidebarSection } from '../components/AppShell/AppShell'
import { mockReducedMotion } from '../internal/test-utils'
import { AppFrame, SearchPill, UserChip } from './AppFrame'
import { BarsChart } from './BarsChart'
import { BentoCard, BentoGrid } from './Bento'
import { BigStat } from './BigStat'
import { BubbleChart } from './BubbleChart'
import { DotMatrix } from './DotMatrix'
import { PillSelect } from './PillSelect'
import { ProgressStat } from './ProgressStat'
import { PromoCard } from './PromoCard'
import { RoundIconButton } from './RoundIconButton'

afterEach(() => vi.unstubAllGlobals())

describe('RoundIconButton', () => {
  it('has an accessible name and fires clicks', async () => {
    const onClick = vi.fn()
    render(<RoundIconButton label="Notifications" icon={<svg />} onClick={onClick} badge={3} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('BentoCard and BentoGrid', () => {
  it('is a region named by its title, with an icon chip and a menu button', async () => {
    mockReducedMotion(true)
    const onMenu = vi.fn()
    render(
      <BentoGrid>
        <BentoCard title="Requests" icon={<svg data-testid="i" />} onMenu={onMenu} span={6}>
          body
        </BentoCard>
      </BentoGrid>,
    )
    const card = screen.getByRole('region', { name: 'Requests' })
    expect(card).toHaveTextContent('body')
    await userEvent.click(within(card).getByRole('button', { name: 'Requests options' }))
    expect(onMenu).toHaveBeenCalledOnce()
  })

  it('the dark tone remaps text roles to the dark surface', () => {
    mockReducedMotion(true)
    render(
      <BentoCard title="Keys" tone="dark" animate-test="">
        x
      </BentoCard>,
    )
    expect(screen.getByRole('region', { name: 'Keys' })).toHaveAttribute('data-surface', 'vault')
  })

  it('staggers its cards in without wrapper elements', () => {
    mockReducedMotion(false)
    render(
      <BentoGrid data-testid="g">
        <BentoCard title="A">a</BentoCard>
        <BentoCard title="B">b</BentoCard>
      </BentoGrid>,
    )
    const cards = screen.getAllByRole('region')
    expect(cards[1]!.style.getPropertyValue('--pp-reveal-delay')).toBe('0.07s')
  })
})

describe('BigStat', () => {
  it('prints the figure, unit, delta and secondary figures', () => {
    mockReducedMotion(true)
    render(
      <BigStat
        value={24}
        unit="open today"
        delta="+5%"
        secondary={[{ label: 'Avg reply', value: '3 days' }]}
      />,
    )
    expect(screen.getAllByText('24').length).toBeGreaterThan(0)
    expect(screen.getByText('open today')).toBeInTheDocument()
    expect(screen.getByText('+5%')).toBeInTheDocument()
    expect(screen.getByText('Avg reply').nextElementSibling).toHaveTextContent('3 days')
  })

  it('shows strings as given and respects a down trend', () => {
    mockReducedMotion(true)
    render(<BigStat value="1h 20m" delta="-3%" trend="down" />)
    expect(screen.getByText('1h 20m')).toBeInTheDocument()
    expect(screen.getByText('-3%').className).toMatch(/down/)
  })
})

describe('ProgressStat, DotMatrix, BubbleChart, BarsChart', () => {
  it('ProgressStat is a named progressbar with its value', () => {
    mockReducedMotion(true)
    render(<ProgressStat label="Consent coverage" value={82} />)
    const bar = screen.getByRole('progressbar', { name: 'Consent coverage' })
    expect(bar).toHaveAttribute('aria-valuenow', '82')
  })

  it('ProgressStat clamps out-of-range values', () => {
    mockReducedMotion(true)
    render(<ProgressStat label="Over" value={140} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('DotMatrix gives assistive tech every column value', () => {
    mockReducedMotion(true)
    render(
      <DotMatrix
        label="Answered per day"
        columns={[
          { label: 'Mon', value: 3 },
          { label: 'Tue', value: 6 },
        ]}
      />,
    )
    expect(screen.getByText('Tue: 6 of 8')).toBeInTheDocument()
    expect(screen.getByText('Answered per day')).toBeInTheDocument()
  })

  it('BubbleChart prints each bubble value and name', () => {
    mockReducedMotion(true)
    render(
      <BubbleChart
        label="By status"
        bubbles={[
          { label: 'Answered', value: 31, unit: 'req' },
          { label: 'Waiting', value: 12 },
        ]}
      />,
    )
    const group = screen.getByRole('group', { name: 'By status' })
    expect(within(group).getByText('Answered')).toBeInTheDocument()
    expect(group).toHaveTextContent('31')
  })

  it('BarsChart lists values and shows the callout on the highlighted pair', () => {
    mockReducedMotion(true)
    render(
      <BarsChart
        label="Keys per month"
        callout="+12%"
        data={[
          { label: 'Jul', a: 8, b: 5 },
          { label: 'Aug', a: 12, b: 9 },
        ]}
      />,
    )
    expect(screen.getByText('Aug: 12 and 9')).toBeInTheDocument()
    expect(screen.getByText('+12%')).toBeInTheDocument()
  })
})

describe('PromoCard and PillSelect', () => {
  it('PromoCard shows a pitch with an action', () => {
    render(
      <PromoCard
        title="Share a key"
        description="Lend one document."
        action={<Button>Go</Button>}
      />,
    )
    expect(screen.getByText('Share a key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })

  it('PillSelect is a real labelled select', async () => {
    const onChange = vi.fn()
    render(
      <PillSelect
        label="Date range"
        lead="Nov 22"
        defaultValue="today"
        onChange={onChange}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'This week' },
        ]}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'week')
    expect(onChange).toHaveBeenCalled()
  })
})

describe('AppFrame', () => {
  function Frame() {
    return (
      <AppFrame
        brand="My-Trove"
        user={{ name: 'Priya Raman', email: 'priya@example.com' }}
        notifications={3}
        promo={<PromoCard title="Share a key" />}
        sidebar={
          <SidebarNav label="Dashboard">
            <SidebarSection title="Menu">
              <SidebarLink active count={3} href="#a">
                Overview
              </SidebarLink>
              <SidebarLink href="#b">Consent</SidebarLink>
            </SidebarSection>
          </SidebarNav>
        }
      >
        <h1>Household</h1>
      </AppFrame>
    )
  }

  it('keeps the landmarks: skip link, navigation, main, and the header controls', () => {
    render(<Frame />)
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Dashboard' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Household' }),
    )
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByText('priya@example.com')).toBeInTheDocument()
  })

  it('marks the current page and shows a lime count on the link', () => {
    render(<Frame />)
    const current = screen.getAllByRole('link', { name: /Overview/ })[0]!
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current).toHaveTextContent('3')
  })

  it('UserChip becomes a button when it opens a menu', async () => {
    const onClick = vi.fn()
    render(<UserChip name="Priya Raman" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /Priya Raman/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('SearchPill forwards typing', async () => {
    const onChange = vi.fn()
    render(<SearchPill onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox'), 'tax')
    expect(onChange).toHaveBeenCalledTimes(3)
  })
})

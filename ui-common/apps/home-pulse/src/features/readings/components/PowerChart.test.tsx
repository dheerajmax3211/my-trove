import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import '../../../test/setup'
import type { ReadingPoint, ReadingSeries } from '../types'
import { PowerChart } from './PowerChart'

const MIN = 60_000
const FROM = Date.UTC(2026, 10, 19, 10, 0)

function series(minutes: number[], overrides: Partial<ReadingSeries> = {}): ReadingSeries {
  const points: ReadingPoint[] = minutes.map((m) => ({
    ts: new Date(FROM + m * MIN).toISOString(),
    avgWatts: 100 + m,
    minWatts: 90 + m,
    maxWatts: 120 + m,
    avgVolts: 230,
    avgAmps: 0.5,
    samples: 6,
  }))
  return {
    applianceId: 'a',
    from: new Date(FROM).toISOString(),
    to: new Date(FROM + 60 * MIN).toISOString(),
    resolution: 'ONE_MINUTE',
    points,
    ...overrides,
  }
}

const withGap = [
  ...Array.from({ length: 20 }, (_, i) => i),
  ...Array.from({ length: 20 }, (_, i) => 40 + i),
]
const complete = Array.from({ length: 60 }, (_, i) => i)
const offset = () => 0

const renderChart = (s: ReadingSeries, referenceWatts?: number) =>
  render(
    <PowerChart
      series={s}
      rangeLabel="last hour"
      offset={offset}
      {...(referenceWatts ? { referenceWatts } : {})}
    />,
  )

describe('PowerChart', () => {
  it('draws a labelled graphic with axes, gridlines and a line', () => {
    const { container } = renderChart(series(complete))
    const svg = screen.getByRole('img', { name: 'Power draw, last hour' })
    expect(svg).toHaveAccessibleDescription(/Power for the last hour/)
    expect(container.querySelectorAll('svg line').length).toBeGreaterThan(8)
    expect(within(svg).getByText('Watts')).toBeInTheDocument()
    // x axis labels are on round times
    expect(within(svg).getByText(/^10:00/)).toBeInTheDocument()
    expect(within(svg).getByText(/^11:00/)).toBeInTheDocument()
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3)
  })

  it('writes a text summary with the average, extremes and gap count', () => {
    renderChart(series(withGap))
    const summary = screen.getByText(/Power for the last hour/)
    expect(summary).toHaveTextContent('Average')
    expect(summary).toHaveTextContent('lowest')
    expect(summary).toHaveTextContent('highest')
    expect(summary).toHaveTextContent('1 gap with no data, 20 min in total.')
  })

  it('shows missing data as a gap: a break in the line and a hatched band, never a joined line', () => {
    const { container } = renderChart(series(withGap))
    expect(screen.getAllByTestId('chart-gap')).toHaveLength(1)
    const line = container.querySelector('path[class*="line"]')
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
  })

  it('reports a complete series as having no gaps', () => {
    renderChart(series(complete))
    expect(screen.queryAllByTestId('chart-gap')).toHaveLength(0)
    expect(screen.getByText(/No gaps in the data/)).toBeInTheDocument()
  })

  it('treats silence at the end of the window as a gap too', () => {
    renderChart(series(Array.from({ length: 30 }, (_, i) => i)))
    expect(screen.getAllByTestId('chart-gap')).toHaveLength(1)
    expect(screen.getByText(/1 gap with no data/)).toBeInTheDocument()
  })

  it('explains the shaded band only for aggregated readings', () => {
    const { rerender } = renderChart(series(complete))
    expect(screen.getByText(/Lowest to highest in each interval/)).toBeInTheDocument()
    rerender(
      <PowerChart
        series={series(complete, { resolution: 'RAW' })}
        rangeLabel="last hour"
        offset={offset}
      />,
    )
    expect(screen.queryByText(/Lowest to highest in each interval/)).not.toBeInTheDocument()
  })

  it('draws the learned normal as a labelled reference line', () => {
    renderChart(series(complete), 120)
    expect(screen.getByText('Learned normal, 120 W')).toBeInTheDocument()
  })

  describe('keyboard access', () => {
    const slider = () => screen.getByRole('slider')

    it('is a single tab stop that exposes the readings as a slider with a spoken value', () => {
      renderChart(series(complete))
      expect(slider()).toHaveAttribute('tabindex', '0')
      expect(slider()).toHaveAttribute('aria-valuemin', '1')
      expect(slider()).toHaveAttribute('aria-valuemax', '60')
      expect(slider()).toHaveAttribute('aria-valuenow', '60')
      expect(slider()).toHaveAccessibleName(/arrow keys/)
      expect(slider().getAttribute('aria-valuetext')).toMatch(
        /average 159 W, lowest 149 W, highest 179 W/,
      )
    })

    it('shows the tooltip on focus and hides it on blur', async () => {
      const user = userEvent.setup()
      renderChart(series(complete))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      await user.tab()
      expect(slider()).toHaveFocus()
      expect(screen.getByRole('tooltip')).toHaveTextContent('Average 159 W')
      await user.tab()
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('steps through readings with the arrow keys, pages with PageUp/PageDown and jumps with Home/End', async () => {
      const user = userEvent.setup()
      renderChart(series(complete))
      await user.tab()
      await user.keyboard('{ArrowLeft}')
      expect(slider()).toHaveAttribute('aria-valuenow', '59')
      expect(screen.getByRole('tooltip')).toHaveTextContent('158 W')
      await user.keyboard('{ArrowRight}{ArrowRight}')
      expect(slider()).toHaveAttribute('aria-valuenow', '60')
      await user.keyboard('{Home}')
      expect(slider()).toHaveAttribute('aria-valuenow', '1')
      expect(screen.getByRole('tooltip')).toHaveTextContent('100 W')
      await user.keyboard('{ArrowLeft}')
      expect(slider()).toHaveAttribute('aria-valuenow', '1')
      await user.keyboard('{PageDown}')
      expect(slider()).toHaveAttribute('aria-valuenow', '11')
      await user.keyboard('{PageUp}{End}')
      expect(slider()).toHaveAttribute('aria-valuenow', '60')
    })

    it('shows the time and the range of the bucket in the tooltip', async () => {
      const user = userEvent.setup()
      renderChart(series(complete))
      await user.tab()
      await user.keyboard('{Home}')
      const tip = screen.getByRole('tooltip')
      expect(tip).toHaveTextContent(/10:00.* to 10:01/)
      expect(tip).toHaveTextContent('90 W to 120 W')
    })

    it('shows a tooltip for the reading under the pointer', () => {
      renderChart(series(complete))
      // The plot is 720 - 48 - 16 = 656 px wide for 60 minutes; x = 328 is the middle.
      fireEvent.pointerMove(slider(), { clientX: 328 })
      expect(screen.getByRole('tooltip')).toHaveTextContent(/10:2[89]|10:3[01]/)
      fireEvent.pointerLeave(slider())
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('has no slider when there is nothing to step through', () => {
      renderChart(series([]))
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      expect(screen.getByText('No power readings for the last hour.')).toBeInTheDocument()
    })
  })

  describe('data table alternative', () => {
    it('is hidden until asked for, then exposes the same readings as a table', async () => {
      const user = userEvent.setup()
      renderChart(series([0, 1, 2]))
      const toggle = screen.getByRole('button', { name: 'Show data table' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()

      await user.click(toggle)
      expect(screen.getByRole('button', { name: 'Hide data table' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      const table = screen.getByRole('table', { name: 'Power readings, last hour' })
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
      expect(headers).toEqual(['Time', 'Average', 'Lowest', 'Highest'])
      expect(within(table).getByText('100 W')).toBeInTheDocument()
      expect(within(table).getByText('102 W')).toBeInTheDocument()
    })

    it('lists a gap as a "no data" row in time order', async () => {
      const user = userEvent.setup()
      renderChart(series([0, 1, 2, 3, 30, 31]))
      await user.click(screen.getByRole('button', { name: 'Show data table' }))
      const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
      const text = rows.map((r) => r.textContent ?? '')
      const gapAt = text.findIndex((t) => t.includes('No data for'))
      expect(gapAt).toBe(4)
      expect(text[4]).toContain('No data for 26 min')
    })

    it('summarises a long series into a bounded number of rows and says so', async () => {
      const user = userEvent.setup()
      renderChart(series(complete))
      await user.click(screen.getByRole('button', { name: 'Show data table' }))
      expect(
        screen.getByText('60 readings are summarised into 48 equal time slots.'),
      ).toBeInTheDocument()
      expect(within(screen.getByRole('table')).getAllByRole('row').length).toBeLessThanOrEqual(49)
    })

    it('hides the table again', async () => {
      const user = userEvent.setup()
      renderChart(series([0, 1]))
      await user.click(screen.getByRole('button', { name: 'Show data table' }))
      await user.click(screen.getByRole('button', { name: 'Hide data table' }))
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })
})

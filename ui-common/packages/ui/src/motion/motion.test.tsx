import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockIntersectionObserver, mockReducedMotion } from '../internal/test-utils'
import { AnimatedList, AnimatedListItem } from './AnimatedList'
import { CountUp } from './CountUp'
import { IndicatorGroup, LayoutIndicator } from './LayoutIndicator'
import { Magnetic } from './Magnetic'
import { Marquee } from './Marquee'
import { PageTransition } from './PageTransition'
import { Parallax } from './Parallax'
import { Reveal, Stagger } from './Reveal'
import { ScrollProgress } from './ScrollProgress'
import { SmoothScroll, useScrollSmooth } from './SmoothScroll'
import { SpotlightCard } from './SpotlightCard'
import { SplitText } from './SplitText'
import { useInView } from './use-in-view'
import { useScrollStory } from './scroll-story'

afterEach(() => {
  vi.unstubAllGlobals()
})

function InViewProbe() {
  const [ref, inView] = useInView<HTMLDivElement>({ once: true })
  return (
    <div ref={ref} data-testid="probe">
      {inView ? 'in' : 'out'}
    </div>
  )
}

describe('useInView', () => {
  it('reports true where IntersectionObserver is missing (content is never hidden)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<InViewProbe />)
    expect(screen.getByTestId('probe')).toHaveTextContent('in')
  })

  it('flips to true when the element intersects, and stays true (once)', () => {
    const io = mockIntersectionObserver()
    render(<InViewProbe />)
    expect(screen.getByTestId('probe')).toHaveTextContent('out')
    act(() => io.trigger(true))
    expect(screen.getByTestId('probe')).toHaveTextContent('in')
  })
})

describe('Reveal and Stagger', () => {
  it('renders hidden until scrolled into view, then marks itself revealed', () => {
    mockReducedMotion(false)
    const io = mockIntersectionObserver()
    render(<Reveal data-testid="r">Hello</Reveal>)
    const el = screen.getByTestId('r')
    expect(el).toHaveAttribute('data-revealed', 'false')
    expect(el).toHaveTextContent('Hello')
    act(() => io.trigger(true))
    expect(el).toHaveAttribute('data-revealed', 'true')
  })

  it('encodes direction, distance, delay and duration as CSS variables', () => {
    render(
      <Reveal data-testid="r" direction="left" distance={40} delay={0.3} duration={1} scale={0.9}>
        x
      </Reveal>,
    )
    const el = screen.getByTestId('r')
    expect(el.style.getPropertyValue('--pp-reveal-x')).toBe('40px')
    expect(el.style.getPropertyValue('--pp-reveal-y')).toBe('0px')
    expect(el.style.getPropertyValue('--pp-reveal-delay')).toBe('0.3s')
    expect(el.style.getPropertyValue('--pp-reveal-duration')).toBe('1s')
    expect(el.style.getPropertyValue('--pp-reveal-scale')).toBe('0.9')
  })

  it('is revealed immediately under reduced motion', () => {
    mockReducedMotion(true)
    mockIntersectionObserver()
    render(<Reveal data-testid="r">Hello</Reveal>)
    expect(screen.getByTestId('r')).toHaveAttribute('data-revealed', 'true')
  })

  it('Stagger gives each child its own delay without adding wrapper elements', () => {
    render(
      <Stagger as="ul" interval={0.1} delay={0.2} data-testid="s">
        <li>One</li>
        <li>Two</li>
        <li>Three</li>
      </Stagger>,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]!.style.getPropertyValue('--pp-reveal-delay')).toBe('0.2s')
    expect(items[2]!.style.getPropertyValue('--pp-reveal-delay')).toBe('0.4s')
  })
})

describe('CountUp', () => {
  it('shows the final value immediately under reduced motion, with tabular figures', () => {
    mockReducedMotion(true)
    const { container } = render(<CountUp value={1284} />)
    expect(container.firstElementChild).toHaveTextContent('1,284')
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('1,284')
  })

  it('formats with Intl options, prefix and suffix', () => {
    mockReducedMotion(true)
    const { container } = render(
      <CountUp
        value={3120}
        locale="en-US"
        format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
        suffix=" saved"
      />,
    )
    expect(container).toHaveTextContent('$3,120 saved')
  })

  it('exposes the final value (not every frame) to assistive tech and counts up to it', async () => {
    mockReducedMotion(false)
    render(<CountUp value={50} duration={0.05} startOnView={false} />)
    // The visually hidden copy always holds the final figure.
    expect(screen.getAllByText('50').length).toBeGreaterThan(0)
    await waitFor(() =>
      expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent('50'),
    )
  })
})

describe('SplitText', () => {
  it('names the whole headline once and hides the split spans from assistive tech', () => {
    render(
      <SplitText as="h1" immediate>
        Keep it safe
      </SplitText>,
    )
    const h = screen.getByRole('heading', { level: 1, name: 'Keep it safe' })
    expect(h.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3)
  })

  it('splits by line on newlines', () => {
    render(
      <SplitText by="line" immediate data-testid="s">
        {'First line\nSecond line'}
      </SplitText>,
    )
    expect(screen.getByTestId('s')).toHaveAttribute('aria-label', 'First line Second line')
    expect(screen.getByTestId('s').querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })
})

describe('Marquee', () => {
  it('duplicates the content for the loop and hides the copy from assistive tech', () => {
    mockReducedMotion(false)
    render(
      <Marquee data-testid="m">
        <span>Alpha</span>
      </Marquee>,
    )
    expect(screen.getAllByText('Alpha')).toHaveLength(2)
    expect(screen.getByTestId('m').querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('renders a single static copy under reduced motion', () => {
    mockReducedMotion(true)
    render(
      <Marquee data-testid="m">
        <span>Alpha</span>
      </Marquee>,
    )
    expect(screen.getAllByText('Alpha')).toHaveLength(1)
    expect(screen.getByTestId('m')).toHaveAttribute('data-running', 'false')
  })
})

describe('SpotlightCard', () => {
  it('renders its content and a decorative light', () => {
    mockReducedMotion(true)
    const { container } = render(<SpotlightCard>Card body</SpotlightCard>)
    expect(screen.getByText('Card body')).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('follows the pointer by setting custom properties (no re-render)', () => {
    mockReducedMotion(true)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    const { container } = render(<SpotlightCard>Body</SpotlightCard>)
    const card = container.firstElementChild as HTMLElement
    card.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120 }) as DOMRect
    fireEvent.pointerMove(card, { clientX: 110, clientY: 70, pointerType: 'mouse' })
    expect(card.style.getPropertyValue('--pp-mx')).toBe('100px')
    expect(card.style.getPropertyValue('--pp-my')).toBe('50px')
  })
})

describe('Magnetic, Parallax, ScrollProgress', () => {
  it('Magnetic keeps its child and adds no semantics', () => {
    mockReducedMotion(false)
    render(
      <Magnetic>
        <button type="button">Go</button>
      </Magnetic>,
    )
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })

  it('Parallax renders a static wrapper under reduced motion', () => {
    mockReducedMotion(true)
    const { container } = render(<Parallax>Glow</Parallax>)
    expect(container.querySelector('[data-parallax]')).toBeNull()
    expect(screen.getByText('Glow')).toBeInTheDocument()
  })

  it('Parallax renders its children when motion is allowed', () => {
    mockReducedMotion(false)
    render(<Parallax>Glow</Parallax>)
    expect(screen.getByText('Glow')).toBeInTheDocument()
  })

  it('ScrollProgress is decorative, and absent under reduced motion', () => {
    mockReducedMotion(false)
    const { container, unmount } = render(<ScrollProgress />)
    expect(container.querySelector('[data-scroll-progress]')).toHaveAttribute('aria-hidden', 'true')
    unmount()
    mockReducedMotion(true)
    const again = render(<ScrollProgress />)
    expect(again.container.querySelector('[data-scroll-progress]')).toBeNull()
  })
})

describe('PageTransition', () => {
  function Pages() {
    const [key, setKey] = useState('a')
    return (
      <>
        <button type="button" onClick={() => setKey('b')}>
          Go
        </button>
        <PageTransition routeKey={key}>
          <p>Page {key}</p>
        </PageTransition>
      </>
    )
  }

  it('swaps the page content when the route key changes', () => {
    mockReducedMotion(true)
    render(<Pages />)
    expect(screen.getByText('Page a')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(screen.getByText('Page b')).toBeInTheDocument()
  })

  it('animates between pages when motion is allowed (old page leaves, new one arrives)', async () => {
    mockReducedMotion(false)
    render(<Pages />)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    await waitFor(() => expect(screen.getByText('Page b')).toBeInTheDocument(), { timeout: 2000 })
  })
})

describe('LayoutIndicator', () => {
  it('renders only on the active item and is hidden from assistive tech', () => {
    const { container, rerender } = render(
      <IndicatorGroup id="t">
        <LayoutIndicator active={false} />
      </IndicatorGroup>,
    )
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    rerender(
      <IndicatorGroup id="t">
        <LayoutIndicator active />
      </IndicatorGroup>,
    )
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})

describe('AnimatedList', () => {
  it('renders items, and removes them when they leave', async () => {
    mockReducedMotion(true)
    function Demo() {
      const [items, setItems] = useState(['One', 'Two'])
      return (
        <>
          <button type="button" onClick={() => setItems(['Two'])}>
            Drop
          </button>
          <AnimatedList aria-label="Requests">
            {items.map((t) => (
              <AnimatedListItem key={t}>{t}</AnimatedListItem>
            ))}
          </AnimatedList>
        </>
      )
    }
    render(<Demo />)
    expect(screen.getByRole('list', { name: 'Requests' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
  })
})

describe('SmoothScroll and scroll stories', () => {
  function Probe() {
    const { enabled, lenis } = useScrollSmooth()
    return <p>{enabled ? 'smooth' : lenis ? 'lenis' : 'native'}</p>
  }

  it('falls back to native scrolling without a provider', () => {
    render(<Probe />)
    expect(screen.getByText('native')).toBeInTheDocument()
  })

  it('turns itself off under reduced motion (no Lenis instance)', () => {
    mockReducedMotion(true)
    render(
      <SmoothScroll>
        <Probe />
      </SmoothScroll>,
    )
    expect(screen.getByText('native')).toBeInTheDocument()
  })

  it('can be disabled explicitly', () => {
    mockReducedMotion(false)
    render(
      <SmoothScroll enabled={false}>
        <Probe />
      </SmoothScroll>,
    )
    expect(screen.getByText('native')).toBeInTheDocument()
  })

  it('useScrollStory never runs its setup under reduced motion', () => {
    mockReducedMotion(true)
    const setup = vi.fn()
    function Story() {
      const [el, setEl] = useState<HTMLDivElement | null>(null)
      useScrollStory({ current: el }, setup)
      return <div ref={setEl}>story</div>
    }
    render(<Story />)
    expect(setup).not.toHaveBeenCalled()
  })
})

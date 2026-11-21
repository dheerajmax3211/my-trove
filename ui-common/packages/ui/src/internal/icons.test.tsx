import { render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import { describe, expect, it } from 'vitest'
import * as icons from './icons'

const required = [
  'HomeIcon',
  'UsersIcon',
  'ShieldIcon',
  'KeyIcon',
  'ChartIcon',
  'BellIcon',
  'ClockIcon',
  'FileIcon',
  'FolderIcon',
  'SettingsIcon',
  'LogoutIcon',
  'LinkIcon',
  'LockIcon',
  'SearchIcon',
  'SparkleIcon',
  'ArrowRightIcon',
  'ExternalIcon',
] as const

type IconComponent = (props: icons.IconProps) => JSX.Element

describe('icons', () => {
  it.each(required)('%s is exported', (name) => {
    expect(typeof icons[name]).toBe('function')
  })

  const all = Object.entries(icons).filter(([name]) => name.endsWith('Icon')) as [
    string,
    IconComponent,
  ][]

  it.each(all)('%s draws on the 24px grid, decorative by default', (_name, Icon) => {
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '20')
    expect(svg?.children.length).toBeGreaterThan(0)
  })

  it('becomes an image when given a title and honours size', () => {
    render(<icons.LockIcon title="Locked" size={32} />)
    const img = screen.getByRole('img', { name: 'Locked' })
    expect(img).toHaveAttribute('width', '32')
  })
})

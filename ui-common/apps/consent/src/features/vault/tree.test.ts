import { describe, expect, it } from 'vitest'
import type { Attribute } from '../../shared/api/types'
import { buildTree, countAttributes, filterAttributes } from './api/tree'

const attr = (keyPath: string): Attribute => ({
  keyPath,
  value: 1,
  sensitivity: 'PERSONAL',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('vault tree', () => {
  const attributes = [
    attr('profile.sizes.shoe'),
    attr('profile.sizes'),
    attr('profile.name'),
    attr('health.allergies'),
  ]

  it('groups by dotted path and sorts siblings', () => {
    const tree = buildTree(attributes)
    expect(tree.map((n) => n.path)).toEqual(['health', 'profile'])
    const profile = tree[1]
    expect(profile?.children.map((n) => n.segment)).toEqual(['name', 'sizes'])
    expect(profile?.attribute).toBeNull()
  })

  it('lets a path hold a value and have children', () => {
    const sizes = buildTree(attributes)[1]?.children[1]
    expect(sizes?.attribute?.keyPath).toBe('profile.sizes')
    expect(sizes?.children.map((n) => n.path)).toEqual(['profile.sizes.shoe'])
  })

  it('counts attributes below a node', () => {
    const [health, profile] = buildTree(attributes)
    expect(countAttributes(health!)).toBe(1)
    expect(countAttributes(profile!)).toBe(3)
  })

  it('filters by case-insensitive key path substring', () => {
    expect(filterAttributes(attributes, ' SIZES ').map((a) => a.keyPath)).toEqual([
      'profile.sizes.shoe',
      'profile.sizes',
    ])
    expect(filterAttributes(attributes, '')).toHaveLength(4)
  })
})

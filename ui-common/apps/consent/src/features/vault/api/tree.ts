import type { Attribute } from '../../../shared/api/types'

export interface TreeNode {
  /** Last path segment, e.g. `shoe`. */
  segment: string
  /** Full dotted path, e.g. `profile.sizes.shoe`. */
  path: string
  /** Set when an attribute is stored at exactly this path. */
  attribute: Attribute | null
  children: TreeNode[]
}

/** Groups attributes by dotted key path. A path can hold a value and have children at once. */
export function buildTree(attributes: readonly Attribute[]): TreeNode[] {
  const roots: TreeNode[] = []
  for (const attribute of attributes) {
    let level = roots
    let path = ''
    for (const segment of attribute.keyPath.split('.')) {
      path = path ? `${path}.${segment}` : segment
      let node = level.find((n) => n.segment === segment)
      if (!node) {
        node = { segment, path, attribute: null, children: [] }
        level.push(node)
      }
      if (path === attribute.keyPath) node.attribute = attribute
      level = node.children
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.segment.localeCompare(b.segment))
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

/** How many attributes live at or below a node. */
export function countAttributes(node: TreeNode): number {
  return (node.attribute ? 1 : 0) + node.children.reduce((n, c) => n + countAttributes(c), 0)
}

export function filterAttributes(attributes: readonly Attribute[], text: string): Attribute[] {
  const needle = text.trim().toLowerCase()
  return needle
    ? attributes.filter((a) => a.keyPath.toLowerCase().includes(needle))
    : [...attributes]
}

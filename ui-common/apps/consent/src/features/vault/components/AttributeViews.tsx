import {
  Badge,
  Button,
  ChevronDownIcon,
  DataTable,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import type { Attribute } from '../../../shared/api/types'
import { SensitivityBadge } from '../../../shared/components/SensitivityBadge'
import { formatDate } from '../../../shared/lib/format'
import { previewJson } from '../../../shared/lib/json'
import { buildTree, countAttributes, type TreeNode } from '../api/tree'

export interface AttributeActions {
  onEdit: (attribute: Attribute) => void
  onDelete: (attribute: Attribute) => void
}

function RowActions({ attribute, onEdit, onDelete }: AttributeActions & { attribute: Attribute }) {
  return (
    <span className="row-actions">
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Edit ${attribute.keyPath}`}
        onClick={() => onEdit(attribute)}
      >
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Delete ${attribute.keyPath}`}
        onClick={() => onDelete(attribute)}
      >
        Delete
      </Button>
    </span>
  )
}

function TreeBranch({
  node,
  collapsed,
  toggle,
  actions,
}: {
  node: TreeNode
  collapsed: ReadonlySet<string>
  toggle: (path: string) => void
  actions: AttributeActions
}) {
  const hasChildren = node.children.length > 0
  const open = !collapsed.has(node.path)
  const childrenId = `tree-${node.path.replaceAll('.', '-')}`
  return (
    <li className="tree-item">
      <div className="tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={open}
            aria-controls={childrenId}
            aria-label={node.path}
            onClick={() => toggle(node.path)}
          >
            <ChevronDownIcon size={16} className={open ? undefined : 'tree-chevron-closed'} />
            <span className="mono">{node.segment}</span>
            <Badge variant="neutral">{countAttributes(node)}</Badge>
          </button>
        ) : (
          <span className="tree-leaf mono">{node.segment}</span>
        )}
        {node.attribute ? (
          <>
            <SensitivityBadge level={node.attribute.sensitivity} />
            <code className="value-preview" title="Stored value">
              {previewJson(node.attribute.value)}
            </code>
            <RowActions attribute={node.attribute} {...actions} />
          </>
        ) : null}
      </div>
      {hasChildren && open ? (
        <ul id={childrenId} className="tree-list">
          {node.children.map((child) => (
            <TreeBranch
              key={child.path}
              node={child}
              collapsed={collapsed}
              toggle={toggle}
              actions={actions}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** The vault as a tree of dotted key paths. Branches collapse; every attribute shows its level and value. */
export function AttributeTree({
  attributes,
  ...actions
}: AttributeActions & { attributes: readonly Attribute[] }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(path)) next.add(path)
      return next
    })
  return (
    <ul className="tree-list tree-root" aria-label="Vault attributes by key path">
      {buildTree(attributes).map((node) => (
        <TreeBranch
          key={node.path}
          node={node}
          collapsed={collapsed}
          toggle={toggle}
          actions={actions}
        />
      ))}
    </ul>
  )
}

export function AttributeTable({
  attributes,
  ...actions
}: AttributeActions & { attributes: readonly Attribute[] }) {
  const columns: DataTableColumn<Attribute>[] = [
    {
      id: 'keyPath',
      header: 'Key path',
      sortValue: (a) => a.keyPath,
      cell: (a) => <code className="mono">{a.keyPath}</code>,
    },
    {
      id: 'sensitivity',
      header: 'Sensitivity',
      sortValue: (a) => a.sensitivity,
      cell: (a) => <SensitivityBadge level={a.sensitivity} />,
    },
    {
      id: 'value',
      header: 'Value',
      cell: (a) => <code className="value-preview">{previewJson(a.value)}</code>,
    },
    {
      id: 'updated',
      header: 'Updated',
      sortValue: (a) => a.updatedAt,
      cell: (a) => formatDate(a.updatedAt),
    },
    {
      id: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (a) => <RowActions attribute={a} {...actions} />,
    },
  ]
  return (
    <DataTable
      caption="Vault attributes"
      columns={columns}
      data={attributes}
      getRowId={(a) => a.keyPath}
      defaultSort={{ columnId: 'keyPath', direction: 'asc' }}
    />
  )
}

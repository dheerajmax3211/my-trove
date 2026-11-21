import { Button, Card, CardContent, CardHeader, CardTitle } from '@platform/ui'
import { useState } from 'react'
import { isTerminal, type Item } from '../api/types'
import { STATUS_LABEL } from '../logic/labels'
import { CancelDialog, ResolveDialog, SnoozeDialog } from './ActionDialogs'

type Open = 'resolve' | 'snooze' | 'cancel' | null

export function ActionsCard({ item }: { item: Item }) {
  const [open, setOpen] = useState<Open>(null)
  const closed = isTerminal(item.status)
  const reasonId = 'actions-closed-reason'
  const describedBy = closed ? reasonId : undefined
  const close = (next: boolean) => {
    if (!next) setOpen(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Actions</CardTitle>
      </CardHeader>
      <CardContent>
        {closed ? (
          <p id={reasonId} className="wo-muted">
            This item is {STATUS_LABEL[item.status].toLowerCase()}, so there is nothing left to do.
          </p>
        ) : null}
        <div className="wo-row-actions">
          <Button
            disabled={closed}
            aria-describedby={describedBy}
            onClick={() => setOpen('resolve')}
          >
            Resolve
          </Button>
          <Button
            variant="secondary"
            disabled={closed}
            aria-describedby={describedBy}
            onClick={() => setOpen('snooze')}
          >
            Snooze
          </Button>
          <Button
            variant="danger"
            disabled={closed}
            aria-describedby={describedBy}
            onClick={() => setOpen('cancel')}
          >
            Cancel tracking
          </Button>
        </div>
      </CardContent>
      <ResolveDialog item={item} open={open === 'resolve'} onOpenChange={close} />
      <SnoozeDialog item={item} open={open === 'snooze'} onOpenChange={close} />
      <CancelDialog item={item} open={open === 'cancel'} onOpenChange={close} />
    </Card>
  )
}

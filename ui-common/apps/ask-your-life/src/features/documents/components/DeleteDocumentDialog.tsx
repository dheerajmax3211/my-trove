import { Button, Dialog, DialogClose, useToast } from '@platform/ui'
import { FailureCallout } from '../../../components/FailureCallout'
import { describeIngestError } from '../api/documentsApi'
import type { DocumentResponse } from '../api/types'
import { useDeleteDocument } from '../hooks/useDocuments'

export function DeleteDocumentDialog({
  document,
  onClose,
}: {
  document: DocumentResponse | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const remove = useDeleteDocument(() => {
    toast({
      title: 'Deleted',
      description: `"${document?.title ?? 'The document'}" and its searchable passages were removed.`,
      variant: 'success',
    })
    onClose()
  })
  const failure = remove.error ? describeIngestError(remove.error) : null

  return (
    <Dialog
      open={document !== null}
      onOpenChange={(open) => {
        if (!open) {
          remove.reset()
          onClose()
        }
      }}
      title="Delete this document?"
      description={
        document
          ? `"${document.title}" and everything indexed from it will be removed. This cannot be undone.`
          : undefined
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => document && remove.mutate({ id: document.id })}
          >
            Delete
          </Button>
        </>
      }
    >
      {failure ? <FailureCallout failure={failure} /> : null}
    </Dialog>
  )
}

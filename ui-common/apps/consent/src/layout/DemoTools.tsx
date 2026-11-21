import { Button, useToast } from '@platform/ui'
import { useQueryClient } from '@tanstack/react-query'
import type { MockBackend } from '../mock/backend'

/**
 * Demo mode only. Apps talk to the gateway, not to this UI, so there is nothing here to click that
 * would make them ask for access; these buttons play the app's part against the in-memory gateway.
 */
export function DemoTools({ backend }: { backend: MockBackend }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const run = (title: string, action: () => string | void) => {
    try {
      const description = action()
      void queryClient.invalidateQueries()
      toast({ title, ...(description ? { description } : {}), variant: 'info' })
    } catch (error) {
      toast({
        title: 'Could not simulate that',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'warning',
      })
    }
  }

  return (
    <section className="demo-tools" aria-labelledby="demo-tools-title">
      <h2 id="demo-tools-title" className="demo-tools-title">
        Demo controls
      </h2>
      <p className="muted">Play the part of third-party apps against the mock gateway.</p>
      <div className="stack-sm">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            run('An app asked for access', () => {
              const request = backend.simulateAccessRequest()
              return `${request.clientName}: ${request.scopes.join(', ')}`
            })
          }
        >
          Simulate an access request
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            run('An app read your data', () => {
              const entry = backend.simulateRead()
              return entry.eventType === 'DATA_READ'
                ? 'Allowed by an active grant.'
                : 'It was refused.'
            })
          }
        >
          Simulate a data read
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            run('Audit log tampered with', () => {
              backend.tamperAudit('edit-entry')
              return 'Run Verify on the Audit page to see it caught.'
            })
          }
        >
          Tamper with the audit log
        </Button>
      </div>
    </section>
  )
}

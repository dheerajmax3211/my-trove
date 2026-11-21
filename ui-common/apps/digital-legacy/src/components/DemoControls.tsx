import { Button } from '@platform/ui'
import { useQueryClient } from '@tanstack/react-query'
import type { MockBackend } from '../mock/backend'

const DAY = 24 * 3600 * 1000

/** Demo mode only: fast-forwards the in-memory server's clock so every state can be seen. */
export function DemoControls({ mock }: { mock: MockBackend }) {
  const queryClient = useQueryClient()
  const skip = (days: number) => {
    mock.advance(days * DAY)
    void queryClient.invalidateQueries()
  }
  return (
    <div className="demo-controls" role="group" aria-label="Demo time travel">
      <strong>Demo clock</strong>
      <span className="muted">Skip ahead as if you had gone silent.</span>
      <div className="row-wrap">
        {[1, 7, 30].map((d) => (
          <Button key={d} size="sm" variant="secondary" onClick={() => skip(d)}>
            +{d} day{d === 1 ? '' : 's'}
          </Button>
        ))}
      </div>
    </div>
  )
}

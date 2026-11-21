import { Button, type ButtonSize } from '@platform/ui'
import { demoUrl, workspaceUrl } from '../config'

export interface CtaPairProps {
  size?: ButtonSize
}

/**
 * The two actions the whole site is for: sign in to the workspace, or try it on sample data.
 * Renders two siblings, so the caller owns the layout (a flex row, a stacked column).
 */
export function CtaPair({ size = 'lg' }: CtaPairProps) {
  return (
    <>
      <Button asChild size={size}>
        <a href={workspaceUrl()} data-cta="workspace">
          Open the workspace
        </a>
      </Button>
      <Button asChild size={size} variant="secondary">
        <a href={demoUrl()} data-cta="demo">
          Try the live demo
        </a>
      </Button>
    </>
  )
}

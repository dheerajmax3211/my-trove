import { ArrowRightIcon, Button, Magnetic, type ButtonSize } from '@platform/ui'
import { demoUrl, workspaceUrl } from '../config'

export interface CtaPairProps {
  size?: ButtonSize
  /** Cinematic bands: the main action glows lime and both buttons lean toward the cursor. */
  glow?: boolean
}

/**
 * The two actions the whole site is for: sign in to the workspace, or try it on sample data.
 * Renders two siblings, so the caller owns the layout (a flex row, a stacked column).
 */
export function CtaPair({ size = 'lg', glow = false }: CtaPairProps) {
  const workspace = (
    <Button asChild size={size} variant={glow ? 'glow' : 'primary'}>
      <a href={workspaceUrl()} data-cta="workspace">
        Open the workspace
        {glow ? <ArrowRightIcon size={18} aria-hidden="true" /> : null}
      </a>
    </Button>
  )
  const demo = (
    <Button asChild size={size} variant="secondary">
      <a href={demoUrl()} data-cta="demo">
        Try the live demo
      </a>
    </Button>
  )
  if (!glow) {
    return (
      <>
        {workspace}
        {demo}
      </>
    )
  }
  return (
    <>
      <Magnetic>{workspace}</Magnetic>
      <Magnetic>{demo}</Magnetic>
    </>
  )
}

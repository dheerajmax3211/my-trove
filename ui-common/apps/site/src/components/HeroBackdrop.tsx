import { Aurora, Grain, GridGlow, type AuroraPalette } from '@platform/ui'
import { usePlayback } from '../motion/playback'

/**
 * The generative stand-in for a hero video: a drifting aurora, a glowing grid and film grain.
 * It pauses with the visitor's play/pause control and stops under reduced motion.
 */
export function HeroBackdrop({
  palette = 'brand',
  intensity = 'vivid',
}: {
  palette?: AuroraPalette
  intensity?: 'subtle' | 'medium' | 'vivid'
}) {
  const { playing } = usePlayback()
  return (
    <>
      <Aurora palette={palette} intensity={intensity} animated={playing} />
      <GridGlow fade="spot" />
      <Grain opacity={0.08} />
    </>
  )
}

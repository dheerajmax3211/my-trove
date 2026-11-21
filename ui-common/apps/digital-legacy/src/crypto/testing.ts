import { bytesOf, type Bytes } from './bytes'
import type { RandomSource } from './shamir'

/** Replays a fixed byte stream, so a split can be reproduced exactly (the Java vectors rely on this). */
export function replayRandom(stream: Uint8Array): RandomSource & { remaining: () => number } {
  let position = 0
  const source = (length: number): Bytes => {
    if (position + length > stream.length) throw new Error('random stream exhausted')
    const out = bytesOf(stream.subarray(position, position + length))
    position += length
    return out
  }
  source.remaining = () => stream.length - position
  return source
}

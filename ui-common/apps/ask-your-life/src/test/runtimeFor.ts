import { createRuntime, type Runtime } from '../runtime'

/** A demo runtime as the standalone app builds it for a given address query (no latency in tests). */
export function runtimeFor(search: string): Runtime {
  return createRuntime({ VITE_USE_MOCK: 'true' }, search)
}

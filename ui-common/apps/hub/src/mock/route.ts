import { HttpError } from './http'
import type { State } from './state'

export interface MockEnv {
  state: State
  now: () => number
}

export interface MockRequest {
  /** Firebase uid of the caller (`null` only on the public download route). */
  uid: string | null
  /** Regex capture groups of the matched path (URL-decoded). */
  params: string[]
  query: URLSearchParams
  body: BodyInit | null | undefined
}

export interface Route {
  method: string
  pattern: RegExp
  handle: (request: MockRequest) => Response | Promise<Response>
}

export const callerUid = (request: MockRequest): string => {
  if (!request.uid) throw new HttpError(401, 'Unauthorized', 'empty')
  return request.uid
}

export const iso = (ms: number): string => new Date(ms).toISOString()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Spring answers 400 when a path or query value is not a UUID. */
export function uuidParam(value: string | null | undefined, name: string): string {
  if (value == null || !UUID.test(value))
    throw new HttpError(400, `Invalid value for ${name}: expected a UUID`)
  return value.toLowerCase()
}

/** A JSON request body that must be an object (Spring: 400 "Failed to read request"). */
export function jsonObject(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') throw new HttpError(400, 'Failed to read request')
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'Failed to read request')
}

/** Like `jsonObject`, but a missing body is fine (`@RequestBody(required = false)`). */
export function optionalJsonObject(
  body: BodyInit | null | undefined,
): Record<string, unknown> | null {
  return body == null || body === '' ? null : jsonObject(body)
}

/** Bean-validation failures: Spring gives a generic 400 that names no field. */
export const invalid = (): HttpError => new HttpError(400, 'Invalid request content.')

export function notBlank(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw invalid()
  return value
}

export function intInRange(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw invalid()
  return value
}

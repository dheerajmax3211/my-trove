/** RFC 7807 / RFC 9457 `application/problem+json` document (extension members allowed). */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  [extension: string]: unknown
}

export interface ApiErrorInit {
  status: number
  type?: string
  title?: string
  detail?: string
  instance?: string
  extensions?: Record<string, unknown>
  cause?: unknown
}

/** Every failed API call surfaces as this, whatever the server (or network) did. */
export class ApiError extends Error {
  /** HTTP status; `0` when no response was received (network failure). */
  readonly status: number
  /** Problem type URI. `about:blank` when the server gave none. */
  readonly type: string
  readonly title: string
  readonly detail: string | undefined
  readonly instance: string | undefined
  /** Extension members of the problem document, e.g. `{ errors: { email: ['invalid'] } }`. */
  readonly extensions: Readonly<Record<string, unknown>>

  constructor(init: ApiErrorInit) {
    const title = init.title ?? (init.status === 0 ? 'Network error' : `HTTP ${init.status}`)
    super(init.detail ?? title, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'ApiError'
    this.status = init.status
    this.type = init.type ?? 'about:blank'
    this.title = title
    this.detail = init.detail
    this.instance = init.instance
    this.extensions = init.extensions ?? {}
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
  get isServerError(): boolean {
    return this.status >= 500
  }
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** The error as a problem document (handy for logging or re-serialising). */
  toProblem(): ProblemDetails {
    return {
      ...this.extensions,
      type: this.type,
      title: this.title,
      status: this.status,
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
      ...(this.instance !== undefined ? { instance: this.instance } : {}),
    }
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/**
 * Turn a failed Response into an ApiError. Understands problem+json; falls back to any JSON
 * object with `title`/`detail`/`message`, then to a short plain-text body, then to the status line.
 */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('content-type') ?? ''
  let text = ''
  try {
    text = await response.text()
  } catch {
    /* body unreadable: fall through to the status line */
  }

  let body: unknown
  if (text && /json/i.test(contentType)) {
    try {
      body = JSON.parse(text)
    } catch {
      /* malformed JSON error body */
    }
  }

  if (isRecord(body)) {
    const { type, title, status: _status, detail, instance, message, ...extensions } = body
    return new ApiError({
      status: response.status,
      ...(asString(type) ? { type: asString(type) } : {}),
      title: asString(title) ?? (response.statusText || `HTTP ${response.status}`),
      ...((asString(detail) ?? asString(message))
        ? { detail: asString(detail) ?? asString(message) }
        : {}),
      ...(asString(instance) ? { instance: asString(instance) } : {}),
      extensions,
    })
  }

  return new ApiError({
    status: response.status,
    title: response.statusText || `HTTP ${response.status}`,
    ...(text && !/html/i.test(contentType) ? { detail: text.slice(0, 500) } : {}),
  })
}

/** Redirect addresses an app may register (the server takes up to ten). */
export const MAX_REDIRECT_URIS = 10

/** The longest address the server accepts for a redirect or an endpoint. */
export const MAX_URL_LENGTH = 2048

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Checks one callback or endpoint address the way the platform does: https always, or http only on localhost and
 * 127.0.0.1 for local development. Returns the problem in plain words, or null when the address is fine.
 */
export function validateCallbackUrl(value: string): string | null {
  const text = value.trim()
  if (text === '') return 'Enter an address.'
  if (text.length > MAX_URL_LENGTH) {
    return `Addresses can be at most ${MAX_URL_LENGTH} characters long.`
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return 'Enter a full address, starting with https://.'
  }
  if (url.protocol === 'https:') return null
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return null
  return 'Use https://. Plain http:// is allowed only for localhost and 127.0.0.1.'
}

export interface ParsedUris {
  uris: string[]
  error?: string
}

/** Reads the redirect box: one address per line, blank lines ignored, every address checked. */
export function parseRedirectUris(text: string): ParsedUris {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (lines.length > MAX_REDIRECT_URIS) {
    return { uris: [], error: `Register up to ${MAX_REDIRECT_URIS} redirect addresses per app.` }
  }
  for (const line of lines) {
    const problem = validateCallbackUrl(line)
    if (problem) return { uris: [], error: `${line}: ${problem}` }
  }
  return { uris: lines }
}

export const MAX_VALUE_CHARS = 64 * 1024

export type JsonParse = { ok: true; value: unknown } | { ok: false; message: string }

/** Parses the text of the vault value editor with the same rules the gateway enforces. */
export function parseJsonValue(text: string): JsonParse {
  if (text.trim() === '') return { ok: false, message: 'Enter a value. Strings need quotes.' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const reason = error instanceof SyntaxError ? error.message : 'Invalid JSON.'
    return { ok: false, message: `This is not valid JSON. ${reason}` }
  }
  if (value === null) {
    return { ok: false, message: 'The value cannot be null. Delete the attribute instead.' }
  }
  if (JSON.stringify(value).length > MAX_VALUE_CHARS) {
    return { ok: false, message: `The value is larger than ${MAX_VALUE_CHARS} characters.` }
  }
  return { ok: true, value }
}

export function stringifyJson(value: unknown, pretty = true): string {
  return JSON.stringify(value, null, pretty ? 2 : undefined)
}

/** One line for lists: `"M"`, `42`, `{"a":1,...}` truncated. */
export function previewJson(value: unknown, max = 60): string {
  const text = JSON.stringify(value) ?? ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

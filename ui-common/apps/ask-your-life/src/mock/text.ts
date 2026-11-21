/** Text helpers for the in-memory backend: extraction, hashing, titles, chunking. */

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

export function baseType(mimeType: string): string {
  return (mimeType.split(';')[0] ?? '').trim().toLowerCase()
}

export function isSupportedType(mimeType: string): boolean {
  return baseType(mimeType).startsWith('text/')
}

/** Mirrors the real extractors: plain text as is, Markdown syntax stripped, HTML tags and scripts removed. */
export function extractText(mimeType: string, raw: string): string {
  const type = baseType(mimeType)
  let text = raw.replace(/\r\n?/g, '\n').split('\u0000').join('')
  if (type === 'text/html') {
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => HTML_ENTITIES[e] ?? e)
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
  } else if (type === 'text/markdown' || type === 'text/x-markdown') {
    text = text
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/^>\s?/gm, '')
      .replace(/^\s*[-+]\s+/gm, '')
  }
  return text.trim()
}

/** A stable 64-hex-character fingerprint (not cryptographic: the real service uses SHA-256). */
export function fingerprint(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  const parts: string[] = []
  for (let round = 0; round < 8; round += 1) {
    for (let i = 0; i < text.length; i += 1) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619) >>> 0
      b = Math.imul(b + a + round, 2246822519) >>> 0
    }
    parts.push(a.toString(16).padStart(8, '0'))
    a = (a ^ b) >>> 0
  }
  return parts.join('')
}

export function titleFor(given: string | undefined, text: string): string {
  const trimmed = given?.trim() ?? ''
  let title =
    trimmed !== ''
      ? trimmed
      : (text
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line !== '') ?? 'Untitled')
  title = title.replace(/^#+\s*/, '')
  if (trimmed === '' && [...title].length > 80) title = `${[...title].slice(0, 80).join('')}…`
  return title.slice(0, 500)
}

/** Paragraph-based chunks of roughly 400 characters, enough to exercise "best passage" logic. */
export function chunkText(text: string, target = 400): string[] {
  const chunks: string[] = []
  let current = ''
  for (const paragraph of text.split(/\n\s*\n/)) {
    const p = paragraph.trim()
    if (p === '') continue
    if (current !== '' && current.length + p.length > target) {
      chunks.push(current)
      current = p
    } else {
      current = current === '' ? p : `${current}\n\n${p}`
    }
  }
  if (current !== '') chunks.push(current)
  return chunks
}

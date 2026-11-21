/**
 * Safe handling of search snippets.
 *
 * The backend escapes the document text (`&`, `<`, `>`) and then wraps matches in `<mark>...</mark>`.
 * We never hand that string to the DOM as HTML. Instead we split it on the two literal tag strings,
 * decode the entity escapes in the remaining text, and render everything as React text nodes plus
 * `<mark>` elements we create ourselves. Anything else that looks like markup (a `<script>` tag,
 * an `onerror` attribute, an escaped `&lt;mark&gt;`) stays plain text.
 */

export interface SnippetSegment {
  text: string
  marked: boolean
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
}

/** Decodes the few entities the backend (or a standard HTML escaper) can produce, in one pass. */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity)
}

const MARK_TAG = /(<mark>|<\/mark>)/

export function parseSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let marked = false
  for (const part of snippet.split(MARK_TAG)) {
    if (part === '<mark>') marked = true
    else if (part === '</mark>') marked = false
    else if (part !== '') {
      const text = decodeEntities(part)
      const last = segments[segments.length - 1]
      if (last && last.marked === marked) last.text += text
      else segments.push({ text, marked })
    }
  }
  return segments
}

/** The snippet as plain text with no highlighting (for accessible names and tests). */
export function snippetToText(snippet: string): string {
  return parseSnippet(snippet)
    .map((s) => s.text)
    .join('')
}

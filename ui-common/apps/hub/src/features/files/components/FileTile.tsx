import styles from './FileTile.module.css'

export type FileKind = 'document' | 'image' | 'sheet' | 'text' | 'archive' | 'other'

const KIND_BY_EXT: Record<string, FileKind> = {
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  svg: 'image',
  csv: 'sheet',
  xls: 'sheet',
  xlsx: 'sheet',
  ods: 'sheet',
  txt: 'text',
  md: 'text',
  zip: 'archive',
  gz: 'archive',
  tar: 'archive',
}

/** "Home insurance summary.txt" is "TXT". A name with no extension has none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : ''
}

/** What sort of file it is, from its extension first and its content type when the extension says nothing. */
export function kindOf(name: string, contentType: string): FileKind {
  const byExt = KIND_BY_EXT[extensionOf(name)]
  if (byExt) return byExt
  if (contentType === 'application/pdf') return 'document'
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('text/')) return 'text'
  return 'other'
}

/** A small sheet of paper with a folded corner and the file's extension on it. Decorative. */
export function FileTile({ name, contentType }: { name: string; contentType: string }) {
  const kind = kindOf(name, contentType)
  const label = (extensionOf(name) || 'file').slice(0, 4).toUpperCase()
  return (
    <span className={styles.tile} data-kind={kind} aria-hidden="true">
      <span className={styles.label}>{label}</span>
    </span>
  )
}

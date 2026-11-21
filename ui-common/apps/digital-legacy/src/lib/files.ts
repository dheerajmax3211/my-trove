/** Saves text as a file download. Nothing is kept in storage; the file is the only copy. */
export function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Reads a chosen file as text (FileReader keeps this working in every browser and in jsdom). */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('The file could not be read'))
    reader.readAsText(file)
  })
}

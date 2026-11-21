export interface StoredFile {
  id: string
  ownerUid: string
  /** `null` for a personal file. */
  householdId: string | null
  name: string
  contentType: string
  sizeBytes: number
  sha256: string
  createdAt: string
}

export interface DownloadLink {
  token: string
  /** Path on the shared-service host, e.g. `/v1/files/download?token=...`. */
  url: string
  expiresAt: string
}

import type { BadgeVariant } from '@platform/ui'
import type { DocumentStatus, SourceType } from '../api/types'

export const SOURCE_LABELS: Record<SourceType, string> = {
  NOTE: 'Note',
  FILE: 'File',
  EMAIL: 'Email',
  RECEIPT: 'Receipt',
}

export interface StatusInfo {
  label: string
  variant: BadgeVariant
  /** Plain-language explanation, shown in the add flow and the library. */
  description: string
}

/**
 * The backend reports PENDING / INDEXED / FAILED. We show them as Indexing / Ready / Failed so the
 * words match what the person is waiting for.
 */
export const STATUS_INFO: Record<DocumentStatus, StatusInfo> = {
  PENDING: {
    label: 'Indexing',
    variant: 'info',
    description: 'Queued for indexing. It becomes searchable in a few seconds.',
  },
  INDEXED: {
    label: 'Ready',
    variant: 'success',
    description: 'Indexed. You can find it with search.',
  },
  FAILED: {
    label: 'Failed',
    variant: 'danger',
    description: 'Indexing failed, so this cannot be found yet. Delete it and add it again.',
  },
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date)
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not yet'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormat.format(date)
}

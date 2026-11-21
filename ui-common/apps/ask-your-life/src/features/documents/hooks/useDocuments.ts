import { useApiMutation, useApiQuery } from '@platform/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useSettings } from '../../../lib/settings'
import { SEARCH_PATH } from '../../search/api/searchApi'
import {
  buildCreateBody,
  buildUpdateBody,
  buildUploadForm,
  documentKey,
  documentPath,
  documentsKey,
  DOCUMENTS_PATH,
  listQuery,
  type NoteInput,
  type ReplaceInput,
  type UploadInput,
} from '../api/documentsApi'
import type { DocumentResponse, IngestResponse, SourceType } from '../api/types'

/** Query-key prefixes that depend on what is in the library. */
const searchKey = [SEARCH_PATH]

/** The library page of documents; re-checks every few seconds while anything is still indexing. */
export function useDocumentList(sourceType: SourceType | null, offset: number, limit?: number) {
  const { pollIntervalMs } = useSettings()
  return useApiQuery<DocumentResponse[]>(DOCUMENTS_PATH, {
    query: listQuery(sourceType, offset, limit),
    refetchInterval: (query) =>
      query.state.status !== 'error' && query.state.data?.some((d) => d.status === 'PENDING')
        ? pollIntervalMs
        : false,
  })
}

/**
 * The newest few documents. The home uses it twice: an empty answer means first use, and otherwise
 * it is the "Recently added" list. Re-checks while anything is still indexing.
 */
export function useRecentDocuments(limit = 5) {
  const { pollIntervalMs } = useSettings()
  return useApiQuery<DocumentResponse[]>(DOCUMENTS_PATH, {
    query: listQuery(null, 0, limit),
    refetchInterval: (query) =>
      query.state.status !== 'error' && query.state.data?.some((d) => d.status === 'PENDING')
        ? pollIntervalMs
        : false,
  })
}

/**
 * One document, re-checked every few seconds until it is no longer PENDING. When indexing finishes
 * the cached searches and lists are refreshed, so the new content is findable straight away.
 */
export function useDocument(id: string | null) {
  const { pollIntervalMs } = useSettings()
  const queryClient = useQueryClient()
  const previous = useRef<string | null>(null)
  const query = useApiQuery<DocumentResponse>(id ? documentPath(id) : DOCUMENTS_PATH, {
    enabled: id !== null,
    refetchInterval: (q) =>
      q.state.status !== 'error' && q.state.data?.status === 'PENDING' ? pollIntervalMs : false,
  })

  const status = query.data?.status
  useEffect(() => {
    if (previous.current === 'PENDING' && status === 'INDEXED') {
      void queryClient.invalidateQueries({ queryKey: searchKey })
      void queryClient.invalidateQueries({ queryKey: documentsKey })
    }
    previous.current = status ?? null
  }, [status, queryClient])

  return query
}

function useRefreshLibrary() {
  const queryClient = useQueryClient()
  return (id?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: documentsKey }),
      queryClient.invalidateQueries({ queryKey: searchKey }),
      ...(id ? [queryClient.invalidateQueries({ queryKey: documentKey(id) })] : []),
    ])
}

export function useAddNote(onDone?: (response: IngestResponse) => void) {
  const refresh = useRefreshLibrary()
  return useApiMutation<IngestResponse, NoteInput>({
    path: DOCUMENTS_PATH,
    body: buildCreateBody,
    onSuccess: async (response) => {
      await refresh()
      onDone?.(response)
    },
  })
}

export function useUploadFile(onDone?: (response: IngestResponse) => void) {
  const refresh = useRefreshLibrary()
  return useApiMutation<IngestResponse, UploadInput>({
    path: DOCUMENTS_PATH,
    body: buildUploadForm,
    onSuccess: async (response) => {
      await refresh()
      onDone?.(response)
    },
  })
}

export function useReplaceContent(onDone?: (response: IngestResponse) => void) {
  const refresh = useRefreshLibrary()
  return useApiMutation<IngestResponse, ReplaceInput>({
    method: 'PUT',
    path: (v) => documentPath(v.id),
    body: buildUpdateBody,
    onSuccess: async (response, variables) => {
      await refresh(variables.id)
      onDone?.(response)
    },
  })
}

export function useDeleteDocument(onDone?: () => void) {
  const refresh = useRefreshLibrary()
  return useApiMutation<void, { id: string }>({
    method: 'DELETE',
    path: (v) => documentPath(v.id),
    onSuccess: async (_data, variables) => {
      await refresh(variables.id)
      onDone?.()
    },
  })
}

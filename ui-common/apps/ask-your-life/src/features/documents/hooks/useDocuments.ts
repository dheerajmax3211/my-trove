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

/** Whether the library has at least one document (used for the first-use state). */
export function useHasDocuments() {
  return useApiQuery<DocumentResponse[], boolean>(DOCUMENTS_PATH, {
    query: { limit: 1, offset: 0 },
    select: (docs) => docs.length > 0,
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

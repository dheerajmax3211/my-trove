import { apiQueryKey, useApiMutation, useApiQuery } from '@platform/api-client'
import { sharedPaths } from '../../api/paths'
import type { DownloadLink, StoredFile } from './types'

const refresh = () => [apiQueryKey(sharedPaths.files), apiQueryKey(sharedPaths.audit)]

export const useFiles = (householdId?: string) =>
  useApiQuery<StoredFile[]>(sharedPaths.files, {
    query: householdId ? { householdId } : {},
  })

export const useUploadFile = () =>
  useApiMutation<StoredFile, { file: File; householdId: string | null }>({
    path: sharedPaths.files,
    body: ({ file, householdId }) => {
      const form = new FormData()
      form.append('file', file)
      if (householdId) form.append('householdId', householdId)
      return form
    },
    invalidate: refresh(),
  })

export const useDeleteFile = () =>
  useApiMutation<void, { id: string }>({
    method: 'DELETE',
    path: (v) => sharedPaths.file(v.id),
    invalidate: refresh(),
  })

export const useCreateDownloadLink = () =>
  useApiMutation<DownloadLink, { id: string; ttlSeconds: number }>({
    path: (v) => sharedPaths.fileDownloadLink(v.id),
    body: ({ ttlSeconds }) => ({ ttlSeconds }),
    invalidate: [apiQueryKey(sharedPaths.audit)],
  })

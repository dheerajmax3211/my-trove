import { useApiMutation, useApiQuery } from '@platform/api-client'
import { afterVaultChange, paths } from '../../../shared/api/paths'
import type {
  Attribute,
  CreateAttributeBody,
  ReplaceAttributeBody,
} from '../../../shared/api/types'

export function useAttributes() {
  return useApiQuery<Attribute[]>(paths.attributes)
}

export function useCreateAttribute() {
  return useApiMutation<Attribute, CreateAttributeBody>({
    path: paths.attributes,
    invalidate: afterVaultChange,
  })
}

export function useReplaceAttribute() {
  return useApiMutation<Attribute, { keyPath: string; body: ReplaceAttributeBody }>({
    method: 'PUT',
    path: (v) => paths.attribute(v.keyPath),
    body: (v) => v.body,
    invalidate: afterVaultChange,
  })
}

/** Variable: the key path to delete. */
export function useDeleteAttribute() {
  return useApiMutation<void, string>({
    method: 'DELETE',
    path: (keyPath) => paths.attribute(keyPath),
    invalidate: afterVaultChange,
  })
}

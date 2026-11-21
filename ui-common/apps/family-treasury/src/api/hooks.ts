import { useApiClient, type ApiError } from '@platform/api-client'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useMemo, useRef } from 'react'
import { describeError } from '../lib/errors'
import { useIdempotencyKey, type IdempotencyKeyHandle } from '../lib/idempotency'
import { treasuryKeys } from './keys'
import { createTreasuryApi, type TreasuryApi } from './treasuryApi'

export function useTreasuryApi(): TreasuryApi {
  const client = useApiClient()
  return useMemo(() => createTreasuryApi(client), [client])
}

interface QueryOptions {
  enabled?: boolean
}

/** Typed GET with the treasury key scheme and ApiError-typed errors. */
export function useTreasuryQuery<T>(
  queryKey: readonly unknown[],
  fetcher: (api: TreasuryApi) => Promise<T>,
  { enabled = true }: QueryOptions = {},
): UseQueryResult<T, ApiError> {
  const api = useTreasuryApi()
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: () => fetcher(api),
    enabled,
  })
}

export interface IdempotentMutationOptions<TData, TVars> {
  /** Performs the request. `key` is the Idempotency-Key for this intent; pass it through untouched. */
  run: (api: TreasuryApi, vars: TVars, key: string) => Promise<TData>
  /** Household whose cached data to refresh after success (everything under it). */
  householdId?: string | null
  /** Also refresh the list of households (create household). */
  refreshHouseholds?: boolean
  onSuccess?: (data: TData, vars: TVars) => void
}

export interface IdempotentMutation<TData, TVars> {
  mutation: UseMutationResult<TData, ApiError, TVars>
  /**
   * Fire the request. Ignored while one is in flight and after it succeeded (until `mutation.reset()`), so a double
   * click can never send two.
   */
  submit: (vars: TVars) => void
  key: IdempotencyKeyHandle
}

/**
 * A mutation that owns exactly one Idempotency-Key per user intent. The key is reused for every submit of the same
 * intent (double click, retry after a network error), so the server replays instead of posting twice; it is replaced
 * after a success or when the server reports the key was reused with different content.
 */
export function useIdempotentMutation<TData, TVars>({
  run,
  householdId,
  refreshHouseholds,
  onSuccess,
}: IdempotentMutationOptions<TData, TVars>): IdempotentMutation<TData, TVars> {
  const api = useTreasuryApi()
  const queryClient = useQueryClient()
  const key = useIdempotencyKey()
  const inFlight = useRef(false)

  const mutation = useMutation<TData, ApiError, TVars>({
    mutationFn: (vars) => run(api, vars, key.current()),
    onSuccess: async (data, vars) => {
      key.rotate()
      const refreshes: Promise<void>[] = []
      if (householdId) {
        refreshes.push(
          queryClient.invalidateQueries({ queryKey: treasuryKeys.household(householdId) }),
        )
      }
      if (refreshHouseholds) {
        refreshes.push(queryClient.invalidateQueries({ queryKey: treasuryKeys.households() }))
      }
      await Promise.all(refreshes)
      onSuccess?.(data, vars)
    },
    onError: (error) => {
      if (describeError(error).rotateKey) key.rotate()
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  const submit = (vars: TVars) => {
    if (inFlight.current || mutation.isSuccess) return
    inFlight.current = true
    mutation.mutate(vars)
  }
  return { mutation, submit, key }
}

/** A non-idempotent write (settings, members, schedules): same guard against double submits, no key. */
export function useGuardedMutation<TData, TVars>({
  run,
  householdId,
  onSuccess,
}: {
  run: (api: TreasuryApi, vars: TVars) => Promise<TData>
  householdId: string
  onSuccess?: (data: TData, vars: TVars) => void
}): { mutation: UseMutationResult<TData, ApiError, TVars>; submit: (vars: TVars) => void } {
  const api = useTreasuryApi()
  const queryClient = useQueryClient()
  const inFlight = useRef(false)
  const mutation = useMutation<TData, ApiError, TVars>({
    mutationFn: (vars) => run(api, vars),
    onSuccess: async (data, vars) => {
      await queryClient.invalidateQueries({ queryKey: treasuryKeys.household(householdId) })
      onSuccess?.(data, vars)
    },
    onSettled: () => {
      inFlight.current = false
    },
  })
  const submit = (vars: TVars) => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(vars)
  }
  return { mutation, submit }
}

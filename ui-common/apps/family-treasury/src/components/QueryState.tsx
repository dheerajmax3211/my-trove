import type { ApiError } from '@platform/api-client'
import { Skeleton } from '@platform/ui'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorNotice } from './ErrorNotice'

export function LoadingBlock({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="ft-loading" role="status" aria-busy="true">
      <span className="ft-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height="1.25rem" width={i % 2 ? '70%' : '100%'} />
      ))}
    </div>
  )
}

export interface QueryStateProps<T> {
  query: UseQueryResult<T, ApiError>
  /** Shown while the first load is in flight. */
  loading?: ReactNode
  loadingLabel?: string
  errorTitle?: string
  currency?: string
  children: (data: T) => ReactNode
}

/** Loading skeleton, error with retry, or the data: the three states every screen needs. */
export function QueryState<T>({
  query,
  loading,
  loadingLabel,
  errorTitle = 'We could not load this',
  currency,
  children,
}: QueryStateProps<T>) {
  if (query.isPending) return <>{loading ?? <LoadingBlock label={loadingLabel ?? 'Loading'} />}</>
  if (query.isError) {
    return (
      <ErrorNotice
        error={query.error}
        title={errorTitle}
        onRetry={() => void query.refetch()}
        {...(currency ? { currency } : {})}
      />
    )
  }
  return <>{children(query.data)}</>
}

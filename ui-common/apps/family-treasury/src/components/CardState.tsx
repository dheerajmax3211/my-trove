import type { ApiError } from '@platform/api-client'
import { BentoCard } from '@platform/ui'
import type { UseQueryResult } from '@tanstack/react-query'
import type { CSSProperties, ReactNode } from 'react'
import { ErrorNotice } from './ErrorNotice'
import { LoadingBlock } from './QueryState'

/** BentoGrid hands its direct children a className and style (the entrance stagger); cards must pass them on. */
export interface Slot {
  className?: string
  style?: CSSProperties
}

export interface CardStateProps<T> extends Slot {
  query: UseQueryResult<T, ApiError>
  title: string
  icon?: ReactNode
  span?: number
  loadingLabel?: string
  errorTitle?: string
  children: (data: T) => ReactNode
}

/**
 * Like `QueryState`, but the loading and error states are bento cards of the same size, so the grid does not jump
 * when the data arrives. The finished card is whatever `children` returns (a `BentoCard` with the same span).
 */
export function CardState<T>({
  query,
  title,
  icon,
  span = 6,
  loadingLabel,
  errorTitle = 'We could not load this',
  className,
  style,
  children,
}: CardStateProps<T>) {
  if (query.isPending || query.isError) {
    return (
      <BentoCard
        title={title}
        span={span}
        {...(icon ? { icon } : {})}
        {...(className ? { className } : {})}
        {...(style ? { style } : {})}
      >
        {query.isPending ? (
          <LoadingBlock label={loadingLabel ?? `Loading ${title.toLowerCase()}`} rows={3} />
        ) : (
          <ErrorNotice
            error={query.error as ApiError}
            title={errorTitle}
            onRetry={() => void query.refetch()}
          />
        )}
      </BentoCard>
    )
  }
  return <>{children(query.data)}</>
}

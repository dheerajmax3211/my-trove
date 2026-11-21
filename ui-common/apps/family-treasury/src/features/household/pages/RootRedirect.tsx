import { Spinner } from '@platform/ui'
import { useModulePath } from '@platform/workspace-kit'
import { Navigate } from 'react-router-dom'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { readStored } from '../../../lib/storage'
import { useHouseholds } from '../hooks/useHouseholds'
import { LAST_HOUSEHOLD_KEY } from '../nav'

/** The module home goes to the last household you used, the first one you belong to, or the create-household screen. */
export function RootRedirect() {
  const households = useHouseholds()
  const path = useModulePath()
  if (households.isPending) {
    return (
      <div className="ft-center">
        <Spinner size={32} label="Finding your households" />
      </div>
    )
  }
  if (households.isError) {
    return (
      <div className="ft-center">
        <ErrorNotice
          error={households.error}
          title="We could not load your households"
          onRetry={() => void households.refetch()}
        />
      </div>
    )
  }
  const list = households.data
  if (list.length === 0) return <Navigate to={path('/welcome')} replace />
  const last = readStored(LAST_HOUSEHOLD_KEY)
  const target = list.find((h) => h.id === last) ?? list[0]
  return <Navigate to={path(`/h/${target?.id ?? ''}`)} replace />
}

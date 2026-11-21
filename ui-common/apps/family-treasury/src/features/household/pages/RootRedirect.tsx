import { Spinner } from '@platform/ui'
import { Navigate } from 'react-router-dom'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { readStored } from '../../../lib/storage'
import { LAST_HOUSEHOLD_KEY } from '../components/Frame'
import { useHouseholds } from '../hooks/useHouseholds'

/** "/" goes to the last household you used, the first one you belong to, or the create-household screen. */
export function RootRedirect() {
  const households = useHouseholds()
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
  if (list.length === 0) return <Navigate to="/welcome" replace />
  const last = readStored(LAST_HOUSEHOLD_KEY)
  const target = list.find((h) => h.id === last) ?? list[0]
  return <Navigate to={`/h/${target?.id ?? ''}`} replace />
}

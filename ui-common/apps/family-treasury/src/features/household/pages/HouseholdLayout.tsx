import { useAuth } from '@platform/auth-web'
import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { QueryState } from '../../../components/QueryState'
import { writeStored } from '../../../lib/storage'
import { Frame, LAST_HOUSEHOLD_KEY } from '../components/Frame'
import { HouseholdProvider } from '../hooks/useHousehold'
import { useHouseholdDetail } from '../hooks/useHouseholds'
import { navFor } from '../nav'

/** Loads one household and provides it (plus who you are in it) to every screen below. */
export function HouseholdLayout() {
  const { householdId = '' } = useParams()
  const { user } = useAuth()
  const query = useHouseholdDetail(householdId)
  const base = `/h/${householdId}`

  useEffect(() => {
    if (query.data) writeStored(LAST_HOUSEHOLD_KEY, householdId)
  }, [query.data, householdId])

  return (
    <QueryState
      query={query}
      loadingLabel="Loading household"
      errorTitle="We could not open this household"
    >
      {(household) => {
        const me = household.members.find((m) => m.uid === user?.uid)
        return (
          <Frame nav={me ? navFor(me.role, base) : []} currentHouseholdId={householdId}>
            <HouseholdProvider household={household} uid={user?.uid ?? ''}>
              <Outlet />
            </HouseholdProvider>
          </Frame>
        )
      }}
    </QueryState>
  )
}

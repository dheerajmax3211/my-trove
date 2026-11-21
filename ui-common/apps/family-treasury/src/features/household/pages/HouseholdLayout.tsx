import { Button, EmptyState, Illustration } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { QueryState } from '../../../components/QueryState'
import { writeStored } from '../../../lib/storage'
import { useViewerUid } from '../../../viewer'
import { ModuleBar } from '../components/ModuleBar'
import { HouseholdProvider } from '../hooks/useHousehold'
import { useHouseholdDetail } from '../hooks/useHouseholds'
import { LAST_HOUSEHOLD_KEY, sectionsFor } from '../nav'

/** Loads one household and provides it (plus who you are in it) to every screen below. */
export function HouseholdLayout() {
  const { householdId = '' } = useParams()
  const uid = useViewerUid()
  const query = useHouseholdDetail(householdId)

  useEffect(() => {
    if (query.data) writeStored(LAST_HOUSEHOLD_KEY, householdId)
  }, [query.data, householdId])

  const me = query.data?.members.find((m) => m.uid === uid)

  return (
    <>
      <ModuleBar
        currentHouseholdId={householdId}
        sections={me ? sectionsFor(me.role, householdId) : []}
      />
      <QueryState
        query={query}
        loadingLabel="Loading household"
        errorTitle="We could not open this household"
      >
        {(household) =>
          me && uid ? (
            <HouseholdProvider household={household} uid={uid}>
              <Outlet />
            </HouseholdProvider>
          ) : (
            <EmptyState
              illustration={<Illustration name="locked" />}
              title="You are not a member of this household"
              description="Ask its owner to add you from Members and roles. Your own households are in the switcher above."
              action={
                <Button asChild variant="secondary">
                  <ModuleLink to="/">Go to my household</ModuleLink>
                </Button>
              }
            />
          )
        }
      </QueryState>
    </>
  )
}

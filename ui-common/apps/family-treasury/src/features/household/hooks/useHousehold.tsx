import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AccountView, HouseholdView, MemberView, Role } from '../../../api/types'
import { canDebit, canTransferFrom, isTrusted, type Actor } from '../../../lib/permissions'

export interface HouseholdContextValue {
  household: HouseholdView
  me: MemberView
  role: Role
  actor: Actor
  currency: string
  /** Accounts the viewer may see. Kids get only their own pot. */
  accounts: AccountView[]
  pool: AccountView | null
  /** Member pots (asset accounts with an owner), in the household's order. */
  pots: AccountView[]
  myPot: AccountView | null
  /** Asset accounts the viewer can take money out of (spend). */
  spendSources: AccountView[]
  transferSources: AccountView[]
  /** Asset accounts that can receive a transfer or deposit. */
  assets: AccountView[]
  expenseCategories: AccountView[]
  incomeAccounts: AccountView[]
  trusted: boolean
  isKid: boolean
  memberName: (uid: string) => string
  accountName: (id: string) => string
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export function HouseholdProvider({
  household,
  uid,
  children,
}: {
  household: HouseholdView
  uid: string
  children: ReactNode
}) {
  const value = useMemo<HouseholdContextValue | null>(() => {
    const me = household.members.find((m) => m.uid === uid)
    if (!me) return null
    const actor: Actor = { uid, role: me.role }
    const isKid = me.role === 'KID'
    const accounts = household.accounts.filter((a) => !isKid || a.ownerUid === uid)
    const assets = accounts.filter((a) => a.type === 'ASSET')
    const pots = assets.filter((a) => a.ownerUid !== null)
    const names = new Map(household.members.map((m) => [m.uid, m.displayName ?? m.uid]))
    return {
      household,
      me,
      role: me.role,
      actor,
      currency: household.currency,
      accounts,
      pool: assets.find((a) => a.code === 'POOL') ?? null,
      pots,
      myPot: pots.find((a) => a.ownerUid === uid) ?? null,
      spendSources: assets.filter((a) => canDebit(actor, a)),
      transferSources: assets.filter((a) => canTransferFrom(actor, a)),
      assets,
      expenseCategories: accounts.filter((a) => a.type === 'EXPENSE'),
      incomeAccounts: accounts.filter((a) => a.type === 'INCOME'),
      trusted: isTrusted(me.role),
      isKid,
      memberName: (id) => names.get(id) ?? id,
      accountName: (id) => household.accounts.find((a) => a.id === id)?.name ?? 'Unknown account',
    }
  }, [household, uid])

  if (!value) return null
  return <HouseholdContext value={value}>{children}</HouseholdContext>
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within a household route')
  return ctx
}

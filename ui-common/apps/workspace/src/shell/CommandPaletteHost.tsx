import { useAuth } from '@platform/auth-web'
import {
  CommandPalette,
  HomeIcon,
  LogoutIcon,
  SettingsIcon,
  SparkleIcon,
  UserIcon,
  personas,
  useTheme,
  type CommandItem,
} from '@platform/ui'
import { joinPath, useWorkspaceSession } from '@platform/workspace-kit'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModuleMark } from '../components/ModuleMark'
import { PERSONA_LABELS } from '../lib/personas'
import { readJson, writeItem } from '../lib/storage'
import { canOpen, moduleBase, visibleNav } from '../modules/registry'
import { useOnboarding } from '../onboarding/OnboardingProvider'
import { useWorkspace } from '../workspace/context'

const MAX_RECENT = 5
export const recentKey = (uid: string) => `pp.workspace.recent.v1.${uid}`

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

/** ⌘K on a Mac, Ctrl K elsewhere. */
export function hotkeyLabel(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform
  return /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K'
}

/**
 * The command palette: every page the signed-in role may open (each module's navigation, filtered
 * by permission), the workspace pages and a few actions. Pages you opened recently come first.
 */
export function CommandPaletteHost({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { modules, runtime } = useWorkspace()
  const session = useWorkspaceSession()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const onboarding = useOnboarding()
  const { resolvedTheme, setTheme } = useTheme()
  const key = recentKey(session.uid)
  const [recent, setRecent] = useState<string[]>(
    () => readJson(runtime.storage.local, key, isStringList) ?? [],
  )

  const remember = useCallback(
    (id: string) => {
      setRecent((current) => {
        const next = [id, ...current.filter((entry) => entry !== id)].slice(0, MAX_RECENT)
        writeItem(runtime.storage.local, key, JSON.stringify(next))
        return next
      })
    },
    [runtime.storage.local, key],
  )

  const items = useMemo(() => {
    const go = (id: string, to: string) => () => {
      remember(id)
      void navigate(to)
    }
    const pages: CommandItem[] = [
      {
        id: 'page:home',
        label: 'Home',
        hint: 'Today',
        group: 'Workspace',
        keywords: ['today', 'feed', 'dashboard'],
        icon: <HomeIcon size={18} />,
        onSelect: go('page:home', '/'),
      },
      {
        id: 'page:account',
        label: 'Account',
        hint: 'Profile and permissions',
        group: 'Workspace',
        keywords: ['profile', 'role', 'plan', 'settings'],
        icon: <UserIcon size={18} />,
        onSelect: go('page:account', '/account'),
      },
    ]
    for (const module of modules) {
      if (!canOpen(module, session)) continue
      for (const page of visibleNav(module, session)) {
        const id = `nav:${module.id}:${page.to}`
        pages.push({
          id,
          label: page.label,
          group: module.title,
          keywords: [module.title, module.id],
          icon: <ModuleMark module={module} size={20} variant="glyph" />,
          onSelect: go(id, joinPath(moduleBase(module), page.to)),
        })
      }
    }

    const byId = new Map(pages.map((item) => [item.id, item]))
    const recents = recent
      .map((id) => byId.get(id))
      .filter((item) => item !== undefined)
      .map((item): CommandItem => ({
        ...item,
        ...(item.group && item.group !== 'Workspace' ? { hint: item.group } : {}),
        group: 'Recent',
        keywords: [...(item.keywords ?? []), item.group ?? ''],
      }))
    const recentIds = new Set(recents.map((item) => item.id))
    const rest = pages.filter((item) => !recentIds.has(item.id))

    const actions: CommandItem[] = [
      {
        id: 'action:tour',
        label: 'Reopen the welcome tour',
        group: 'Actions',
        keywords: ['onboarding', 'pin', 'products', 'help'],
        icon: <SparkleIcon size={18} />,
        onSelect: () => onboarding.reopen(),
      },
      {
        id: 'action:theme',
        label: resolvedTheme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme',
        group: 'Actions',
        keywords: ['theme', 'dark', 'light', 'appearance'],
        icon: <SettingsIcon size={18} />,
        onSelect: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
    ]
    const demo = runtime.demo
    if (demo) {
      for (const persona of personas) {
        actions.push({
          id: `action:persona:${persona}`,
          label: `View as ${PERSONA_LABELS[persona]}`,
          hint: 'Demo',
          group: 'Demo',
          keywords: ['persona', 'role', 'switch'],
          icon: <UserIcon size={18} />,
          onSelect: () => demo.setPersona(persona),
        })
      }
    }
    actions.push({
      id: 'action:signout',
      label: 'Sign out',
      group: 'Actions',
      keywords: ['log out', 'logout'],
      icon: <LogoutIcon size={18} />,
      onSelect: () => void signOut(),
    })

    return [...recents, ...rest, ...actions]
  }, [
    modules,
    session,
    recent,
    remember,
    navigate,
    onboarding,
    resolvedTheme,
    setTheme,
    runtime.demo,
    signOut,
  ])

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      label="Search the workspace"
      placeholder="Jump to a page or run an action"
      emptyLabel="Nothing matches. Try a product name or a page."
    />
  )
}

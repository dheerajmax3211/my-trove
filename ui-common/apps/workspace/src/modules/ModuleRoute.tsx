import { Callout, EmptyState, KeyValueList } from '@platform/ui'
import { joinPath, useWorkspaceSession, type ProductModule } from '@platform/workspace-kit'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ModuleMark } from '../components/ModuleMark'
import { ForbiddenPage, NotFoundPage } from '../pages/StatusPages'
import { useWorkspace } from '../workspace/context'
import { ModuleScope } from './ModuleScope'
import { canOpen, findModule, moduleBase, visibleNav } from './registry'
import styles from './ModuleRoute.module.css'

/**
 * Development only: a module whose `Routes` renders nothing (a stub from the pre-wiring, or a bug)
 * gets a screen that says so and proves the mount works, instead of a silent blank page.
 */
function EmptyModuleFallback({ module }: { module: ProductModule }) {
  const session = useWorkspaceSession()
  const { store } = useWorkspace()
  const base = moduleBase(module)
  const pages = visibleNav(module, session)
  return (
    <div className={styles.fallback} data-testid="module-fallback">
      <EmptyState
        headingAs="h2"
        icon={<ModuleMark module={module} size={40} />}
        title={`${module.title} has no pages yet`}
        description="This module is mounted, but its Routes rendered nothing. It is probably still a stub. This screen only appears in development."
      />
      <Callout variant="note" title="What the workspace gave this module">
        <KeyValueList
          dense
          layout="stacked"
          items={[
            { label: 'Base path', value: base, mono: true },
            { label: 'API base URL', value: store.forModule(module).baseUrl, mono: true },
            {
              label: 'Required permission',
              value: module.requiredPermission ?? 'products:use',
              mono: true,
            },
          ]}
        />
      </Callout>
      {pages.length > 0 ? (
        <nav aria-label={`${module.title} pages`} className={styles.pages}>
          {pages.map((item) => (
            <Link key={item.to} to={joinPath(base, item.to)}>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  )
}

function ModuleOutlet({ module }: { module: ProductModule }) {
  const outlet = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(false)
  const { Routes } = module

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const element = outlet.current
    if (!element) return
    const check = () =>
      setEmpty(element.childElementCount === 0 && (element.textContent ?? '').trim() === '')
    const observer = new MutationObserver(check)
    observer.observe(element, { childList: true, subtree: true, characterData: true })
    const first = window.setTimeout(check, 0)
    return () => {
      window.clearTimeout(first)
      observer.disconnect()
    }
  }, [module])

  return (
    <>
      <div ref={outlet} className={styles.outlet}>
        <Routes />
      </div>
      {empty ? <EmptyModuleFallback module={module} /> : null}
    </>
  )
}

/** `/app/:id/*`: find the module, check the permission, then mount it. */
export function ModuleRoute() {
  const { id } = useParams()
  const { modules } = useWorkspace()
  const session = useWorkspaceSession()
  const module = findModule(modules, id)

  if (!module) return <NotFoundPage what="product" {...(id ? { id } : {})} />
  if (!canOpen(module, session)) return <ForbiddenPage module={module} />
  return (
    <ModuleScope key={module.id} module={module}>
      <ModuleOutlet module={module} />
    </ModuleScope>
  )
}

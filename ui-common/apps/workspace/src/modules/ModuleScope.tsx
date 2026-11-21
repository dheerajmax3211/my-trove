import { ApiProvider } from '@platform/api-client'
import { ModuleBaseProvider, type ProductModule } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { useWorkspace } from '../workspace/context'
import { moduleBase } from './registry'

/**
 * Everything a module expects around it: its base path, its product accent, its own API client
 * (bound to `${apiBase}/<service>`) with its own query cache, then the module's own `Providers`.
 * Home uses the same scope to run each module's `useTodayItems`, so the feed and the module's pages
 * share one cache.
 */
export function ModuleScope({ module, children }: { module: ProductModule; children: ReactNode }) {
  const { store } = useWorkspace()
  const scoped = store.forModule(module)
  const Providers = module.Providers
  return (
    <ModuleBaseProvider base={moduleBase(module)}>
      <div data-product={module.id}>
        <ApiProvider client={scoped.client} queryClient={scoped.queryClient}>
          {Providers ? <Providers>{children}</Providers> : children}
        </ApiProvider>
      </div>
    </ModuleBaseProvider>
  )
}

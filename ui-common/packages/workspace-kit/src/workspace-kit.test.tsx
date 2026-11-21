import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  ModuleBaseProvider,
  ModuleLink,
  WorkspaceSessionProvider,
  createSession,
  joinPath,
  useModuleNavigate,
  useModulePath,
  useWorkspaceSession,
} from './index'

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function Probe() {
  const path = useModulePath()
  const navigate = useModuleNavigate()
  return (
    <div>
      <p data-testid="path">{path('/new')}</p>
      <ModuleLink to="/items/7">item</ModuleLink>
      <button onClick={() => navigate('/done?ok=1')}>go</button>
      <Where />
    </div>
  )
}

describe('joinPath', () => {
  it('prefixes absolute paths and leaves relative ones alone', () => {
    expect(joinPath('/app/x', '/new')).toBe('/app/x/new')
    expect(joinPath('/app/x/', '/new')).toBe('/app/x/new')
    expect(joinPath('/app/x', '/')).toBe('/app/x')
    expect(joinPath('', '/new')).toBe('/new')
    expect(joinPath('', '/')).toBe('/')
    expect(joinPath('/app/x', 'relative')).toBe('relative')
    expect(joinPath('/app/x', '/a?b=1#c')).toBe('/app/x/a?b=1#c')
  })
})

describe('module-relative navigation', () => {
  it('is the identity without a provider (standalone apps)', async () => {
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('path')).toHaveTextContent('/new')
    expect(screen.getByRole('link', { name: 'item' })).toHaveAttribute('href', '/items/7')
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/done?ok=1')
  })

  it('prefixes links, paths and navigation under a base', async () => {
    render(
      <MemoryRouter initialEntries={['/app/waiting-on']}>
        <Routes>
          <Route
            path="/app/waiting-on/*"
            element={
              <ModuleBaseProvider base="/app/waiting-on">
                <Probe />
              </ModuleBaseProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('path')).toHaveTextContent('/app/waiting-on/new')
    expect(screen.getByRole('link', { name: 'item' })).toHaveAttribute(
      'href',
      '/app/waiting-on/items/7',
    )
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/app/waiting-on/done?ok=1')
  })
})

describe('workspace session', () => {
  function Can({ permission }: { permission: string }) {
    const session = useWorkspaceSession()
    return <p>{session.can(permission) ? 'yes' : 'no'}</p>
  }

  it('allows everything standalone', () => {
    render(<Can permission="anything:at-all" />)
    expect(screen.getByText('yes')).toBeInTheDocument()
  })

  it('checks the permission list inside a workspace', () => {
    const value = createSession({
      uid: 'u',
      email: null,
      displayName: null,
      roles: ['MEMBER'],
      permissions: ['products:use'],
      plan: 'FREE',
      isDemo: false,
    })
    render(
      <WorkspaceSessionProvider value={value}>
        <Can permission="usage:read:all" />
        <Can permission="products:use" />
      </WorkspaceSessionProvider>,
    )
    expect(screen.getAllByText('no')).toHaveLength(1)
    expect(screen.getAllByText('yes')).toHaveLength(1)
  })
})

import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAdmin, type TestPersona } from '../testing/harness'

const PERSONAS: TestPersona[] = ['OWNER', 'ADMIN', 'AUDITOR', 'DEVELOPER', 'MEMBER']

/** Which personas may open which screen (design 5.2). */
const MATRIX: { route: string; heading: string; allowed: TestPersona[] }[] = [
  { route: '/users', heading: 'Users', allowed: ['OWNER', 'ADMIN', 'AUDITOR'] },
  { route: '/roles', heading: 'Roles', allowed: ['OWNER', 'ADMIN', 'AUDITOR'] },
  { route: '/usage', heading: 'Usage', allowed: ['OWNER', 'ADMIN', 'AUDITOR'] },
  { route: '/audit', heading: 'Audit log', allowed: ['OWNER', 'ADMIN', 'AUDITOR'] },
  { route: '/flags', heading: 'Feature flags', allowed: ['OWNER', 'ADMIN'] },
  { route: '/plans', heading: 'Plans', allowed: ['OWNER', 'ADMIN', 'AUDITOR'] },
]

describe('every screen gates itself on its own permission', () => {
  for (const { route, heading, allowed } of MATRIX) {
    for (const persona of PERSONAS) {
      const can = allowed.includes(persona)
      it(`${route} for ${persona}: ${can ? 'opens' : 'is blocked, with no request made'}`, async () => {
        const { requests } = renderAdmin({ persona, route })
        expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
        if (can) {
          expect(screen.queryByText(/is not available to your role/)).not.toBeInTheDocument()
          // the plans table is fixed data; every other screen loads something
          if (route !== '/plans') await waitFor(() => expect(requests.length).toBeGreaterThan(0))
        } else {
          expect(screen.getByText(/is not available to your role/)).toBeInTheDocument()
          expect(screen.getByRole('link', { name: 'Back to the overview' })).toHaveAttribute(
            'href',
            '/app/admin',
          )
          // a blocked screen is not half rendered: it never fetches
          expect(requests).toHaveLength(0)
        }
      })
    }
  }

  it('a user detail deep link is blocked for a MEMBER too', async () => {
    const { requests } = renderAdmin({
      persona: 'MEMBER',
      route: '/users/0190d2a4-7a3e-7c1b-9f2e-000000000006',
    })
    expect(await screen.findByText(/is not available to your role/)).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it('an unknown admin path shows a not-found page', async () => {
    renderAdmin({ route: '/nope' })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})

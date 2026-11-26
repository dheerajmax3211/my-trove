import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AccessRequest } from '../../../shared/api/types'
import { RequestCard } from './RequestCard'

const DAY = 86_400_000

const request = (over: Partial<AccessRequest> = {}): AccessRequest => ({
  id: 'r1',
  clientId: 'c1',
  clientName: 'Stride Shoes',
  scopes: ['profile.sizes:read'],
  purpose: 'Fit',
  durationSeconds: 3600,
  maxReads: null,
  allowedHours: null,
  status: 'PENDING',
  createdAt: new Date(Date.now() - DAY).toISOString(),
  decidedAt: null,
  decisionNote: null,
  grantId: null,
  expiresAt: null,
  ...over,
})

describe('RequestCard deadline', () => {
  it('shows the deadline the gateway sent, not one the UI assumes', () => {
    // created a day ago; a 7-day TTL would say "in 6 days". The server says 2 days (its TTL is a setting).
    const expiresAt = new Date(Date.now() + 2 * DAY).toISOString()
    render(<RequestCard request={request({ expiresAt })} />)
    expect(screen.getByText(/If you do nothing it expires in 2 days/)).toBeInTheDocument()
  })

  it('says nothing about expiry when the request has no deadline', () => {
    render(<RequestCard request={request({ status: 'APPROVED', expiresAt: null })} />)
    expect(screen.queryByText(/If you do nothing/)).not.toBeInTheDocument()
  })
})

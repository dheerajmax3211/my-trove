/* `structuredContent` as mcp-server returned it on the dev stack (2026-11-27), trimmed. */

export const FOLLOW_UPS = {
  items: [
    {
      id: 'item-1',
      title: 'Refund for returned jacket',
      counterparty: 'Northwind Outfitters',
      status: 'NUDGED',
      expectedBy: '2026-11-18',
      amount: '129.99',
      currency: 'USD',
      nextStep: { stage: 'NUDGED', action: 'ESCALATE', at: '2026-12-01T12:00:00Z' },
    },
    {
      id: 'item-2',
      title: 'Insurance claim payout',
      counterparty: 'Contoso Insurance',
      status: 'OPEN',
      expectedBy: '2026-11-26',
      amount: null,
      currency: null,
      nextStep: null,
    },
  ],
  count: 2,
}

export const SEARCH = {
  query: 'When does my passport expire?',
  count: 2,
  passages: [
    {
      rank: 1,
      documentId: 'doc-1',
      title: 'Passport renewal',
      sourceType: 'NOTE',
      createdAt: '2026-11-21T00:34:58Z',
      passage: 'Passport expires in August 2027. Renewal takes about six weeks.',
      score: 0.03,
    },
    {
      rank: 2,
      documentId: 'doc-2',
      title: 'Dentist',
      sourceType: 'NOTE',
      createdAt: '2026-11-21T00:34:59Z',
      passage: 'Dentist appointment moved to the second Tuesday of December.',
      score: 0.01,
    },
  ],
}

export const APPLIANCES = {
  count: 2,
  truncated: false,
  appliances: [
    {
      id: 'app-1',
      name: 'Kitchen fridge',
      type: 'FRIDGE',
      location: 'Kitchen',
      underWarranty: false,
      serviceOverdue: false,
      lastReadingAt: '2026-11-22T08:45:00Z',
      health: 'CRITICAL',
      openAlerts: [
        {
          id: 'alert-1',
          kind: 'STUCK_ON',
          severity: 'CRITICAL',
          status: 'OPEN',
          message: 'Has been running non-stop for 6.3 h; the longest normal run is 30 min.',
          openedAt: '2026-11-22T08:49:22Z',
        },
      ],
    },
    {
      id: 'app-2',
      name: 'Washing machine',
      type: 'WASHER',
      location: 'Utility room',
      underWarranty: true,
      serviceOverdue: false,
      health: 'HEALTHY',
      openAlerts: [],
    },
  ],
}

const accounts = (pool: number) => [
  {
    id: 'a1',
    code: 'ASSET:POOL',
    name: 'Household pool',
    type: 'ASSET',
    currency: 'USD',
    balanceMinor: pool,
    balance: (pool / 100).toFixed(2),
  },
  {
    id: 'a2',
    code: 'INCOME:DEPOSITS',
    name: 'Deposits',
    type: 'INCOME',
    currency: 'USD',
    balanceMinor: 20000,
    balance: '200.00',
  },
]

export const ONE_HOUSEHOLD = {
  count: 1,
  truncated: false,
  households: [{ id: 'hh-1', name: 'The Rao family', currency: 'USD', accounts: accounts(20000) }],
}

export const TWO_HOUSEHOLDS = {
  count: 2,
  truncated: false,
  households: [
    { id: 'hh-1', name: 'The Rao family', currency: 'USD', accounts: accounts(20000) },
    { id: 'hh-2', name: 'Lake house', currency: 'USD', accounts: accounts(12050) },
  ],
}

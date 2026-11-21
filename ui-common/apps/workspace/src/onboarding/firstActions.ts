/** The one concrete thing to do first in each product. `to` is relative to the module base. */
export interface FirstAction {
  title: string
  description: string
  to: string
}

const FIRST_ACTIONS: Record<string, FirstAction> = {
  'waiting-on': {
    title: 'Add something you are waiting on',
    description: 'A refund, a claim, a reply. We follow up until it is settled.',
    to: '/new',
  },
  consent: {
    title: 'Review who can read your data',
    description: 'See each grant, and take any of them back.',
    to: '/grants',
  },
  'home-pulse': {
    title: 'Add your first appliance',
    description: 'Tell Home Pulse what to watch and when to nudge you.',
    to: '/devices',
  },
  'ask-your-life': {
    title: 'Add a note or a document',
    description: 'Save something, then search for it in your own words.',
    to: '/add',
  },
  'digital-legacy': {
    title: 'Name someone you trust',
    description: 'Choose who can open your vault if you are no longer around.',
    to: '/trustees',
  },
  'family-treasury': {
    title: 'Open the household ledger',
    description: 'See balances, approvals and allowances for your household.',
    to: '/',
  },
  core: {
    title: 'Set up your household',
    description: 'Add the people, reminders and files the other products share.',
    to: '/households',
  },
}

/** Falls back to opening the product, for a product this table does not know. */
export function firstActionFor(module: {
  id: string
  title: string
  tagline: string
}): FirstAction {
  return (
    FIRST_ACTIONS[module.id] ?? {
      title: `Open ${module.title}`,
      description: module.tagline,
      to: '/',
    }
  )
}

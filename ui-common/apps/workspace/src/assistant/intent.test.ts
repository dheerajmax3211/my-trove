import { describe, expect, it } from 'vitest'
import { MAX_QUERY, householdNamedIn, routeQuestion, type ToolName } from './intent'

const TABLE: [string, ToolName][] = [
  // Waiting On
  ['What am I waiting on?', 'waiting_on_list_followups'],
  ['what am i waiting for', 'waiting_on_list_followups'],
  ['Any follow-ups due?', 'waiting_on_list_followups'],
  ['show my followups', 'waiting_on_list_followups'],
  ['Which follow up is next', 'waiting_on_list_followups'],
  ['What am I owed?', 'waiting_on_list_followups'],
  // Home Pulse
  ['Is the fridge OK?', 'home_pulse_appliance_status'],
  ['How are my appliances?', 'home_pulse_appliance_status'],
  ['Any alerts?', 'home_pulse_appliance_status'],
  ['Did the power go out', 'home_pulse_appliance_status'],
  ['Is the freezer running?', 'home_pulse_appliance_status'],
  // Family Treasury
  ['What is our household balance?', 'family_treasury_ledger_summary'],
  ['Show the ledger', 'family_treasury_ledger_summary'],
  ['How much money is in the pool?', 'family_treasury_ledger_summary'],
  ['household accounts', 'family_treasury_ledger_summary'],
  // Everything else: a search
  ['When does my passport expire?', 'ask_your_life_search'],
  ['boiler warranty', 'ask_your_life_search'],
  ['alerting', 'ask_your_life_search'], // whole words only
  ['powerful', 'ask_your_life_search'],
  ['moneybox receipt', 'ask_your_life_search'],
]

describe('routeQuestion (the intent table)', () => {
  it.each(TABLE)('%s -> %s', (question, tool) => {
    expect(routeQuestion(question)?.tool).toBe(tool)
  })

  it('checks the rules in order: Waiting On before Home Pulse before Family Treasury', () => {
    expect(routeQuestion('waiting on the fridge alert')?.tool).toBe('waiting_on_list_followups')
    expect(routeQuestion('fridge power money')?.tool).toBe('home_pulse_appliance_status')
  })

  it('ignores case, curly quotes and extra spaces', () => {
    expect(routeQuestion('  WHAT   AM I  WAITING   ON  ')?.tool).toBe('waiting_on_list_followups')
    expect(routeQuestion('What’s the BALANCE')?.tool).toBe('family_treasury_ledger_summary')
  })

  it('passes nothing but the question to a search, trimmed and capped at 500 characters', () => {
    expect(routeQuestion('  passport   renewal ')).toEqual({
      tool: 'ask_your_life_search',
      arguments: { query: 'passport renewal' },
    })
    const long = routeQuestion('x'.repeat(800))
    expect(long?.tool).toBe('ask_your_life_search')
    expect(long?.tool === 'ask_your_life_search' && long.arguments.query.length).toBe(MAX_QUERY)
  })

  it('sends no arguments to the other tools', () => {
    expect(routeQuestion('Is the fridge OK?')).toEqual({
      tool: 'home_pulse_appliance_status',
      arguments: {},
    })
  })

  it('asks nothing for an empty question', () => {
    expect(routeQuestion('')).toBeNull()
    expect(routeQuestion('   ')).toBeNull()
  })
})

describe('householdNamedIn', () => {
  const households = [
    { id: '1', name: 'The Rao family' },
    { id: '2', name: 'Rao' },
    { id: '3', name: 'Lake house' },
  ]

  it('finds a household the question names, the most specific first', () => {
    expect(householdNamedIn('balance of the rao family', households)?.id).toBe('1')
    expect(householdNamedIn('LAKE HOUSE money', households)?.id).toBe('3')
  })

  it('returns null when none is named', () => {
    expect(householdNamedIn('what is our balance', households)).toBeNull()
  })
})

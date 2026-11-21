import type { SourceType } from '../features/documents/api/types'

export interface SeedDocument {
  title: string
  sourceType: SourceType
  mimeType: string
  text: string
  createdAt: string
  externalId?: string
}

/** What the demo library starts with. Dates are fixed so the filters make sense. */
export const SEED_DOCUMENTS: readonly SeedDocument[] = [
  {
    title: 'Apartment lease: 14 Elm Street',
    sourceType: 'FILE',
    mimeType: 'text/markdown',
    createdAt: '2026-01-12T10:00:00.000Z',
    text: `Residential lease for 14 Elm Street, unit 3B. The term runs twelve months starting February 1.

Monthly rent is $1,850, due on the first of the month. A security deposit of $1,850 is held in escrow and returned within 30 days of move-out, minus documented damage.

The landlord must install a working smoke detector in every bedroom. Tenants may keep one cat with a $300 pet deposit.`,
  },
  {
    title: 'Landlord email about the deposit',
    sourceType: 'EMAIL',
    mimeType: 'text/plain',
    createdAt: '2026-03-02T16:30:00.000Z',
    text: `Hi, thanks for sending the signed lease back. I confirm the deposit of $1,850 arrived on Monday and is sitting in the escrow account.

Please remember to schedule the move-in inspection before you pick up the keys.`,
  },
  {
    title: 'Hardware store receipt',
    sourceType: 'RECEIPT',
    mimeType: 'text/plain',
    createdAt: '2026-05-18T09:15:00.000Z',
    text: `Ridgeline Hardware. Purchase on May 18. Smoke detector 2-pack $34.98. Ceiling paint, one gallon, $28.50. Total paid: $63.48 by card.`,
  },
  {
    title: 'Car repair invoice',
    sourceType: 'RECEIPT',
    mimeType: 'text/plain',
    createdAt: '2026-06-09T14:00:00.000Z',
    text: `Northside Auto Service invoice 2231. Replaced the front brake pads and rotors on the 2019 Honda Civic. Parts $212.00, labor $140.00, total $352.00. Next service due in 6 months.`,
  },
  {
    title: 'Car insurance policy summary',
    sourceType: 'FILE',
    mimeType: 'text/html',
    createdAt: '2026-07-21T08:00:00.000Z',
    text: `Auto insurance policy summary. Coverage: liability 100/300, collision with a $500 deductible, comprehensive with a $250 deductible. The annual premium is $1,284, billed in two installments. The policy renews on September 1.`,
  },
  {
    title: 'Trip planning: Lisbon in October',
    sourceType: 'NOTE',
    mimeType: 'text/markdown',
    createdAt: '2026-08-30T19:45:00.000Z',
    text: `Flights land at 9:40 am on October 12. The hotel is near Alfama and check-in opens at 3 pm.

Ideas for the vacation: tram 28, the Belem pastry shop, a day trip to Sintra. Budget about 150 euros per day for food and tickets.`,
  },
  {
    title: 'Dentist appointment notes',
    sourceType: 'NOTE',
    mimeType: 'text/markdown',
    createdAt: '2026-10-05T11:20:00.000Z',
    text: `Checkup with the dentist went fine. One small cavity to fill, booked for November 24 at 2 pm. Remember to bring the insurance card and ask about the cleaning schedule.`,
  },
  {
    title: 'Tax documents checklist',
    sourceType: 'NOTE',
    mimeType: 'text/markdown',
    createdAt: '2026-11-10T07:30:00.000Z',
    text: `Gather the W-2, the mortgage interest statement and the receipts for charitable donations. Ask the accountant whether the home office deduction applies. The refund last year was $1,120.`,
  },
]

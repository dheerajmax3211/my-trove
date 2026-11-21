export interface SampleRequest {
  id: string
  title: string
  person: string
  due: Date
  status: 'open' | 'done' | 'overdue'
  amount: number | null
}

export const sampleRequests: SampleRequest[] = [
  {
    id: 'r1',
    title: 'Signed lease addendum',
    person: 'Priya Natarajan',
    due: new Date('2026-12-02'),
    status: 'open',
    amount: 1200,
  },
  {
    id: 'r2',
    title: 'Vendor W-9',
    person: 'Marcus Webb',
    due: new Date('2026-11-12'),
    status: 'overdue',
    amount: null,
  },
  {
    id: 'r3',
    title: 'Design review notes',
    person: 'Aiko Tanaka',
    due: new Date('2026-11-24'),
    status: 'open',
    amount: 80,
  },
  {
    id: 'r4',
    title: 'Updated insurance certificate',
    person: 'Dev Patel',
    due: new Date('2026-10-30'),
    status: 'done',
    amount: 450,
  },
  {
    id: 'r5',
    title: 'Venue deposit receipt',
    person: 'Lena Fischer',
    due: new Date('2026-12-15'),
    status: 'open',
    amount: 2500,
  },
]

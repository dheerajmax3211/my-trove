import { describe, expect, it } from 'vitest'
import { validate, type Schema } from './validate'

const folder = (entries: Record<string, Schema>) => new Map(Object.entries(entries))

const thing: Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'count', 'state', 'at', 'on', 'note'],
  properties: {
    id: { type: 'string' },
    count: { type: 'integer' },
    state: { enum: ['A', 'B'] },
    at: { type: 'string', format: 'date-time' },
    on: { type: 'string', format: 'date' },
    note: { type: ['string', 'null'] },
    tags: { type: 'array', items: { $ref: '#/$defs/tag' } },
  },
  $defs: { tag: { type: 'string' } },
}
const list: Schema = { type: 'array', items: { $ref: 'thing.schema.json' } }
const schemas = folder({ 'thing.schema.json': thing, 'list.schema.json': list })

const good = {
  id: 'x',
  count: 2,
  state: 'A',
  at: '2026-11-26T10:00:00.123Z',
  on: '2026-11-26',
  note: null,
  tags: ['t'],
}

describe('contract validator', () => {
  it('accepts a matching value, nulls where the type allows them, and offsets in date-times', () => {
    expect(validate(schemas, 'thing.schema.json', good)).toEqual([])
    expect(
      validate(schemas, 'thing.schema.json', { ...good, at: '2026-11-26T10:00:00+05:30' }),
    ).toEqual([])
  })

  it('reports missing, unexpected, mistyped, out-of-enum and badly formatted values', () => {
    const { note: _note, ...missing } = good
    expect(validate(schemas, 'thing.schema.json', missing)).toEqual([
      '$: missing required property "note"',
    ])
    expect(validate(schemas, 'thing.schema.json', { ...good, extra: 1 })).toEqual([
      '$: unexpected property "extra"',
    ])
    expect(validate(schemas, 'thing.schema.json', { ...good, count: 1.5 })).toEqual([
      '$.count: expected integer, got number',
    ])
    expect(validate(schemas, 'thing.schema.json', { ...good, state: 'C' })).toEqual([
      '$.state: "C" is not one of ["A","B"]',
    ])
    expect(validate(schemas, 'thing.schema.json', { ...good, at: '2026-11-26' })).toEqual([
      '$.at: "2026-11-26" is not an RFC 3339 date-time',
    ])
    expect(validate(schemas, 'thing.schema.json', { ...good, on: '26/11/2026' })).toEqual([
      '$.on: "26/11/2026" is not a YYYY-MM-DD date',
    ])
  })

  it('follows local and cross-file $refs into arrays', () => {
    expect(validate(schemas, 'list.schema.json', [good, { ...good, tags: [1] }])).toEqual([
      '$[1].tags[0]: expected string, got number',
    ])
  })

  it('refuses keywords it does not implement instead of ignoring them', () => {
    const loose = folder({ 'a.schema.json': { type: 'string', minLength: 3 } })
    expect(() => validate(loose, 'a.schema.json', 'ab')).toThrow(/Unsupported schema keyword "minLength"/)
  })
})

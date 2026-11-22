import { describe, expect, it } from 'vitest'
import { MAX_REDIRECT_URIS, parseRedirectUris, validateCallbackUrl } from './urls'

describe('validateCallbackUrl', () => {
  it('accepts https addresses', () => {
    expect(validateCallbackUrl('https://app.example.test/cb')).toBeNull()
  })

  it('accepts http only on localhost and 127.0.0.1, for local development', () => {
    expect(validateCallbackUrl('http://localhost:3000/cb')).toBeNull()
    expect(validateCallbackUrl('http://127.0.0.1:8080/hook')).toBeNull()
  })

  it('refuses plain http on any other host, and hosts that only start with localhost', () => {
    expect(validateCallbackUrl('http://app.example.test/cb')).toMatch(/https/)
    expect(validateCallbackUrl('http://localhost.example.test/cb')).toMatch(/https/)
  })

  it('refuses other schemes, malformed text and an empty value', () => {
    expect(validateCallbackUrl('javascript:alert(1)')).toMatch(/https/)
    expect(validateCallbackUrl('ftp://example.test/cb')).toMatch(/https/)
    expect(validateCallbackUrl('not a url')).toMatch(/full address/)
    expect(validateCallbackUrl('')).toMatch(/Enter an address/)
  })

  it('refuses addresses longer than the server accepts', () => {
    expect(validateCallbackUrl(`https://example.test/${'a'.repeat(2048)}`)).toMatch(/2048/)
  })
})

describe('parseRedirectUris', () => {
  it('splits on new lines and drops blank lines', () => {
    expect(parseRedirectUris('https://a.example.test/cb\n\n  http://localhost:3000/cb  \n')).toEqual({
      uris: ['https://a.example.test/cb', 'http://localhost:3000/cb'],
    })
  })

  it('reports an error for the first invalid address and for too many addresses', () => {
    expect(parseRedirectUris('https://a.example.test/cb\nhttp://b.example.test/cb').error).toMatch(
      /https/,
    )
    const many = Array.from(
      { length: MAX_REDIRECT_URIS + 1 },
      (_, i) => `https://a${i}.example.test/cb`,
    )
    expect(parseRedirectUris(many.join('\n')).error).toMatch(/up to 10/)
  })

  it('returns no addresses and no error for an empty box', () => {
    expect(parseRedirectUris('  \n ')).toEqual({ uris: [] })
  })
})

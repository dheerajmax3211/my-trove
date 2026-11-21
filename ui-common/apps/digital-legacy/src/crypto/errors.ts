export type CryptoErrorCode =
  'bad-format' | 'wrong-key' | 'wrong-passphrase' | 'unsupported' | 'key-mismatch'

/** Every expected failure of the crypto layer, with a code the UI maps to plain language. */
export class LegacyCryptoError extends Error {
  readonly code: CryptoErrorCode
  constructor(code: CryptoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LegacyCryptoError'
    this.code = code
  }
}

export function isCryptoError(error: unknown, code?: CryptoErrorCode): error is LegacyCryptoError {
  return error instanceof LegacyCryptoError && (code === undefined || error.code === code)
}

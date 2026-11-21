import { Card, CardContent } from '@platform/ui'

/** Always visible on the vault page: what stays on this device and what is uploaded. */
export function LocalEncryptionNotice() {
  return (
    <Card className="encrypted-banner">
      <CardContent>
        <div className="stack-2">
          <strong>Encrypted on this device, before anything is uploaded</strong>
          <p style={{ margin: 0 }}>
            What you write below is turned into ciphertext in your browser with AES-256-GCM, under a
            random key that never leaves it. The server receives only the ciphertext, a nonce and
            the algorithm name. It cannot read your vault, and neither can we.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Your text and your key are never written to local storage, cookies or logs. Reload or
            lock the page and they are gone from memory, which is why you keep a key file.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

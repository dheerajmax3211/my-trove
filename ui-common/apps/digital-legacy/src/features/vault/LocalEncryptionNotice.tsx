import { KeyCut } from '@platform/ui'

/** Always visible on the vault page: what stays on this device and what is uploaded, in three plain facts. */
export function LocalEncryptionNotice() {
  return (
    <section className="sealed-band pp-grain" data-surface="vault" aria-labelledby="sealed-title">
      <h2 id="sealed-title">Locked here, before anything is uploaded</h2>
      <p>
        What you write below is turned into ciphertext in this browser with AES-256-GCM, under a
        random key that never leaves it. The server receives only the ciphertext, a nonce and the
        algorithm name. It cannot read your vault, and neither can we.
      </p>
      <ul className="sealed-facts">
        <li>
          <strong>Written here</strong>
          <span>Your text exists only in this tab while you edit.</span>
        </li>
        <li>
          <strong>Locked here</strong>
          <span>The key is held in memory and is wiped when you lock, sign out or reload.</span>
        </li>
        <li>
          <strong>Never stored</strong>
          <span>Your text and key are not written to local storage, cookies or logs.</span>
        </li>
      </ul>
      <p className="small">
        That is why you keep a key file: it is the only way back in after you lock the vault.
      </p>
      <KeyCut className="sealed-keycut" height={16} />
    </section>
  )
}

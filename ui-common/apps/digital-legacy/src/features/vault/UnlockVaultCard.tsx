import { BentoCard, Button, Field, Input, KeyIcon } from '@platform/ui'
import type { CSSProperties } from 'react'
import { useState, type FormEvent } from 'react'
import { ErrorNotice } from '../../components/ErrorNotice'
import { KeyFilePicker } from '../../components/KeyFilePicker'
import { openVaultKeyFile, parseVaultKeyFile } from '../../crypto'
import { useOwnerApi } from '../queries'
import { useVaultKey } from './VaultKeyContext'
import { openVault } from './vaultService'

/** Brings the vault key back into memory from the owner's key file, proving it by decrypting the vault. */
export function UnlockVaultCard({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  const api = useOwnerApi()
  const { unlock } = useVaultKey()
  const [fileText, setFileText] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const key = await openVaultKeyFile(parseVaultKeyFile(fileText), passphrase)
      await openVault(api, key) // throws if this key is not the one that sealed this vault
      unlock(key)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <BentoCard
      span={8}

      title="Unlock your vault"
      icon={<KeyIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="stack-3">
        <p className="small muted" style={{ margin: 0 }}>
          Your vault key is not kept anywhere in this browser. Load your key file and enter its
          passphrase to read or edit the vault. Decryption happens on this device.
        </p>
        <form className="stack-3" onSubmit={(e) => void onSubmit(e)} noValidate>
          <KeyFilePicker label="Vault key file" value={fileText} onChange={setFileText} />
          <Field label="Passphrase" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </Field>
          {error ? <ErrorNotice error={error} title="Could not unlock the vault" /> : null}
          <div>
            <Button
              type="submit"
              loading={busy}
              disabled={fileText.trim() === '' || passphrase === ''}
            >
              Unlock vault
            </Button>
          </div>
        </form>
      </div>
    </BentoCard>
  )
}

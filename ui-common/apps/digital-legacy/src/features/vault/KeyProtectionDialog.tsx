import { Button, Checkbox, Dialog, DialogClose, Field, Input } from '@platform/ui'
import { useState } from 'react'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import {
  createVaultKeyFile,
  MIN_PASSPHRASE_LENGTH,
  serializeVaultKeyFile,
  type Bytes,
} from '../../crypto'
import { downloadTextFile } from '../../lib/files'

/**
 * Makes the owner back up the vault key before it is used. The key exists only in memory, so the
 * passphrase-protected file is the one way back in. The dialog cannot be completed without
 * downloading it and confirming it is stored somewhere safe.
 */
export function KeyProtectionDialog({
  open,
  onOpenChange,
  vaultKey,
  title,
  confirmLabel,
  busy,
  error,
  onConfirmed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaultKey: Bytes | null
  title: string
  confirmLabel: string
  busy: boolean
  error: unknown
  onConfirmed: () => void
}) {
  const [passphrase, setPassphrase] = useState('')
  const [repeat, setRepeat] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fileError, setFileError] = useState<unknown>(null)
  const [working, setWorking] = useState(false)

  const tooShort = passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE_LENGTH
  const mismatch = repeat.length > 0 && repeat !== passphrase
  const ready = passphrase.length >= MIN_PASSPHRASE_LENGTH && repeat === passphrase

  const download = async () => {
    if (!vaultKey) return
    setWorking(true)
    setFileError(null)
    try {
      const file = await createVaultKeyFile(vaultKey, passphrase)
      downloadTextFile('digital-legacy-vault-key.json', serializeVaultKeyFile(file))
      setDownloaded(true)
    } catch (e) {
      setFileError(e)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassphrase('')
          setRepeat('')
          setDownloaded(false)
          setSaved(false)
          setFileError(null)
        }
        onOpenChange(next)
      }}
      title={title}
      description="Your vault key is random and lives only in this browser tab. Save it in a file protected by a passphrase of your choosing."
      dismissible={!busy}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button disabled={!downloaded || !saved} loading={busy} onClick={onConfirmed}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack-3">
        <Callout tone="warning" title="If you lose this file or forget the passphrase">
          <p>
            You will not be able to edit your vault again. Your trustees could still open it after a
            release, but nobody can recover the key for you: not us, not support.
          </p>
        </Callout>
        <Field
          label="Passphrase"
          description={`At least ${MIN_PASSPHRASE_LENGTH} characters. A few unrelated words works well.`}
          error={tooShort ? `Use at least ${MIN_PASSPHRASE_LENGTH} characters.` : undefined}
          required
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value)
              setDownloaded(false)
            }}
          />
        </Field>
        <Field
          label="Repeat the passphrase"
          error={mismatch ? 'The passphrases do not match.' : undefined}
          required
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => {
              setRepeat(e.target.value)
              setDownloaded(false)
            }}
          />
        </Field>
        <div className="row-wrap">
          <Button
            variant="secondary"
            disabled={!ready || !vaultKey}
            loading={working}
            onClick={() => void download()}
          >
            Download key file
          </Button>
          {downloaded ? <span role="status">Key file downloaded.</span> : null}
        </div>
        {fileError ? <ErrorNotice error={fileError} title="Could not create the key file" /> : null}
        <Checkbox
          checked={saved}
          onCheckedChange={(c) => setSaved(c === true)}
          disabled={!downloaded}
          label="I have saved the key file somewhere safe and I will remember the passphrase"
        />
        {error ? <ErrorNotice error={error} title="Could not save the vault" /> : null}
      </div>
    </Dialog>
  )
}

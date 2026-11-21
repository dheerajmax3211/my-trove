import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  EmptyState,
  Field,
  IconButton,
  Input,
  PlusIcon,
  CloseIcon,
  Textarea,
  useToast,
} from '@platform/ui'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { VaultSummary } from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { generateVaultKey, type Bytes, type VaultDocument, type VaultEntry } from '../../crypto'
import { formatBytes } from '../../lib/format'
import { useOwnerApi, useRefreshOwnerData } from '../queries'
import { KeyProtectionDialog } from './KeyProtectionDialog'
import { useVaultKey } from './VaultKeyContext'
import { documentSize, MAX_PLAINTEXT_BYTES, openVault, saveVault } from './vaultService'

const newEntry = (): VaultEntry => ({ id: globalThis.crypto.randomUUID(), title: '', body: '' })

const sameDocument = (a: VaultEntry[], b: VaultEntry[]) => JSON.stringify(a) === JSON.stringify(b)

interface Props {
  /** Null while creating the very first version of the vault. */
  vault: VaultSummary | null
  /** Whether the switch allows content changes (ACTIVE). */
  editable: boolean
}

/**
 * Edits the vault. The plaintext exists only in this component's state; saving encrypts it here and
 * uploads ciphertext. Creating or rotating generates a fresh key and forces a key-file backup first.
 */
export function VaultEditor({ vault, editable }: Props) {
  const api = useOwnerApi()
  const { toast } = useToast()
  const { key, unlock } = useVaultKey()
  const refresh = useRefreshOwnerData()

  const [entries, setEntries] = useState<VaultEntry[]>(() => (vault ? [] : [newEntry()]))
  const [saved, setSaved] = useState<VaultEntry[]>([])
  const [loadError, setLoadError] = useState<unknown>(null)
  const [loaded, setLoaded] = useState(vault === null)
  const [showErrors, setShowErrors] = useState(false)

  // pending key backup: a fresh key for create / rotate, not yet used for anything
  const [pending, setPending] = useState<{ mode: 'create' | 'rotate'; key: Bytes } | null>(null)
  const [rotateConfirm, setRotateConfirm] = useState(false)

  const hasVault = vault !== null
  const revision = vault?.contentRevision
  const keyVersion = vault?.vaultVersion
  useEffect(() => {
    if (!hasVault || !key) return
    let cancelled = false
    openVault(api, key).then(
      (doc) => {
        if (cancelled) return
        setEntries(doc.entries)
        setSaved(doc.entries)
        setLoaded(true)
      },
      (e: unknown) => {
        if (!cancelled) setLoadError(e)
      },
    )
    return () => {
      cancelled = true
    }
    // reload when the stored ciphertext changed (a new revision or key version), not on every render
  }, [api, key, hasVault, revision, keyVersion])

  const doc: VaultDocument = useMemo(() => ({ v: 1, entries }), [entries])
  const size = documentSize(doc)
  const dirty = vault === null || !sameDocument(entries, saved)
  const titleMissing = entries.some((e) => e.title.trim() === '')
  const tooBig = size > MAX_PLAINTEXT_BYTES

  const save = useMutation({
    mutationFn: async (args: { mode: 'create' | 'update' | 'rotate'; key: Bytes }) => {
      await saveVault(api, args.key, doc, args.mode)
      return args
    },
    onSuccess: async (args) => {
      if (args.mode !== 'update') unlock(args.key)
      setSaved(entries)
      setPending(null)
      await refresh()
      toast({
        title:
          args.mode === 'create'
            ? 'Vault created'
            : args.mode === 'rotate'
              ? 'Key rotated'
              : 'Vault saved',
        description:
          args.mode === 'rotate'
            ? 'All trustee shares were wiped and the switch disarmed. Seal new shares on the Trustees page.'
            : 'Encrypted here, then uploaded as ciphertext.',
        variant: 'success',
      })
    },
  })

  const update = (id: string, patch: Partial<VaultEntry>) =>
    setEntries((current) => current.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const submit = () => {
    setShowErrors(true)
    if (titleMissing || tooBig) return
    if (vault === null) setPending({ mode: 'create', key: generateVaultKey() })
    else if (key) save.mutate({ mode: 'update', key })
  }

  if (loadError) return <ErrorNotice error={loadError} title="Could not open the vault" />
  if (!loaded) return <PageSkeleton label="Decrypting your vault" />

  return (
    <div className="stack-3">
      {!editable ? (
        <Callout tone="warning" title="The vault is read-only right now">
          <p>
            The server only accepts changes while the switch is quiet. Check in on the Overview
            page, then edit.
          </p>
        </Callout>
      ) : null}
      <Card className="plaintext-area" aria-labelledby="entries-title">
        <CardHeader>
          <div className="row-wrap">
            <CardTitle as="h2" id="entries-title">
              What you are leaving
            </CardTitle>
            {dirty ? (
              <Badge variant="warning">Unsaved changes</Badge>
            ) : (
              <Badge variant="success">Saved</Badge>
            )}
          </div>
          <CardDescription>
            Account locations, instructions, letters, passwords. Each entry is a title and free
            text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            {entries.length === 0 ? (
              <EmptyState
                headingAs="h3"
                title="Nothing here yet"
                description="Add the first thing you want your trustees to find."
                action={
                  <Button
                    leftIcon={<PlusIcon size={16} />}
                    disabled={!editable}
                    onClick={() => setEntries([newEntry()])}
                  >
                    Add an entry
                  </Button>
                }
              />
            ) : (
              entries.map((entry, index) => (
                <div key={entry.id} className="entry-card">
                  <Field
                    label={`Title of entry ${index + 1}`}
                    error={
                      showErrors && entry.title.trim() === ''
                        ? 'Give this entry a title.'
                        : undefined
                    }
                  >
                    <Input
                      value={entry.title}
                      disabled={!editable}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => update(entry.id, { title: e.target.value })}
                    />
                  </Field>
                  <Field label={`Contents of entry ${index + 1}`}>
                    <Textarea
                      rows={5}
                      value={entry.body}
                      disabled={!editable}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => update(entry.id, { body: e.target.value })}
                    />
                  </Field>
                  <div>
                    <IconButton
                      label={`Remove entry ${index + 1}`}
                      icon={<CloseIcon size={16} />}
                      disabled={!editable}
                      onClick={() => setEntries((c) => c.filter((e) => e.id !== entry.id))}
                    />
                  </div>
                </div>
              ))
            )}
            {entries.length > 0 ? (
              <div>
                <Button
                  variant="secondary"
                  leftIcon={<PlusIcon size={16} />}
                  disabled={!editable}
                  onClick={() => setEntries((c) => [...c, newEntry()])}
                >
                  Add another entry
                </Button>
              </div>
            ) : null}
            <p className="small muted" style={{ margin: 0 }} role="status">
              {formatBytes(size)} of {formatBytes(MAX_PLAINTEXT_BYTES)} used
            </p>
            {showErrors && tooBig ? (
              <Callout tone="danger" role="alert" title="This is too large to store">
                <p>
                  Shorten the text, or move large files out of the vault and point to them instead.
                </p>
              </Callout>
            ) : null}
            {save.error && !pending ? (
              <ErrorNotice error={save.error} title="Could not save" />
            ) : null}
            <div className="row-wrap">
              <Button
                loading={save.isPending && !pending}
                disabled={!editable || (vault !== null && !dirty)}
                onClick={submit}
              >
                {vault === null ? 'Encrypt and create vault' : 'Encrypt and save'}
              </Button>
              {vault ? (
                <Button
                  variant="danger"
                  disabled={!editable}
                  onClick={() => setRotateConfirm(true)}
                >
                  Rotate the vault key
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <KeyProtectionDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        vaultKey={pending?.key ?? null}
        title={pending?.mode === 'rotate' ? 'Back up your new vault key' : 'Back up your vault key'}
        confirmLabel={pending?.mode === 'rotate' ? 'Rotate key and upload' : 'Create vault'}
        busy={save.isPending}
        error={pending ? save.error : null}
        onConfirmed={() => pending && save.mutate({ mode: pending.mode, key: pending.key })}
      />

      <Dialog
        open={rotateConfirm}
        onOpenChange={setRotateConfirm}
        title="Rotate the vault key?"
        description="Use this if you think the key or a trustee share may have been exposed."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                setRotateConfirm(false)
                setPending({ mode: 'rotate', key: generateVaultKey() })
              }}
            >
              Rotate the key
            </Button>
          </>
        }
      >
        <ul className="stack-2" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Your vault is re-encrypted under a brand new key.</li>
          <li>Every trustee share is wiped, and the switch is disarmed.</li>
          <li>You must seal new shares to your trustees and arm the switch again.</li>
          <li>Your old key file stops working.</li>
        </ul>
      </Dialog>
    </div>
  )
}

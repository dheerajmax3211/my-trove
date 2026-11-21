import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
} from '@platform/ui'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CHANNELS, type ChannelType, type Contact } from '../../api/types'
import { Callout } from '../../components/Callout'
import { CopyButton } from '../../components/CopyButton'
import { ErrorNotice } from '../../components/ErrorNotice'
import { Fingerprint } from '../../components/Fingerprint'
import {
  createTrusteeKeyFile,
  fingerprintOf,
  generateTrusteeKeyPair,
  serializeTrusteeKeyFile,
  type TrusteeKeyMaterial,
} from '../../crypto'
import { downloadTextFile } from '../../lib/files'
import { contactError } from '../policy/policyForm'
import { useTrusteeSession } from './TrusteeSession'
import { registerTrustee, type Registration } from './trusteeService'

const CHANNEL_LABEL: Record<ChannelType, string> = {
  EMAIL: 'Email',
  SMS: 'Text message',
  PUSH: 'Push',
}

function inviteFromLocation(hash: string, state: unknown): string {
  const fromHash = /^#invite=([^&]+)/.exec(hash)?.[1]
  if (fromHash) return decodeURIComponent(fromHash)
  const fromState = (state as { invite?: unknown } | null)?.invite
  return typeof fromState === 'string' ? fromState : ''
}

/**
 * Accepting an invite. The key pair is generated here, in this browser: the server is only ever
 * given the public half. The trustee must save the private key file before registering.
 */
export function AcceptPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { api, remember } = useTrusteeSession()

  const [invite, setInvite] = useState(() => inviteFromLocation(location.hash, location.state))
  const [contacts, setContacts] = useState<Contact[]>([{ channel: 'EMAIL', address: '' }])
  const [material, setMaterial] = useState<TrusteeKeyMaterial | null>(null)
  const [fingerprint, setFingerprint] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState<'key' | 'file' | 'register' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<Registration | null>(null)

  // keep the invite out of the address bar and browser history as soon as it has been read
  useEffect(() => {
    if (location.hash) void navigate(location.pathname, { replace: true })
  }, [location.hash, location.pathname, navigate])

  const contactErrors = contacts.map(contactError)
  const contactsOk = contactErrors.every((e) => e === null)

  const generate = async () => {
    setBusy('key')
    setError(null)
    try {
      const next = await generateTrusteeKeyPair()
      setMaterial(next)
      setFingerprint(await fingerprintOf(next.publicKey))
      setDownloaded(false)
      setSaved(false)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const download = async () => {
    if (!material) return
    setBusy('file')
    setError(null)
    try {
      const file = await createTrusteeKeyFile(material, passphrase === '' ? null : passphrase)
      downloadTextFile('digital-legacy-trustee-key.json', serializeTrusteeKeyFile(file))
      setDownloaded(true)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const register = async () => {
    setShowErrors(true)
    if (!material || invite.trim() === '' || !contactsOk) return
    setBusy('register')
    setError(null)
    try {
      const registration = await registerTrustee(api, { inviteToken: invite, contacts, material })
      setResult(registration)
      remember({
        token: registration.response.accessToken,
        trusteeId: registration.response.trusteeId,
      })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  if (result) {
    return (
      <div className="page-stack">
        <PageHeader
          title="You are registered"
          description="Your public key is on file. The private half never left this browser."
        />
        {result.fingerprintMatches ? (
          <Callout tone="success" title="The server recorded your key correctly" role="status">
            <p>The fingerprint it reports is the one computed here.</p>
          </Callout>
        ) : (
          <Callout tone="danger" title="The fingerprint does not match" role="alert">
            <p>
              The server reports a different fingerprint than the key made in this browser. Do not
              continue. Tell the owner, who should not trust their server.
            </p>
          </Callout>
        )}
        <Card aria-labelledby="done-fp-title">
          <CardHeader>
            <CardTitle as="h2" id="done-fp-title">
              Read this fingerprint to the owner
            </CardTitle>
            <CardDescription>
              Call or meet them, and read it out. They compare it with what their screen shows
              before they lock any share to your key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Fingerprint value={fingerprint} label="Your key fingerprint" />
          </CardContent>
        </Card>
        <Card aria-labelledby="token-title">
          <CardHeader>
            <CardTitle as="h2" id="token-title">
              Your access token
            </CardTitle>
            <CardDescription>
              It lets you check status and vote, from any device. It is shown only now. This device
              will remember it; copy it if you want to use another.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="stack-3">
              <p className="code-block" aria-label="Access token">
                {result.response.accessToken}
              </p>
              <div className="row-wrap">
                <CopyButton text={result.response.accessToken} label="Copy token" />
                <Button onClick={() => void navigate('/trustee/portal')}>Go to my portal</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const ready = material !== null && downloaded && saved && invite.trim() !== '' && contactsOk

  return (
    <div className="page-stack">
      <PageHeader
        title="Accept your invite"
        description="Three short steps. Your private key is made on this device and is never uploaded."
      />
      <Card aria-labelledby="step1-title">
        <CardHeader>
          <CardTitle as="h2" id="step1-title">
            1. Your invite and how to reach you
          </CardTitle>
          <CardDescription>
            You are only contacted if the owner stops checking in. Add at least one way, in order of
            preference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            <Field
              label="Invite code"
              required
              error={
                showErrors && invite.trim() === ''
                  ? 'Paste the invite code you were sent.'
                  : undefined
              }
            >
              <Input
                value={invite}
                autoComplete="off"
                onChange={(e) => setInvite(e.target.value)}
                className="mono"
              />
            </Field>
            {contacts.map((c, i) => (
              <div key={i} className="step-fields">
                <Field label={`Contact ${i + 1} type`}>
                  <Select
                    value={c.channel}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((x, j) =>
                          j === i ? { ...x, channel: e.target.value as ChannelType } : x,
                        ),
                      )
                    }
                  >
                    {CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {CHANNEL_LABEL[ch]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={`Contact ${i + 1} address`}
                  error={showErrors ? (contactErrors[i] ?? undefined) : undefined}
                >
                  <Input
                    value={c.address}
                    autoComplete="off"
                    onChange={(e) =>
                      setContacts(
                        contacts.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)),
                      )
                    }
                  />
                </Field>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                disabled={contacts.length >= 5}
                onClick={() => setContacts([...contacts, { channel: 'SMS', address: '' }])}
              >
                Add another contact
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="step2-title">
        <CardHeader>
          <CardTitle as="h2" id="step2-title">
            2. Make your key and save it
          </CardTitle>
          <CardDescription>
            Your key pair is generated here. The public half is registered so the owner can lock
            your share to it. The private half is what unlocks the share later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            {!material ? (
              <div>
                <Button loading={busy === 'key'} onClick={() => void generate()}>
                  Generate my key
                </Button>
              </div>
            ) : (
              <>
                <div className="stack-2">
                  <span>
                    Your key fingerprint ({material.algorithm}). You will read this to the owner so
                    they know the key really is yours:
                  </span>
                  <Fingerprint value={fingerprint} label="Your key fingerprint" />
                </div>
                <Field
                  label="Passphrase for the key file (recommended)"
                  description="Protects the file if someone gets hold of it. You will need it every time you open your share."
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
                <div className="row-wrap">
                  <Button
                    variant="secondary"
                    loading={busy === 'file'}
                    onClick={() => void download()}
                  >
                    Download key file
                  </Button>
                  {downloaded ? <span role="status">Key file downloaded.</span> : null}
                </div>
                <Callout tone="warning" title="If you lose this file">
                  <p>
                    Your share can never be opened, and if too many trustees lose theirs the vault
                    is gone for good. Nobody, including the owner and us, can recreate it. Keep it
                    somewhere safe, ideally with a backup.
                  </p>
                </Callout>
                <Checkbox
                  checked={saved}
                  disabled={!downloaded}
                  onCheckedChange={(c) => setSaved(c === true)}
                  label="I have saved the key file somewhere safe"
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="step3-title">
        <CardHeader>
          <CardTitle as="h2" id="step3-title">
            3. Register your public key
          </CardTitle>
          <CardDescription>Only the public key and your contacts are sent.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            {error ? <ErrorNotice error={error} title="Could not complete this step" /> : null}
            <div>
              <Button
                loading={busy === 'register'}
                disabled={!ready}
                onClick={() => void register()}
              >
                Register my key
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

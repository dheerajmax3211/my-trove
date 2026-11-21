import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Callout } from '../../components/Callout'
import { CopyButton } from '../../components/CopyButton'
import { ErrorNotice } from '../../components/ErrorNotice'
import { KeyFilePicker } from '../../components/KeyFilePicker'
import {
  openTrusteeKeyFile,
  parseTrusteeKeyFile,
  setIdLabel,
  trusteeKeyFileNeedsPassphrase,
} from '../../crypto'
import { useTrusteeSession } from './TrusteeSession'
import { retrieveShare } from './trusteeService'

/** After release: fetch the sealed share and open it with the trustee's own key file, locally. */
export function UnsealCard() {
  const { api, myShare, setMyShare } = useTrusteeSession()
  const [fileText, setFileText] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const file = parseTrusteeKeyFile(fileText)
      const key = await openTrusteeKeyFile(
        file,
        trusteeKeyFileNeedsPassphrase(file) ? passphrase : null,
      )
      setMyShare(await retrieveShare(api, key))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card aria-labelledby="unseal-title">
      <CardHeader>
        <CardTitle as="h2" id="unseal-title">
          Open your share
        </CardTitle>
        <CardDescription>
          The vault has been released. Your sealed share can be opened only with your key file. This
          happens in your browser; the key file is never uploaded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {myShare ? (
          <div className="stack-3">
            <Callout tone="success" title="Your share is open" role="status">
              <p>
                It is share {myShare.share.x} of a split that needs {myShare.share.threshold} shares
                (set {setIdLabel(myShare.share)}). Give it only to the other trustees, never to the
                owner&apos;s server.
              </p>
            </Callout>
            <label htmlFor="my-share" className="small">
              Your share, as text
            </label>
            <textarea id="my-share" readOnly rows={3} className="code-block" value={myShare.text} />
            <div className="row-wrap">
              <CopyButton text={myShare.text} label="Copy my share" />
              <Link to="/trustee/combine">Go to the combine screen</Link>
            </div>
          </div>
        ) : (
          <form className="stack-3" onSubmit={(e) => void onSubmit(e)} noValidate>
            <KeyFilePicker label="Your key file" value={fileText} onChange={setFileText} />
            <Field label="Key file passphrase" description="Leave empty if you did not set one.">
              <Input
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </Field>
            {error ? <ErrorNotice error={error} title="Could not open your share" /> : null}
            <div>
              <Button type="submit" loading={busy} disabled={fileText.trim() === ''}>
                Fetch and open my share
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

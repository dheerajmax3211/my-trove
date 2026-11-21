import { Button, Dialog, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@platform/ui'
import { CopyButton } from '../../../components/CopyButton'
import { useClock } from '../../../lib/clock'
import { useIngestBaseUrl } from '../../../runtime'
import { ConnectSteps } from './ConnectSteps'
import { curlSnippet, mqttSnippet } from '../snippets'
import type { RegisteredDevice } from '../types'

export interface TokenDialogProps {
  registered: RegisteredDevice | null
  applianceName: string
  onDone: () => void
}

/**
 * Shows the ingestion token exactly once. It cannot be dismissed by a stray click or Escape: the only way out
 * is the Done button, so nobody loses the token by accident.
 */
export function TokenDialog({ registered, applianceName, onDone }: TokenDialogProps) {
  const clock = useClock()
  const ingestBaseUrl = useIngestBaseUrl()
  if (!registered) return null
  const { device, ingestionToken } = registered
  const snippet = {
    baseUrl: ingestBaseUrl,
    token: ingestionToken,
    deviceId: device.id,
    now: clock(),
  }

  return (
    <Dialog
      open
      onOpenChange={() => {}}
      dismissible={false}
      size="lg"
      title="Copy your ingestion token now"
      description={`${device.label} is registered for ${applianceName}. The device uses this token to send readings.`}
      footer={<Button onClick={onDone}>I have saved the token</Button>}
    >
      <div className="hp-stack-4">
        <ConnectSteps at="token" />
        <div role="alert" className="hp-warning-box">
          <strong>This is the only time you will see this token.</strong> We keep only a fingerprint
          of it, so it cannot be shown again. If you lose it, revoke this device and register a new
          one.
        </div>
        <div className="hp-stack-2">
          <label htmlFor="ingestion-token" className="hp-label-text">
            Ingestion token
          </label>
          <Input
            id="ingestion-token"
            readOnly
            value={ingestionToken}
            className="hp-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton text={ingestionToken} label="Copy token" />
        </div>
        <Tabs defaultValue="http">
          <TabsList aria-label="How to send readings">
            <TabsTrigger value="http">HTTPS (curl)</TabsTrigger>
            <TabsTrigger value="mqtt">MQTT</TabsTrigger>
          </TabsList>
          <TabsContent value="http">
            <div className="hp-stack-2">
              <p className="hp-small hp-muted">
                Send readings in batches of up to 1,000. Retries are safe: a reading that was
                already received is ignored.
              </p>
              {/* Scrollable region: keyboard focusable so long lines can be reached (WCAG 2.1.1). */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
              <pre className="hp-code-block" role="region" tabIndex={0} aria-label="curl example">
                {curlSnippet(snippet)}
              </pre>
              <CopyButton text={curlSnippet(snippet)} label="Copy curl command" />
            </div>
          </TabsContent>
          <TabsContent value="mqtt">
            <div className="hp-stack-2">
              <p className="hp-small hp-muted">
                MQTT messages carry no token. Secure your broker with per-device credentials and
                allow this device to publish only to its own topic.
              </p>
              {/* Scrollable region: keyboard focusable so long lines can be reached (WCAG 2.1.1). */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
              <pre className="hp-code-block" role="region" tabIndex={0} aria-label="MQTT example">
                {mqttSnippet(snippet)}
              </pre>
              <CopyButton text={`homepulse/${device.id}/reading`} label="Copy topic" />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Dialog>
  )
}

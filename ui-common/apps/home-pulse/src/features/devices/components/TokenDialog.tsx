import { Button, Dialog, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@platform/ui'
import { CopyButton } from '../../../components/CopyButton'
import { useClock } from '../../../lib/clock'
import { useIngestBaseUrl } from '../../../runtime'
import { ConnectSteps } from './ConnectSteps'
import {
  curlSnippet,
  esp32Snippet,
  homeAssistantSnippet,
  ingestUrl,
  mqttSnippet,
  mqttTopic,
  shellySnippet,
  tasmotaSnippet,
} from '../snippets'
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
        <div className="hp-stack-2">
          <p className="hp-label-text">What to do with the token</p>
          <ol className="hp-steps-list hp-small">
            <li>
              Pick how your plug or meter reports power below. Each option has a ready-made snippet
              with this token and your address already filled in.
            </li>
            <li>
              Paste the snippet into that device or into the small program that talks to it. The
              token goes in the <code>Authorization</code> header, after the word{' '}
              <code>Bearer</code>. It proves the readings come from this device and no other.
            </li>
            <li>
              The first reading shows up within a minute. After about a week Home Pulse has learned
              what is normal for {applianceName}.
            </li>
          </ol>
          <div className="hp-stack-2">
            <span className="hp-label-text">Send readings to this address</span>
            <code className="hp-mono hp-address">{ingestUrl(ingestBaseUrl)}</code>
            <CopyButton text={ingestUrl(ingestBaseUrl)} label="Copy address" />
          </div>
        </div>
        <Tabs defaultValue="http">
          <TabsList aria-label="How to send readings">
            <TabsTrigger value="http">curl</TabsTrigger>
            <TabsTrigger value="ha">Home Assistant</TabsTrigger>
            <TabsTrigger value="shelly">Shelly Plug</TabsTrigger>
            <TabsTrigger value="tasmota">Tasmota</TabsTrigger>
            <TabsTrigger value="esp32">ESP32</TabsTrigger>
            <TabsTrigger value="mqtt">MQTT</TabsTrigger>
          </TabsList>
          <TabsContent value="http">
            <Snippet
              label="curl example"
              intro="The plain way, for a script or to test the connection. Send readings in batches of up to 1,000. Retries are safe: a reading that was already received is ignored."
              code={curlSnippet(snippet)}
              copyLabel="Copy curl command"
            />
          </TabsContent>
          <TabsContent value="ha">
            <Snippet
              label="Home Assistant example"
              intro="If your plug is already in Home Assistant (Shelly, Tasmota, TP-Link, Zigbee and many more), this posts its power to Home Pulse every minute. Change the sensor name to yours."
              code={homeAssistantSnippet(snippet)}
              copyLabel="Copy Home Assistant config"
            />
          </TabsContent>
          <TabsContent value="shelly">
            <Snippet
              label="Shelly example"
              intro="For a second-generation Shelly Plug. Turn on MQTT in the Shelly settings and point it at your broker, then add this script. Needs the MQTT option on the Home Pulse server."
              code={shellySnippet(snippet)}
              copyLabel="Copy Shelly script"
            />
          </TabsContent>
          <TabsContent value="tasmota">
            <Snippet
              label="Tasmota example"
              intro="For a Tasmota plug that measures power. Point Tasmota at your MQTT broker, then paste these two lines into its console. Needs the MQTT option on the Home Pulse server."
              code={tasmotaSnippet(snippet)}
              copyLabel="Copy Tasmota rule"
            />
          </TabsContent>
          <TabsContent value="esp32">
            <Snippet
              label="ESP32 sketch"
              intro="For your own ESP32 with a power meter such as a PZEM-004T. Call sendReading with the current watts about once a minute."
              code={esp32Snippet(snippet)}
              copyLabel="Copy ESP32 code"
            />
          </TabsContent>
          <TabsContent value="mqtt">
            <Snippet
              label="MQTT example"
              intro="MQTT messages carry no token. Secure your broker with per-device credentials and allow this device to publish only to its own topic."
              code={mqttSnippet(snippet)}
              copyLabel="Copy topic"
              copyText={mqttTopic(device.id)}
            />
          </TabsContent>
        </Tabs>
        <p className="hp-small hp-muted">
          No hardware yet? Close this and use &quot;No hardware? Simulate a plug&quot; on the
          appliance. Simulated readings are always labelled Simulated.
        </p>
      </div>
    </Dialog>
  )
}

function Snippet({
  label,
  intro,
  code,
  copyLabel,
  copyText,
}: {
  label: string
  intro: string
  code: string
  copyLabel: string
  copyText?: string
}) {
  return (
    <div className="hp-stack-2">
      <p className="hp-small hp-muted">{intro}</p>
      {/* Scrollable region: keyboard focusable so long lines can be reached (WCAG 2.1.1). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <pre className="hp-code-block" role="region" tabIndex={0} aria-label={label}>
        {code}
      </pre>
      <CopyButton text={copyText ?? code} label={copyLabel} />
    </div>
  )
}

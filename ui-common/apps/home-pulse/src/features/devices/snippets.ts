export interface SnippetInput {
  /** Origin and path prefix the device should call, no trailing slash. */
  baseUrl: string
  token: string
  deviceId: string
  /** Timestamp used in the example reading. */
  now: Date
}

/** An HTTPS example for a script or an ESP32 firmware, authenticating with the device's own token. */
export function curlSnippet({ baseUrl, token, now }: SnippetInput): string {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/ingest/readings`
  return [
    `curl -X POST '${url}' \\`,
    `  -H 'Authorization: Bearer ${token}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"readings":[{"ts":"${now.toISOString()}","watts":118.4,"volts":229.8,"amps":0.52}]}'`,
  ].join('\n')
}

/** The topic and payload for devices that publish to an MQTT broker (Tasmota, Shelly, ESP32). */
export function mqttSnippet({ deviceId, now }: SnippetInput): string {
  return [
    `topic:    homepulse/${deviceId}/reading`,
    `payload:  {"watts":118.4,"volts":229.8,"amps":0.52,"ts":"${now.toISOString()}"}`,
  ].join('\n')
}

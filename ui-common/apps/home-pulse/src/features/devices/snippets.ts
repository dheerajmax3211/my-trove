export interface SnippetInput {
  /** Origin and path prefix the device should call, no trailing slash. */
  baseUrl: string
  token: string
  deviceId: string
  /** Timestamp used in the example reading. */
  now: Date
}

/** The one address every device posts readings to. */
export function ingestUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/v1/ingest/readings`
}

/** An HTTPS example for a script, using the device's own token. */
export function curlSnippet({ baseUrl, token, now }: SnippetInput): string {
  return [
    `curl -X POST '${ingestUrl(baseUrl)}' \\`,
    `  -H 'Authorization: Bearer ${token}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"readings":[{"ts":"${now.toISOString()}","watts":118.4,"volts":229.8,"amps":0.52}]}'`,
  ].join('\n')
}

/** The topic and payload for devices that publish to an MQTT broker (Tasmota, Shelly, ESP32). */
export function mqttSnippet({ deviceId, now }: SnippetInput): string {
  return [
    `topic:    ${mqttTopic(deviceId)}`,
    `payload:  {"watts":118.4,"volts":229.8,"amps":0.52,"ts":"${now.toISOString()}"}`,
  ].join('\n')
}

export function mqttTopic(deviceId: string): string {
  return `homepulse/${deviceId}/reading`
}

/** Home Assistant: a REST command plus an automation that posts the plug's power every minute. */
export function homeAssistantSnippet({ baseUrl, token }: SnippetInput): string {
  return [
    '# configuration.yaml',
    'rest_command:',
    '  home_pulse_reading:',
    `    url: "${ingestUrl(baseUrl)}"`,
    '    method: POST',
    '    headers:',
    `      Authorization: "Bearer ${token}"`,
    '      Content-Type: application/json',
    '    payload: >-',
    '      {"readings":[{"ts":"{{ utcnow().strftime(\'%Y-%m-%dT%H:%M:%SZ\') }}","watts":{{ states(watts_sensor) | float(0) }}}]}',
    '',
    "# automations.yaml (change sensor.my_plug_power to your plug's power sensor)",
    '- alias: Send power to Home Pulse',
    '  trigger:',
    '    - platform: time_pattern',
    '      minutes: "/1"',
    '  action:',
    '    - service: rest_command.home_pulse_reading',
    '      data:',
    '        watts_sensor: sensor.my_plug_power',
  ].join('\n')
}

/** Tasmota: publishes each power reading to the MQTT topic (needs the Home Pulse MQTT option and a broker). */
export function tasmotaSnippet({ deviceId }: SnippetInput): string {
  return [
    '# Tasmota console. Point Tasmota at your broker first (Configuration, Configure MQTT).',
    `Rule1 ON Energy#Power DO Publish ${mqttTopic(deviceId)} {"watts":%value%} ENDON`,
    'Rule1 1',
  ].join('\n')
}

/** Shelly (second generation and later): a script that publishes the plug's power to MQTT. */
export function shellySnippet({ deviceId }: SnippetInput): string {
  return [
    '// Shelly web UI, Scripts, Create script. Enable MQTT under Settings first.',
    `let TOPIC = "${mqttTopic(deviceId)}";`,
    'Shelly.addStatusHandler(function (status) {',
    '  if (status.name === "switch" && typeof status.delta.apower === "number") {',
    '    MQTT.publish(TOPIC, JSON.stringify({ watts: status.delta.apower }), 0, false);',
    '  }',
    '});',
  ].join('\n')
}

/** ESP32 (Arduino) with a power meter such as a PZEM-004T or a CT clamp: posts a reading over HTTPS or HTTP. */
export function esp32Snippet({ baseUrl, token }: SnippetInput): string {
  return [
    '#include <WiFi.h>',
    '#include <HTTPClient.h>',
    '#include <time.h>',
    '',
    `const char* URL = "${ingestUrl(baseUrl)}";`,
    `const char* TOKEN = "${token}";`,
    '',
    'void sendReading(float watts) {',
    '  struct tm t; getLocalTime(&t);            // call configTime(0, 0, "pool.ntp.org") in setup()',
    '  char ts[25]; strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", &t);',
    '  char body[160];',
    '  snprintf(body, sizeof body, "{\\"readings\\":[{\\"ts\\":\\"%s\\",\\"watts\\":%.1f}]}", ts, watts);',
    '  HTTPClient http;',
    '  http.begin(URL);',
    '  http.addHeader("Content-Type", "application/json");',
    '  http.addHeader("Authorization", String("Bearer ") + TOKEN);',
    '  http.POST(body);',
    '  http.end();',
    '}',
  ].join('\n')
}

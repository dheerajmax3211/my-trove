/** Mirrors DeviceController.DeviceResponse and RegisteredResponse. */
export interface DeviceDto {
  id: string
  applianceId: string
  label: string
  /** Non-secret hint such as `hpd_aB3dE9`; the full token is never shown again. */
  tokenPrefix: string
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
  active: boolean
  /** The built-in simulator, not a real plug. Anything it produces is labelled "Simulated". */
  simulated: boolean
  /** Readings the owner entered by hand (meter totals or CSV). It has no token and never reports by itself. */
  manual?: boolean
}

export interface RegisteredDevice {
  device: DeviceDto
  /** Shown exactly once, at registration. Only its hash is stored by the service. */
  ingestionToken: string
}

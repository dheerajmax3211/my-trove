import type { ApiClient } from '@platform/api-client'
import type { DeviceDto, RegisteredDevice } from './types'

export const devicesApi = (client: ApiClient) => ({
  list: (applianceId: string, signal?: AbortSignal) =>
    client.get<DeviceDto[]>(`/v1/appliances/${applianceId}/devices`, { signal }),
  register: (applianceId: string, label: string) =>
    client.post<RegisteredDevice>(`/v1/appliances/${applianceId}/devices`, { label }),
  revoke: (deviceId: string) => client.delete<void>(`/v1/devices/${deviceId}`),
})

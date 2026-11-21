import type { ApiClient } from '@platform/api-client'
import type { Reminder } from './types'

export const remindersApi = (client: ApiClient) => ({
  list: (days: number, signal?: AbortSignal) =>
    client.get<Reminder[]>('/v1/reminders', { query: { days }, signal }),
})

import { createApiClient, type ApiClient } from '@platform/api-client'
import { trusteePaths } from './paths'
import type {
  AcceptRequest,
  AcceptResponse,
  Decision,
  ShareView,
  TrusteeCiphertextView,
  TrusteeStateView,
  VoteResponse,
} from './types'

export interface TrusteeClientOptions {
  baseUrl: string
  /** The trustee access token, or null before the invite has been accepted. */
  token: string | null
  fetch?: typeof fetch
}

/**
 * The trustee portal's own API client. It never talks to Firebase: it authenticates with
 * `Authorization: Trustee <token>` and has no ID-token source, so an owner session can never leak
 * into it (and vice versa).
 */
export function createTrusteeClient({ baseUrl, token, fetch }: TrusteeClientOptions): ApiClient {
  return createApiClient({
    baseUrl,
    getToken: () => null,
    ...(token ? { headers: { Authorization: `Trustee ${token}` } } : {}),
    ...(fetch ? { fetch } : {}),
  })
}

export function createTrusteeApi(client: ApiClient) {
  return {
    accept: (body: AcceptRequest) =>
      client.post<AcceptResponse>(trusteePaths.accept, body, { auth: false }),
    me: () => client.get<TrusteeStateView>(trusteePaths.me),
    confirmShare: (shareDigest: string) =>
      client.post<TrusteeStateView>(trusteePaths.confirm, { shareDigest }),
    vote: (decision: Decision) => client.post<VoteResponse>(trusteePaths.approval, { decision }),
    getShare: () => client.get<ShareView>(trusteePaths.share),
    getCiphertext: () => client.get<TrusteeCiphertextView>(trusteePaths.ciphertext),
  }
}

export type TrusteeApi = ReturnType<typeof createTrusteeApi>

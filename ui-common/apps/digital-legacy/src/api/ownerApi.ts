import type { ApiClient } from '@platform/api-client'
import { ownerPaths } from './paths'
import type {
  ChainView,
  CiphertextView,
  CreateVaultRequest,
  InviteResponse,
  ShareUpload,
  StateView,
  SwitchPolicy,
  TimelineEntry,
  TrusteeView,
  UpdateVaultRequest,
  VaultSummary,
} from './types'

/** Typed calls to the owner endpoints. Every body here is ciphertext, a sealed envelope or metadata. */
export function createOwnerApi(client: ApiClient) {
  return {
    getVault: () => client.get<VaultSummary>(ownerPaths.vault),
    createVault: (body: CreateVaultRequest) => client.post<VaultSummary>(ownerPaths.vault, body),
    updateVault: (body: UpdateVaultRequest) => client.put<VaultSummary>(ownerPaths.vault, body),
    getCiphertext: () => client.get<CiphertextView>(ownerPaths.ciphertext),
    putPolicy: (policy: SwitchPolicy) => client.put<StateView>(ownerPaths.policy, policy),
    getState: () => client.get<StateView>(ownerPaths.state),
    arm: () => client.post<StateView>(ownerPaths.arm),
    disarm: () => client.post<StateView>(ownerPaths.disarm),
    checkIn: () => client.post<StateView>(ownerPaths.checkIn),
    pause: (durationSeconds: number) =>
      client.post<StateView>(ownerPaths.pause, { durationSeconds }),
    resume: () => client.post<StateView>(ownerPaths.resume),
    timeline: (limit = 100) =>
      client.get<TimelineEntry[]>(ownerPaths.timeline, { query: { limit } }),
    verifyAudit: () => client.get<ChainView>(ownerPaths.auditVerify),
    invite: (label: string) => client.post<InviteResponse>(ownerPaths.trustees, { label }),
    listTrustees: () => client.get<TrusteeView[]>(ownerPaths.trustees),
    revokeTrustee: (id: string) => client.delete<void>(ownerPaths.trustee(id)),
    uploadShare: (id: string, body: ShareUpload) =>
      client.put<TrusteeView>(ownerPaths.share(id), body),
  }
}

export type OwnerApi = ReturnType<typeof createOwnerApi>

/** Wire types, mirroring the digital-legacy service's DTO records (OwnerDtos, TrusteeDtos, SwitchPolicy). */

export type SwitchStateName = 'ACTIVE' | 'GRACE' | 'ESCALATING' | 'RELEASE_PENDING' | 'RELEASED'
export type ChannelType = 'PUSH' | 'EMAIL' | 'SMS'
export type Urgency = 'NOTICE' | 'WARNING' | 'URGENT' | 'FINAL'
export type Audience = 'OWNER' | 'TRUSTEES' | 'ALL'
export type TrusteeStatusName = 'INVITED' | 'ACCEPTED' | 'SHARE_UPLOADED' | 'CONFIRMED' | 'REVOKED'
export type TrusteePhase = 'WAITING' | 'VOTING' | 'RELEASED'
export type Decision = 'APPROVE' | 'DECLINE'

export const URGENCIES: readonly Urgency[] = ['NOTICE', 'WARNING', 'URGENT', 'FINAL']
export const AUDIENCES: readonly Audience[] = ['OWNER', 'TRUSTEES', 'ALL']
export const CHANNELS: readonly ChannelType[] = ['EMAIL', 'SMS', 'PUSH']

export interface Contact {
  channel: ChannelType
  address: string
}

export interface EscalationStep {
  offsetSeconds: number
  urgency: Urgency
  audience: Audience
  channels: ChannelType[]
}

/** All durations are whole seconds. */
export interface SwitchPolicy {
  checkInIntervalSeconds: number
  graceSeconds: number
  escalationDurationSeconds: number
  steps: EscalationStep[]
  coolOffSeconds: number
  quorum: number
  maxPauseSeconds: number
  ownerContacts: Contact[]
}

export interface VaultMetadata {
  v: number
  alg: string
  nonce: string
}

export interface VaultSummary {
  id: string
  state: SwitchStateName
  armed: boolean
  vaultVersion: number
  contentRevision: number
  ciphertextBytes: number
  ciphertextSha256: string
  metadata: VaultMetadata
  hasPolicy: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateVaultRequest {
  ciphertext: string
  metadata: VaultMetadata
}

export interface UpdateVaultRequest extends CreateVaultRequest {
  keyRotated: boolean
}

export interface CiphertextView {
  ciphertext: string
  metadata: VaultMetadata
  vaultVersion: number
  sha256: string
}

export interface InviteResponse {
  trusteeId: string
  label: string
  inviteToken: string
  inviteExpiresAt: string
}

export interface TrusteeView {
  id: string
  label: string
  status: TrusteeStatusName
  keyAlgorithm: string | null
  publicKey: string | null
  keyFingerprint: string | null
  shareUploaded: boolean
  shareVaultVersion: number | null
  shareCurrent: boolean
  shareConfirmed: boolean
  acceptedAt: string | null
  inviteExpiresAt: string | null
}

export interface ShareUpload {
  sealedShare: Record<string, unknown>
  vaultVersion: number
}

export interface Quorum {
  required: number
  approved: number
  declined: number
  trusteesActive: number
  trusteesHoldingShare: number
  quorumReachedAt: string | null
  releaseNotBefore: string | null
}

export interface PauseInfo {
  usedSeconds: number
  yearlyBudgetSeconds: number
  maxSingleSeconds: number
}

export interface Readiness {
  armable: boolean
  problems: string[]
}

export interface StateView {
  state: SwitchStateName
  armed: boolean
  epoch: number
  lastCheckInAt: string | null
  nextDueAt: string | null
  pausedUntil: string | null
  stateEnteredAt: string | null
  nextActionAt: string | null
  releasedAt: string | null
  escalation: { stepsExecuted: number; totalSteps: number }
  quorum: Quorum
  pause: PauseInfo
  readiness: Readiness
  policy: SwitchPolicy | null
}

export interface TimelineEntry {
  seq: number
  at: string
  actorKind: 'OWNER' | 'TRUSTEE' | 'SYSTEM'
  eventType: string
  detail: Record<string, unknown>
}

export interface ChainView {
  intact: boolean
  length: number
  headHash: string | null
  firstBadSeq: number | null
}

// ---- trustee portal ----------------------------------------------------------------------------

export interface AcceptRequest {
  inviteToken: string
  keyAlgorithm: string
  publicKey: string
  contacts: Contact[]
}

export interface AcceptResponse {
  trusteeId: string
  vaultId: string
  accessToken: string
  keyFingerprint: string
  scheme: string
}

export interface TrusteeStateView {
  trusteeId: string
  vaultId: string
  label: string
  status: TrusteeStatusName
  phase: TrusteePhase
  approvalsRequired: number
  shareUploaded: boolean
  shareDigest: string | null
  shareVaultVersion: number | null
  myDecision: Decision | null
  keyFingerprint: string | null
}

export interface VoteResponse {
  decision: Decision
  phase: TrusteePhase
  changed: boolean
}

export interface ShareView {
  vaultId: string
  trusteeId: string
  vaultVersion: number
  sealedShare: Record<string, unknown>
}

export interface TrusteeCiphertextView {
  vaultId: string
  vaultVersion: number
  ciphertext: string
  metadata: VaultMetadata
  sha256: string
}

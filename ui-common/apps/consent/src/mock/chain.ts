import type { AuditEntry, AuditEventType, ChainBreakReason, ChainReport } from '../shared/api/types'

export const GENESIS = '0'.repeat(64)

const MASK = (1n << 64n) - 1n
const PRIME = 0x100000001b3n

function fnv1a64(text: string, offset: bigint): bigint {
  let hash = offset
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i))
    hash = (hash * PRIME) & MASK
  }
  return hash
}

/**
 * Stand-in for the gateway's SHA-256: four salted FNV-1a rounds -> 64 hex characters. It is NOT
 * cryptographic; it only lets the mock detect edits, deletions and truncation the same way the
 * real chain does. Fields are length-prefixed so ("ab","c") and ("a","bc") never collide.
 */
export function chainHash(fields: readonly (string | number | null)[]): string {
  const text = fields.map((f) => (f === null ? '-' : `${String(f).length}:${String(f)}`)).join('|')
  return [0xcbf29ce484222325n, 0x84222325cbf29ce4n, 0x9e3779b97f4a7c15n, 0xc2b2ae3d27d4eb4fn]
    .map((offset) => fnv1a64(text, offset).toString(16).padStart(16, '0'))
    .join('')
}

function entryHash(ownerUid: string, e: Omit<AuditEntry, 'entryHash'>): string {
  return chainHash([
    e.prevHash,
    ownerUid,
    e.seq,
    e.eventType,
    e.actorType,
    e.actorId,
    e.clientId,
    e.grantId,
    e.detail,
    e.occurredAt,
  ])
}

export type TamperKind = 'edit-entry' | 'delete-entry' | 'truncate'

/** One owner's append-only, hash-chained audit log, with the same verification as the gateway. */
export class AuditChain {
  entries: AuditEntry[] = []
  head = { seq: 0, hash: GENESIS }

  constructor(private readonly ownerUid: string) {}

  append(
    at: Date,
    eventType: AuditEventType,
    actorType: 'OWNER' | 'CLIENT',
    actorId: string,
    clientId: string | null,
    grantId: string | null,
    detail: Record<string, unknown>,
  ): AuditEntry {
    const base: Omit<AuditEntry, 'entryHash'> = {
      seq: this.head.seq + 1,
      eventType,
      actorType,
      actorId,
      clientId,
      grantId,
      detail: JSON.stringify(detail),
      occurredAt: at.toISOString(),
      prevHash: this.head.hash,
    }
    const entry: AuditEntry = { ...base, entryHash: entryHash(this.ownerUid, base) }
    this.entries.push(entry)
    this.head = { seq: entry.seq, hash: entry.entryHash }
    return entry
  }

  /** Newest first. `beforeSeq` is exclusive. */
  history(limit: number, beforeSeq: number | null, clientId: string | null): AuditEntry[] {
    return this.entries
      .filter((e) => beforeSeq === null || e.seq < beforeSeq)
      .filter((e) => !clientId || e.clientId === clientId)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, Math.max(1, Math.min(limit, 500)))
  }

  verify(): ChainReport {
    const broken = (checked: number, seq: number, reason: ChainBreakReason): ChainReport => ({
      valid: false,
      entriesChecked: checked,
      firstBrokenSeq: seq,
      reason,
      headSeq: this.head.seq,
      headHash: this.head.hash,
    })
    let expectedSeq = 1
    let prev = GENESIS
    let checked = 0
    for (const e of [...this.entries].sort((a, b) => a.seq - b.seq)) {
      if (e.seq !== expectedSeq) {
        return broken(checked, e.seq > expectedSeq ? expectedSeq : e.seq, 'SEQUENCE_GAP')
      }
      if (e.prevHash !== prev) return broken(checked, e.seq, 'PREV_HASH_MISMATCH')
      if (entryHash(this.ownerUid, e) !== e.entryHash) {
        return broken(checked, e.seq, 'ENTRY_HASH_MISMATCH')
      }
      prev = e.entryHash
      expectedSeq += 1
      checked += 1
    }
    if (checked !== this.head.seq || prev !== this.head.hash) {
      return broken(checked, checked + 1, 'HEAD_MISMATCH')
    }
    return {
      valid: true,
      entriesChecked: checked,
      firstBrokenSeq: null,
      reason: null,
      headSeq: this.head.seq,
      headHash: this.head.hash,
    }
  }

  /** What a database superuser could do. The real gateway's trigger forbids it; verification catches it. */
  tamper(kind: TamperKind, seq?: number): void {
    const target = seq ?? Math.max(1, Math.ceil(this.entries.length / 2))
    switch (kind) {
      case 'edit-entry':
        this.entries = this.entries.map((e) =>
          e.seq === target ? { ...e, detail: JSON.stringify({ edited: true }) } : e,
        )
        break
      case 'delete-entry':
        this.entries = this.entries.filter((e) => e.seq !== target)
        break
      case 'truncate':
        this.entries = this.entries.slice(0, -1)
        break
    }
  }
}

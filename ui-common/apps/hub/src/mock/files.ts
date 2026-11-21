import { MAX_UPLOAD_BYTES } from '../features/files/limits'
import { HttpError, jsonResponse, noContent } from './http'
import {
  callerUid,
  intInRange,
  iso,
  optionalJsonObject,
  uuidParam,
  type MockEnv,
  type Route,
} from './route'
import { recordAudit, type FileRow } from './state'

const DEFAULT_LINK_TTL_SECONDS = 600

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Same basename rule as `FileService.sanitizeName`. */
function sanitizeName(name: string): string {
  const base = (name.replace(/\\/g, '/').split('/').pop() ?? '').replace(/\p{Cc}/gu, '')
  return base.trim() === '' ? 'file' : base.slice(-255)
}

export function createFileRoutes({ state, now }: MockEnv): Route[] {
  const memberOf = (uid: string, householdId: string) =>
    state.members.find((m) => m.householdId === householdId && m.uid === uid)

  const requireHouseholdMember = (uid: string, householdId: string) => {
    if (!memberOf(uid, householdId) || !state.households.has(householdId))
      throw new HttpError(404, 'Household not found')
  }

  const view = (f: FileRow) => ({
    id: f.id,
    ownerUid: f.ownerUid,
    householdId: f.householdId,
    name: f.name,
    contentType: f.contentType,
    sizeBytes: f.sizeBytes,
    sha256: f.sha256,
    createdAt: iso(f.createdAt),
  })

  const loadVisible = (uid: string, id: string): FileRow => {
    const f = state.files.get(id)
    const visible =
      f && (f.householdId === null ? f.ownerUid === uid : memberOf(uid, f.householdId))
    if (!f || !visible) throw new HttpError(404, 'File not found')
    return f
  }

  const audit = (uid: string, f: FileRow, action: string, details: Record<string, unknown>) =>
    recordAudit(state, now(), uid, f.householdId, action, 'file', f.id, details)

  return [
    {
      method: 'POST',
      pattern: /^\/v1\/files$/,
      handle: async (req) => {
        const uid = callerUid(req)
        if (!(req.body instanceof FormData))
          throw new HttpError(400, 'Content-Type must be multipart/form-data')
        const file = req.body.get('file')
        if (!(file instanceof Blob))
          throw new HttpError(400, "Required part 'file' is not present.")
        const householdValue = req.body.get('householdId')
        const householdId =
          typeof householdValue === 'string' && householdValue !== ''
            ? uuidParam(householdValue, 'householdId')
            : null
        if (householdId) requireHouseholdMember(uid, householdId)
        if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Maximum upload size exceeded')
        const bytes = new Uint8Array(await file.arrayBuffer())
        const name = sanitizeName(file instanceof File ? file.name : '')
        const row: FileRow = {
          id: state.nextId(),
          ownerUid: uid,
          householdId,
          name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: bytes.byteLength,
          sha256: await sha256Hex(bytes),
          createdAt: now(),
          bytes,
        }
        state.files.set(row.id, row)
        audit(uid, row, 'file.uploaded', { name, sizeBytes: row.sizeBytes, sha256: row.sha256 })
        return jsonResponse(view(row), 201)
      },
    },
    {
      method: 'GET',
      pattern: /^\/v1\/files$/,
      handle: (req) => {
        const uid = callerUid(req)
        const householdParam = req.query.get('householdId')
        const householdId = householdParam ? uuidParam(householdParam, 'householdId') : null
        if (householdId) requireHouseholdMember(uid, householdId)
        const list = [...state.files.values()]
          .filter((f) =>
            householdId
              ? f.householdId === householdId
              : f.householdId === null
                ? f.ownerUid === uid
                : memberOf(uid, f.householdId),
          )
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
          .slice(0, 500)
          .map(view)
        return jsonResponse(list)
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/v1\/files\/([^/]+)$/,
      handle: (req) => {
        const uid = callerUid(req)
        const f = loadVisible(uid, uuidParam(req.params[0], 'id'))
        if (f.ownerUid !== uid && f.householdId && memberOf(uid, f.householdId)?.role !== 'OWNER')
          throw new HttpError(403, 'Requires household role OWNER')
        state.files.delete(f.id)
        audit(uid, f, 'file.deleted', { name: f.name })
        return noContent()
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/files\/([^/]+)\/download-link$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        const body = optionalJsonObject(req.body)
        const ttlSeconds =
          body?.ttlSeconds == null ? DEFAULT_LINK_TTL_SECONDS : intInRange(body.ttlSeconds, 1, 3600)
        const f = loadVisible(uid, id)
        const expiresAt = now() + ttlSeconds * 1000
        const token = `mock.${f.id}.${Math.floor(expiresAt / 1000)}`
        audit(uid, f, 'file.download_link_issued', { expiresAt: iso(expiresAt) })
        return jsonResponse({
          token,
          url: `/v1/files/download?token=${encodeURIComponent(token)}`,
          expiresAt: iso(expiresAt),
        })
      },
    },
  ]
}

/** The public, token-authorised download. Tampered, malformed and expired tokens all give the same 403. */
export function downloadFile({ state, now }: MockEnv, token: string | null): Response {
  const invalidToken = new HttpError(403, 'Invalid or expired download token')
  const match = /^mock\.([^.]+)\.(\d+)$/.exec(token ?? '')
  if (!match) throw invalidToken
  const file = state.files.get(match[1] ?? '')
  if (!file || Number(match[2]) * 1000 < now()) throw invalidToken
  return new Response(file.bytes, {
    status: 200,
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.sizeBytes),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}

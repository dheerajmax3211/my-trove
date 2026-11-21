import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callsTo, pageHeading, renderHub } from '../../test/renderHub'
import { MAX_UPLOAD_BYTES } from './limits'

const FILES = '/api/shared/v1/files'
const fileList = () => screen.findByRole('list', { name: 'Files' })

afterEach(() => vi.restoreAllMocks())

async function upload(user: ReturnType<typeof renderHub>['user'], file: File) {
  await pageHeading('Files')
  await user.upload(screen.getByLabelText('File'), file)
  await user.click(screen.getByRole('button', { name: 'Upload' }))
}

describe('files', () => {
  it('shows an empty state before anything is uploaded', async () => {
    renderHub({ route: '/files' })
    expect(await screen.findByRole('heading', { name: 'No files yet' })).toBeInTheDocument()
  })

  it('uploads a file as multipart and lists it', async () => {
    const { user, requests } = renderHub({ route: '/files' })
    await upload(user, new File(['hello'], 'notes.txt', { type: 'text/plain' }))

    expect(await screen.findByText('File uploaded')).toBeInTheDocument()
    const post = callsTo(requests, 'POST', FILES)[0]
    expect(post?.body).toBeInstanceOf(FormData)
    expect((post?.body as FormData).get('file')).toHaveProperty('name', 'notes.txt')
    expect((post?.body as FormData).has('householdId')).toBe(false)
    const item = (await within(await fileList()).findByText('notes.txt')).closest('li')!
    expect(within(item).getByText(/5 B, Personal/)).toBeInTheDocument()
    expect(within(item).getByText('TXT')).toBeInTheDocument()
  })

  it('uploads into a household and filters by it', async () => {
    const { user, requests } = renderHub({ seed: 'demo', route: '/files' })
    await within(await fileList()).findByText('Home insurance summary.txt')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Save to' }), 'Rivera household')
    await user.upload(
      screen.getByLabelText('File'),
      new File(['x'], 'deed.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await screen.findByText('File uploaded')
    expect(typeof (callsTo(requests, 'POST', FILES)[0]?.body as FormData).get('householdId')).toBe(
      'string',
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show files for' }),
      'Personal only',
    )
    expect(await screen.findByRole('heading', { name: 'No files yet' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Files' })).not.toBeInTheDocument()
  })

  it('refuses a missing file or one over the limit before uploading', async () => {
    const { user, requests } = renderHub({ route: '/files' })
    await pageHeading('Files')
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText('Choose a file to upload.')).toBeInTheDocument()

    const big = new File(['x'], 'big.bin')
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })
    fireEvent.change(screen.getByLabelText('File'), { target: { files: [big] } })
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText(/The limit is 10 MB/)).toBeInTheDocument()
    expect(callsTo(requests, 'POST', FILES)).toHaveLength(0)
  })

  it('creates a signed link and downloads the file bytes through it', async () => {
    const saved: string[] = []
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })

    const { user, requests } = renderHub({ seed: 'demo', route: '/files' })
    await user.click(
      await screen.findByRole('button', { name: 'Get link for Home insurance summary.txt' }),
    )
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByRole('combobox'), '1 hour')
    await user.click(within(dialog).getByRole('button', { name: 'Create link' }))

    const link = callsTo(requests, 'POST', /download-link$/)[0]
    expect(link?.body).toEqual({ ttlSeconds: 3600 })
    const field = await within(dialog).findByRole('textbox', { name: 'Download link' })
    expect((field as HTMLInputElement).value).toMatch(/\/api\/shared\/v1\/files\/download\?token=/)
    expect(within(dialog).getByText(/Anyone with this link can download/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(saved).toEqual(['Home insurance summary.txt']))
    const blob = createUrl.mock.calls[0]?.[0] as Blob
    expect(await blob.text()).toContain('Home insurance summary')
    // The public download carries no bearer token: the signed link is the credential.
    const download = callsTo(requests, 'GET', /files\/download$/)
    expect(download).toHaveLength(1)
    expect(download[0]?.authorized).toBe(false)
  })

  it('shows a clear failure when the link has expired', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const { user, runtime } = renderHub({ seed: 'demo', route: '/files' })
    await user.click(
      await screen.findByRole('button', { name: 'Get link for Home insurance summary.txt' }),
    )
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByRole('combobox'), '1 minute')
    await user.click(within(dialog).getByRole('button', { name: 'Create link' }))
    await within(dialog).findByRole('textbox', { name: 'Download link' })
    runtime.demo?.advanceClock(120_000)
    await user.click(within(dialog).getByRole('button', { name: 'Download' }))
    expect(await screen.findByText('Download failed')).toBeInTheDocument()
    expect(screen.getByText('Invalid or expired download token')).toBeInTheDocument()
  })

  it('deletes a file after confirmation', async () => {
    const { user, requests } = renderHub({ seed: 'demo', route: '/files' })
    await user.click(
      await screen.findByRole('button', { name: 'Delete Home insurance summary.txt' }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete file' }),
    )
    expect(await screen.findByText('File deleted')).toBeInTheDocument()
    expect(callsTo(requests, 'DELETE', /files\/[^/]+$/)).toHaveLength(1)
    expect(await screen.findByRole('heading', { name: 'No files yet' })).toBeInTheDocument()
  })

  it('hides Delete from a household member who did not upload the file', async () => {
    const { user } = renderHub({ seed: 'demo', route: '/files' })
    await within(await fileList()).findByText('Home insurance summary.txt')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Switch demo user' }), 'demo-bob')
    expect(
      await screen.findByRole('button', { name: 'Get link for Home insurance summary.txt' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })
})

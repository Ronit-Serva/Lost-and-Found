import assert from 'node:assert/strict'
import { Image } from 'imagescript'
import { createReportPhotoHandler, type PhotoDependencies, type PhotoMember } from '../report-photo/handler.ts'

const reportId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
function fixture(overrides: Partial<PhotoDependencies> = {}) {
  let uploaded: Uint8Array | null = null
  let registered = false
  let removed = false
  const member: PhotoMember = {
    id: ownerId,
    store: async (_path, bytes) => { uploaded = bytes },
    register: async () => { registered = true },
    remove: async () => { removed = true },
  }
  const handler = createReportPhotoHandler({ origin: 'http://localhost:5173', authenticate: async () => member, ...overrides })
  return { handler, uploaded: () => uploaded, registered: () => registered, removed: () => removed }
}
function request(body?: Uint8Array | string, headers: Record<string, string> = {}) {
  const bodyData = body instanceof Uint8Array
    ? new Blob([body.slice().buffer as ArrayBuffer])
    : body
  return new Request('https://example.test/report-photo', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer test-session', 'x-report-id': reportId, ...headers },
    body: bodyData,
  })
}

Deno.test('auth, membership, origin, method, and report ID gate photo processing', async () => {
  const blocked = fixture()
  assert.equal((await blocked.handler(request(new Uint8Array([1]), { Authorization: '' }))).status, 401)
  assert.equal((await blocked.handler(request(new Uint8Array([1]), { Origin: 'https://evil.test' }))).status, 403)
  assert.equal((await blocked.handler(request(new Uint8Array([1]), { 'x-report-id': 'bad' }))).status, 400)
  assert.equal((await blocked.handler(new Request('https://example.test/report-photo', { method: 'GET' }))).status, 403)
  const outsider = fixture({ authenticate: async () => null })
  assert.equal((await outsider.handler(request(new Uint8Array([1])))).status, 403)
  assert.equal(blocked.uploaded(), null)
})

Deno.test('sanitized image is stored and registered without source metadata', async () => {
  const marker = 'PRIVATE_IMAGE_METADATA_MARKER'
  const source = await new Image(30, 18).fill(0x336699ff).encodePNG({ metadata: { author: marker } })
  const photo = fixture()
  const response = await photo.handler(request(source, { 'Content-Type': 'image/png' }))
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.width, 30)
  assert.match(result.path, new RegExp(`^${reportId}/[0-9a-f-]+\\.jpg$`))
  assert.equal(result.path.includes(ownerId), false)
  assert.equal(new TextDecoder().decode(photo.uploaded()!).includes(marker), false)
  assert.equal(photo.registered(), true)
  assert.equal(photo.removed(), false)
})

Deno.test('report registration failure deletes the newly uploaded object', async () => {
  let removed = false
  const handler = createReportPhotoHandler({ origin: 'http://localhost:5173', authenticate: async () => ({
    id: ownerId,
    store: async () => undefined,
    register: async () => { throw new Error('limit') },
    remove: async () => { removed = true },
  }) })
  const source = await new Image(8, 8).fill(0x112233ff).encodePNG()
  assert.equal((await handler(request(source))).status, 409)
  assert.equal(removed, true)
})

Deno.test('oversized and invalid images are rejected before storage', async () => {
  const photo = fixture()
  assert.equal((await photo.handler(request(new Uint8Array(5 * 1024 * 1024 + 1)))).status, 413)
  assert.equal((await photo.handler(request(new TextEncoder().encode('<svg/>')))).status, 400)
  assert.equal(photo.uploaded(), null)
})

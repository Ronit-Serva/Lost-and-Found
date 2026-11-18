import { IMAGE_LIMITS, sanitizeImage } from '../_shared/image.ts'

export type PhotoMember = {
  id: string
  store: (path: string, bytes: Uint8Array) => Promise<void>
  register: (reportId: string, path: string, width: number, height: number, bytes: number) => Promise<void>
  remove: (path: string) => Promise<void>
}
export type PhotoDependencies = {
  origin: string
  authenticate: (token: string) => Promise<PhotoMember | null>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const headers = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'apikey,authorization,content-type,x-client-info,x-report-id',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
})
const json = (status: number, body: unknown, origin: string) => new Response(JSON.stringify(body), {
  status, headers: { ...headers(origin), 'Content-Type': 'application/json' },
})

async function readBounded(request: Request) {
  if (!request.body) throw new Error('empty')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > IMAGE_LIMITS.inputBytes) {
        await reader.cancel()
        throw new Error('large')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export function createReportPhotoHandler(deps: PhotoDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? ''
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(deps.origin) })
    if (origin !== deps.origin) return json(403, { error: 'Origin not allowed' }, deps.origin)
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, deps.origin)
    const authorization = request.headers.get('authorization') ?? ''
    const tokenMatch = /^Bearer ([^\s]+)$/i.exec(authorization)
    if (!tokenMatch) return json(401, { error: 'Sign in required' }, deps.origin)
    const reportId = request.headers.get('x-report-id') ?? ''
    if (!UUID.test(reportId)) return json(400, { error: 'Invalid report' }, deps.origin)
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > IMAGE_LIMITS.inputBytes) return json(413, { error: 'Image exceeds 5 MB' }, deps.origin)

    let member: PhotoMember | null
    try { member = await deps.authenticate(tokenMatch[1]) } catch { return json(401, { error: 'Session could not be verified' }, deps.origin) }
    if (!member) return json(403, { error: 'University access required' }, deps.origin)

    let source: Uint8Array
    let image: Awaited<ReturnType<typeof sanitizeImage>>
    try {
      source = await readBounded(request)
      image = await sanitizeImage(source)
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'large'
      return json(tooLarge ? 413 : 400, { error: tooLarge ? 'Image exceeds 5 MB' : 'Use a valid JPEG or PNG image' }, deps.origin)
    }

    const path = `${reportId}/${crypto.randomUUID()}.jpg`
    try {
      await member.store(path, image.bytes)
      try {
        await member.register(reportId, path, image.width, image.height, image.bytes.length)
      } catch {
        await member.remove(path).catch(() => undefined)
        return json(409, { error: 'Photo could not be attached to this report' }, deps.origin)
      }
      return json(201, { path, width: image.width, height: image.height }, deps.origin)
    } catch {
      return json(500, { error: 'Photo could not be saved' }, deps.origin)
    }
  }
}

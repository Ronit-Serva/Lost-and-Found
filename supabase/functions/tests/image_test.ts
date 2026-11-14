import assert from 'node:assert/strict'
import { Image } from 'imagescript'
import { IMAGE_LIMITS, imageDimensions, sanitizeImage } from '../_shared/image.ts'

Deno.test('image validation rejects fake, oversized, truncated and excessive-pixel inputs', async () => {
  await assert.rejects(sanitizeImage(new TextEncoder().encode('<svg/>')))
  await assert.rejects(sanitizeImage(new Uint8Array(IMAGE_LIMITS.inputBytes + 1)))
  await assert.rejects(sanitizeImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])))
  const png = new Uint8Array(24)
  png.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(png.buffer)
  view.setUint32(8, 13); view.setUint32(12, 0x49484452)
  view.setUint32(16, 100_000); view.setUint32(20, 100_000)
  await assert.rejects(sanitizeImage(png), /dimensions/)
})

Deno.test('PNG image is re-encoded without metadata and resized', async () => {
  const marker = 'PHASE2_SYNTHETIC_METADATA'
  const input = await new Image(1700, 40).fill(0x3377aaff).encodePNG({ metadata: { author: marker, comment: marker } })
  assert.equal(new TextDecoder().decode(input).includes(marker), true)
  const result = await sanitizeImage(input)
  const decoded = await Image.decode(result.bytes)
  assert.equal(result.contentType, 'image/jpeg')
  assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 1600, height: 38 })
  assert.equal(new TextDecoder().decode(result.bytes).includes(marker), false)
  assert.ok(result.bytes.length <= IMAGE_LIMITS.outputBytes)
  assert.deepEqual(imageDimensions(input), { width: 1700, height: 40 })
})

Deno.test('JPEG metadata is removed and transparency is flattened on white', async () => {
  const marker = 'SYNTHETIC_GPS_NAME_MARKER'
  const source = new Image(24, 16).fill(0x113355ff)
  const jpeg = await source.encodeJPEG({ metadata: { author: marker, comment: marker } })
  assert.equal(new TextDecoder().decode(jpeg).includes(marker), true)
  assert.deepEqual(imageDimensions(jpeg), { width: 24, height: 16 })
  const clean = await sanitizeImage(jpeg)
  assert.equal(new TextDecoder().decode(clean.bytes).includes(marker), false)
  const transparent = await sanitizeImage(await new Image(8, 8).encodePNG())
  const decoded = await Image.decode(transparent.bytes)
  assert.ok(decoded.bitmap[0] > 245 && decoded.bitmap[1] > 245 && decoded.bitmap[2] > 245)
})

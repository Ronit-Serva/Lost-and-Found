import { Image } from 'imagescript'

export const IMAGE_LIMITS = {
  inputBytes: 5 * 1024 * 1024,
  pixels: 12_000_000,
  edge: 1600,
  targetBytes: 250_000,
  outputBytes: 500_000,
}

// Inspect dimensions before a decoder can allocate a large RGBA bitmap.
export function imageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  ) {
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) {
      throw new Error('Invalid PNG header')
    }
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker')
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) break
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) {
        throw new Error('Truncated JPEG')
      }
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (size < 8) throw new Error('Invalid JPEG frame')
        return {
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
        }
      }
      offset += size
    }
  }
  throw new Error('Use a valid JPEG or PNG image')
}

export async function sanitizeImage(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > IMAGE_LIMITS.inputBytes) {
    throw new Error('Image must be at most 5 MB')
  }
  const dimensions = imageDimensions(bytes)
  if (
    !dimensions.width || !dimensions.height ||
    dimensions.width * dimensions.height > IMAGE_LIMITS.pixels
  ) throw new Error('Image dimensions exceed the processing limit')
  const decoded = await Image.decode(bytes)
  // Copy pixels into a new image; no EXIF, text metadata or gain map is forwarded.
  const clean = new Image(decoded.width, decoded.height)
  clean.bitmap = decoded.bitmap
  if (Math.max(clean.width, clean.height) > IMAGE_LIMITS.edge) {
    clean.resize(
      clean.width >= clean.height
        ? { width: IMAGE_LIMITS.edge }
        : { height: IMAGE_LIMITS.edge },
    )
  }
  // Flatten transparency on white before JPEG encoding.
  const pixels = clean.bitmap
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255
    for (let channel = 0; channel < 3; channel++) {
      pixels[i + channel] = Math.round(
        pixels[i + channel] * alpha + 255 * (1 - alpha),
      )
    }
    pixels[i + 3] = 255
  }
  let output: Uint8Array = new Uint8Array()
  for (const quality of [80, 65, 50]) {
    output = await clean.encodeJPEG({
      quality,
      metadata: { software: '' },
      gainMap: false,
    })
    if (output.length <= IMAGE_LIMITS.targetBytes) break
  }
  if (output.length > IMAGE_LIMITS.outputBytes) {
    throw new Error('Please provide a smaller image')
  }
  return {
    bytes: output,
    width: clean.width,
    height: clean.height,
    contentType: 'image/jpeg',
  }
}


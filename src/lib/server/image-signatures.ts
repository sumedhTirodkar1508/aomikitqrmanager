// server-only: used only in server actions for image upload validation.

const SIGNATURES: Array<{ mime: string; magic: number[] }> = [
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png",  magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/gif",  magic: [0x47, 0x49, 0x46, 0x38] },
  // WebP: RIFF????WEBP — bytes 0-3 are RIFF, bytes 8-11 are WEBP
]

function matchesPrefix(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false
  return magic.every((b, i) => bytes[i] === b)
}

function isWebP(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  return (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
}

/**
 * Detect the MIME type of a file from its magic bytes.
 * Returns null if no known signature matches.
 */
export function detectMime(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (matchesPrefix(bytes, sig.magic)) return sig.mime
  }
  if (isWebP(bytes)) return "image/webp"
  return null
}

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIMES.has(mime)
}

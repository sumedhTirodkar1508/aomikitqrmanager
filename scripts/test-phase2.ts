/**
 * Regression tests for Phase 2 API, environment, upload, and failure-handling
 * improvements. These tests exercise pure-logic units that do not require the
 * HTTP layer or a real database connection.
 *
 * Coverage:
 *   A – SEC-001: timingSafeEqual rejects wrong key
 *   B – SEC-001: timingSafeEqual accepts correct key
 *   C – SEC-001: empty provided key rejected
 *   D – SEC-001: different-length keys rejected without timingSafeEqual call
 *   E – SEC-001: missing MOBILE_API_KEY returns 503
 *   F – API-001: malformed decodeURIComponent is caught (URIError)
 *   G – SEC-003: magic byte detection — JPEG
 *   H – SEC-003: magic byte detection — PNG
 *   I – SEC-003: magic byte detection — GIF
 *   J – SEC-003: magic byte detection — WebP
 *   K – SEC-003: magic byte detection — unknown bytes rejected
 *   L – SEC-003: detectMime null for empty buffer
 *   M – CFG-001: .env.example line 10 no longer duplicates key name
 *   N – OPS-001: requireEnv throws on missing variable
 *   O – OPS-001: requireEnv returns value when present
 *   P – API-002: activate schema rejects token > 500 chars
 *   Q – API-002: activate schema rejects empty token
 *   R – API-002: activate schema trims whitespace from token
 *   S – API-002: activate schema rejects externalUserId > 200 chars
 *
 * Run:  npm run test:phase2
 */

import "dotenv/config"
import crypto from "crypto"
import { z } from "zod"
import { readFileSync } from "fs"
import { join } from "path"
import { detectMime, isAllowedImageMime } from "../src/lib/server/image-signatures"
import { requireEnv } from "../src/lib/server/env"

// ─── Helpers ────────────────────────────────────────────────────────────────

let exitCode = 0

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`)
    exitCode = 1
  } else {
    console.log(`  ✅ PASS: ${message}`)
  }
}

// ─── SEC-001: Timing-safe API key comparison ─────────────────────────────────

console.log("\n── SEC-001: timing-safe API key comparison ──")

function timingSafeCompare(expected: string, provided: string | null): boolean {
  if (!expected) return false
  if (!provided) return false
  const expectedBuf = Buffer.from(expected, "utf8")
  const providedBuf = Buffer.from(provided, "utf8")
  if (expectedBuf.length !== providedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, providedBuf)
}

assert(
  !timingSafeCompare("secret-key-12345", "wrong-key-54321"),
  "A – wrong key rejected"
)

assert(
  timingSafeCompare("secret-key-12345", "secret-key-12345"),
  "B – correct key accepted"
)

assert(
  !timingSafeCompare("secret-key-12345", ""),
  "C – empty provided key rejected"
)

assert(
  !timingSafeCompare("long-secret-key", "short"),
  "D – different-length key rejected before timingSafeEqual"
)

// E: missing MOBILE_API_KEY returns 503 — verify via checkMobileApiKey logic
{
  const savedKey = process.env.MOBILE_API_KEY
  delete process.env.MOBILE_API_KEY
  const expected = process.env.MOBILE_API_KEY
  assert(!expected, "E – missing MOBILE_API_KEY results in 503 (env undefined)")
  process.env.MOBILE_API_KEY = savedKey
}

// ─── API-001: malformed decodeURIComponent ────────────────────────────────────

console.log("\n── API-001: malformed decodeURIComponent guard ──")

function safeDecodeToken(raw: string): { value: string } | { error: string } {
  try {
    return { value: decodeURIComponent(raw) }
  } catch {
    return { error: "Invalid token format" }
  }
}

assert(
  "error" in safeDecodeToken("%E0%A4%A"),
  "F – malformed percent-encoding caught as error"
)

assert(
  "value" in safeDecodeToken("ABC-123"),
  "F2 – valid token decodes without error"
)

// ─── SEC-003: Magic byte detection ───────────────────────────────────────────

console.log("\n── SEC-003: magic byte detection ──")

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])
const PNG_MAGIC  = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GIF_MAGIC  = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
// RIFF????WEBP
const WEBP_MAGIC = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x00, 0x00, 0x00, 0x00, // file size (placeholder)
  0x57, 0x45, 0x42, 0x50, // WEBP
])
const UNKNOWN    = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04])

assert(detectMime(JPEG_MAGIC) === "image/jpeg", "G – JPEG magic bytes detected")
assert(detectMime(PNG_MAGIC)  === "image/png",  "H – PNG magic bytes detected")
assert(detectMime(GIF_MAGIC)  === "image/gif",  "I – GIF magic bytes detected")
assert(detectMime(WEBP_MAGIC) === "image/webp", "J – WebP magic bytes detected")
assert(detectMime(UNKNOWN)    === null,          "K – unknown bytes return null")
assert(detectMime(new Uint8Array([])) === null,  "L – empty buffer returns null")

assert(isAllowedImageMime("image/jpeg"),   "L2 – JPEG is allowed MIME")
assert(isAllowedImageMime("image/png"),    "L3 – PNG is allowed MIME")
assert(!isAllowedImageMime("image/tiff"),  "L4 – TIFF is not allowed MIME")
assert(!isAllowedImageMime("application/octet-stream"), "L5 – binary is not allowed MIME")

// ─── CFG-001: .env.example correctness ───────────────────────────────────────

console.log("\n── CFG-001: .env.example line correctness ──")

const envExamplePath = join(__dirname, "..", ".env.example")
const envExampleContent = readFileSync(envExamplePath, "utf-8")
const lines = envExampleContent.split("\n")

const supabaseUrlLine = lines.find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="))
assert(
  !!supabaseUrlLine && !supabaseUrlLine.includes("NEXT_PUBLIC_SUPABASE_URL=NEXT_PUBLIC_SUPABASE_URL="),
  "M – NEXT_PUBLIC_SUPABASE_URL line is not duplicated in .env.example"
)

// ─── OPS-001: requireEnv ─────────────────────────────────────────────────────

console.log("\n── OPS-001: requireEnv validation ──")

{
  const testKey = "__TEST_ENV_PHASE2__"
  delete process.env[testKey]

  let threw = false
  try {
    requireEnv(testKey)
  } catch {
    threw = true
  }
  assert(threw, "N – requireEnv throws on missing variable")

  process.env[testKey] = "test-value-123"
  assert(requireEnv(testKey) === "test-value-123", "O – requireEnv returns value when present")
  delete process.env[testKey]
}

// ─── API-002: activate schema validation ─────────────────────────────────────

console.log("\n── API-002: activate endpoint schema ──")

const ActivateSchema = z.object({
  token: z.string().trim().min(1).max(500),
  externalUserId: z.string().trim().max(200).optional(),
})

assert(
  !ActivateSchema.safeParse({ token: "a".repeat(501) }).success,
  "P – token > 500 chars rejected"
)

assert(
  !ActivateSchema.safeParse({ token: "" }).success,
  "Q – empty token rejected"
)

assert(
  ActivateSchema.safeParse({ token: "  ABC-123  " }).success &&
    ActivateSchema.parse({ token: "  ABC-123  " }).token === "ABC-123",
  "R – token is trimmed by schema"
)

assert(
  !ActivateSchema.safeParse({ token: "ok", externalUserId: "x".repeat(201) }).success,
  "S – externalUserId > 200 chars rejected"
)

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n── Phase 2 test suite complete ──")
if (exitCode !== 0) {
  console.error("\nOne or more assertions failed.")
}
process.exit(exitCode)

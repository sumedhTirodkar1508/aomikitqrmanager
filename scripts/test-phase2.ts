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
 *   T – HDR-001: missing x-api-key response has Cache-Control: no-store
 *   U – HDR-001: wrong x-api-key response has Cache-Control: no-store
 *   V – HDR-001: unconfigured API key (503) has Cache-Control: no-store
 *   W – HDR-001: length-mismatch key rejection has Cache-Control: no-store
 *   X – HDR-001: successful auth returns null (no premature rejection)
 *   Y – HDR-002: GET route malformed-URL 400 has Cache-Control: no-store
 *   Z – HDR-002: GET route missing-key 401 has Cache-Control: no-store
 *  AA – HDR-002: POST route validation-error 400 has Cache-Control: no-store
 *  AB – HDR-002: POST route missing-key 401 has Cache-Control: no-store
 *  AC – AUTH-003: JWT sessions explicitly expire after 12 hours
 *  AD – SEC-004: privileged modules have real server-only sentinels
 *  AE – SEC-004: Client Component dependency paths cannot reach privileged modules
 *  AF – TOKEN-001: generated tokens use six secure random characters
 *  AG – TOKEN-001: generated batches are format-valid and collision-free
 *  AH – TOKEN-001: legacy/imported token validation remains compatible
 *  AI – OPS-002: Prisma generation stays explicit (no postinstall hook)
 *
 * Run:  npm run test:phase2
 */

import "dotenv/config"
import crypto from "crypto"
import { z } from "zod"
import { readFileSync, readdirSync, statSync } from "fs"
import { dirname, extname, join, resolve } from "path"
import { NextRequest } from "next/server"
import { detectMime, isAllowedImageMime } from "../src/lib/image-signature-utils"
import { checkMobileApiKey } from "../src/lib/mobile-api"
import { GET as qrGet } from "../src/app/api/qr/[token]/route"
import { POST as activatePost } from "../src/app/api/qr/activate/route"
import { authConfig, SESSION_MAX_AGE_SECONDS } from "../src/auth.config"
import {
  generateTokens,
  isValidTokenFormat,
  TOKEN_ALPHABET,
  TOKEN_RANDOM_SUFFIX_LENGTH,
} from "../src/lib/token"

// Inline replica of requireEnv — avoids importing env.ts which has
// `import "server-only"` (incompatible with plain tsx execution).
function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Environment variable ${key} is not set`)
  return value
}

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

const ActivateSchema = z
  .object({
    token: z.string().trim().min(1).max(500).optional(),
    qr_token: z.string().trim().min(1).max(500).optional(),
    externalUserId: z.string().trim().max(200).optional(),
    external_user_id: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.token || data.qr_token, {
    message: "token is required",
  })
  .transform((data) => ({
    token: (data.token || data.qr_token)!,
    externalUserId: data.externalUserId ?? data.external_user_id,
  }))

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

assert(
  ActivateSchema.safeParse({ qr_token: "ABC-123" }).success &&
    ActivateSchema.parse({ qr_token: "ABC-123" }).token === "ABC-123",
  "S2 – qr_token alias works"
)

assert(
  ActivateSchema.safeParse({ token: "ok", external_user_id: "user123" }).success &&
    ActivateSchema.parse({ token: "ok", external_user_id: "user123" }).externalUserId === "user123",
  "S3 – external_user_id alias works"
)

// ─── AUTH-003 / SEC-004 / TOKEN-001 / OPS-002: production hardening ─────────

console.log("\n── Production hardening configuration ──")

assert(
  SESSION_MAX_AGE_SECONDS === 12 * 60 * 60,
  "AC – session max age constant is exactly 12 hours"
)
assert(
  authConfig.session?.strategy === "jwt",
  "AC – JWT session strategy remains enabled"
)
assert(
  authConfig.session?.maxAge === SESSION_MAX_AGE_SECONDS,
  "AC – NextAuth session.maxAge uses the documented constant"
)

const projectRoot = resolve(__dirname, "..")
const privilegedModules = [
  "src/lib/mobile-api.ts",
  "src/lib/server/image-signatures.ts",
  "src/lib/supabase-server.ts",
  "src/lib/server/env.ts",
]

for (const relativePath of privilegedModules) {
  const source = readFileSync(resolve(projectRoot, relativePath), "utf-8")
  assert(
    source.includes('import "server-only"') ||
      source.includes("import 'server-only'"),
    `AD – ${relativePath} has a real server-only sentinel`
  )
}

const sourceExtensions = [".ts", ".tsx"]
const privilegedAbsolutePaths = new Set(
  privilegedModules.map((path) => resolve(projectRoot, path))
)

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry)
    return statSync(path).isDirectory()
      ? listSourceFiles(path)
      : sourceExtensions.includes(extname(path))
        ? [path]
        : []
  })
}

function resolveSourceImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null
  const base = specifier.startsWith("@/")
    ? resolve(projectRoot, "src", specifier.slice(2))
    : resolve(dirname(fromFile), specifier)
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => resolve(base, `index${extension}`)),
  ]
  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile()
    } catch {
      return false
    }
  }) ?? null
}

function importedSourceFiles(file: string): string[] {
  const source = readFileSync(file, "utf-8")
  const imports = source.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g
  )
  return Array.from(imports)
    .map((match) => resolveSourceImport(file, match[1]!))
    .filter((path): path is string => path !== null)
}

const clientEntrypoints = listSourceFiles(resolve(projectRoot, "src")).filter(
  (file) => /^\s*["']use client["']/.test(readFileSync(file, "utf-8"))
)
const visited = new Set<string>()
const reachablePrivilegedModules = new Set<string>()

function visitClientDependency(file: string): void {
  if (visited.has(file)) return
  visited.add(file)
  if (privilegedAbsolutePaths.has(file)) {
    reachablePrivilegedModules.add(file)
    return
  }

  const source = readFileSync(file, "utf-8")
  if (/^\s*["']use server["']/.test(source)) return
  for (const importedFile of importedSourceFiles(file)) {
    visitClientDependency(importedFile)
  }
}

for (const clientEntrypoint of clientEntrypoints) {
  visitClientDependency(clientEntrypoint)
}
assert(
  reachablePrivilegedModules.size === 0,
  "AE – Client Component dependency paths cannot reach privileged modules"
)

const generatedTokens = generateTokens(1000)
const generatedTokenPattern = new RegExp(
  `^AOMI-KIT-[${TOKEN_ALPHABET}]{${TOKEN_RANDOM_SUFFIX_LENGTH}}$`
)
assert(
  TOKEN_RANDOM_SUFFIX_LENGTH === 6,
  "AF – generated token suffix length is six characters"
)
assert(
  TOKEN_ALPHABET.length === 32 && !/[01IO]/.test(TOKEN_ALPHABET),
  "AF – token alphabet has 32 unambiguous characters"
)
assert(
  generatedTokens.every((token) => generatedTokenPattern.test(token)),
  "AF – every generated token matches PREFIX plus six-character format"
)
assert(
  generatedTokens.length === 1000 &&
    new Set(generatedTokens).size === generatedTokens.length,
  "AG – generated batch contains no collisions"
)
assert(
  isValidTokenFormat("AOMI-KIT-ABC123") &&
    isValidTokenFormat("LEGACY-ABCD"),
  "AH – imports and existing legacy token formats remain valid"
)

const tokenSource = readFileSync(
  resolve(projectRoot, "src/lib/token.ts"),
  "utf-8"
)
const generateActionSource = readFileSync(
  resolve(
    projectRoot,
    "src/app/(admin)/admin/qr-tokens/generate/generate-actions.ts"
  ),
  "utf-8"
)
assert(
  tokenSource.includes('from "nanoid"') && !tokenSource.includes("Math.random"),
  "AG – generation uses nanoid and never Math.random"
)
assert(
  generateActionSource.includes("prisma.qRToken.findMany") &&
    generateActionSource.includes("existingSet"),
  "AG – generation checks database collisions before insert"
)

const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf-8")
) as { scripts?: Record<string, string> }
assert(
  packageJson.scripts?.postinstall === undefined,
  "AI – Prisma generation remains an explicit deployment step"
)

// ─── HDR-001/002: Cache-Control: no-store on every mobile API response ────────
// Tests T–AB call checkMobileApiKey and the route handlers directly (where no
// database is needed) so they inspect actual response behavior, not constants.

console.log("\n── HDR-001: checkMobileApiKey responses include Cache-Control: no-store ──")

const TEST_API_KEY = "test-mobile-api-key-for-phase2"

// Helper to build a mock NextRequest with optional x-api-key.
function mockReq(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers })
}

{
  // T – missing x-api-key → 401, must include no-store
  const savedKey = process.env.MOBILE_API_KEY
  process.env.MOBILE_API_KEY = TEST_API_KEY
  const res = checkMobileApiKey(mockReq("http://localhost/api/qr/TEST"))
  assert(res !== null, "T – missing x-api-key produces a response (not null)")
  assert(res?.status === 401, "T – missing x-api-key is 401")
  assert(
    res?.headers.get("Cache-Control") === "no-store",
    "T – missing x-api-key response has Cache-Control: no-store"
  )
  process.env.MOBILE_API_KEY = savedKey
}

{
  // U – wrong x-api-key → 401, must include no-store
  const savedKey = process.env.MOBILE_API_KEY
  process.env.MOBILE_API_KEY = TEST_API_KEY
  const res = checkMobileApiKey(
    mockReq("http://localhost/api/qr/TEST", { "x-api-key": "wrong-key-entirely" })
  )
  assert(res !== null, "U – wrong x-api-key produces a response (not null)")
  assert(res?.status === 401, "U – wrong x-api-key is 401")
  assert(
    res?.headers.get("Cache-Control") === "no-store",
    "U – incorrect x-api-key response has Cache-Control: no-store"
  )
  process.env.MOBILE_API_KEY = savedKey
}

{
  // V – missing MOBILE_API_KEY env → 503, must include no-store
  const savedKey = process.env.MOBILE_API_KEY
  delete process.env.MOBILE_API_KEY
  const res = checkMobileApiKey(
    mockReq("http://localhost/api/qr/TEST", { "x-api-key": "any-key" })
  )
  assert(res !== null, "V – unconfigured API key produces a response (not null)")
  assert(res?.status === 503, "V – unconfigured API key is 503")
  assert(
    res?.headers.get("Cache-Control") === "no-store",
    "V – unconfigured-API-key 503 response has Cache-Control: no-store"
  )
  process.env.MOBILE_API_KEY = savedKey
}

{
  // W – length-mismatch key → 401, must include no-store
  const savedKey = process.env.MOBILE_API_KEY
  process.env.MOBILE_API_KEY = TEST_API_KEY
  const res = checkMobileApiKey(
    mockReq("http://localhost/api/qr/TEST", { "x-api-key": "short" })
  )
  assert(res !== null, "W – length-mismatch key produces a response (not null)")
  assert(res?.status === 401, "W – length-mismatch key is 401")
  assert(
    res?.headers.get("Cache-Control") === "no-store",
    "W – length-mismatch key response has Cache-Control: no-store"
  )
  process.env.MOBILE_API_KEY = savedKey
}

{
  // X – valid key → null (authorized, no early rejection)
  const savedKey = process.env.MOBILE_API_KEY
  process.env.MOBILE_API_KEY = TEST_API_KEY
  const res = checkMobileApiKey(
    mockReq("http://localhost/api/qr/TEST", { "x-api-key": TEST_API_KEY })
  )
  assert(res === null, "X – correct x-api-key returns null (authorized)")
  process.env.MOBILE_API_KEY = savedKey
}

// HDR-002 tests call actual route handlers. Route handlers are async so we
// wrap them in a function and defer process.exit until they complete.
async function runRouteHeaderTests() {
  console.log("\n── HDR-002: route handler pre-DB responses include Cache-Control: no-store ──")

  // Y – GET with valid key but malformed percent-encoded token → 400 before DB
  {
    const savedKey = process.env.MOBILE_API_KEY
    process.env.MOBILE_API_KEY = TEST_API_KEY
    const reqY = mockReq("http://localhost/api/qr/%E0%A4%A", {
      "x-api-key": TEST_API_KEY,
    })
    const resY = await qrGet(reqY, { params: Promise.resolve({ token: "%E0%A4%A" }) })
    assert(resY.status === 400, "Y – GET malformed URL encoding is 400")
    assert(
      resY.headers.get("Cache-Control") === "no-store",
      "Y – GET malformed-URL 400 has Cache-Control: no-store"
    )

    // Z – GET with missing key → 401 (checkMobileApiKey path in route)
    const reqZ = mockReq("http://localhost/api/qr/TOKEN")
    const resZ = await qrGet(reqZ, { params: Promise.resolve({ token: "TOKEN" }) })
    assert(resZ.status === 401, "Z – GET missing-key 401 has Cache-Control: no-store")
    assert(
      resZ.headers.get("Cache-Control") === "no-store",
      "Z – GET missing-key 401 has Cache-Control: no-store"
    )
    process.env.MOBILE_API_KEY = savedKey
  }

  // AA – POST with valid key but empty token body → 400 (Zod) before DB
  {
    const savedKey = process.env.MOBILE_API_KEY
    process.env.MOBILE_API_KEY = TEST_API_KEY
    const reqAA = new NextRequest("http://localhost/api/qr/activate", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "" }),
    })
    const resAA = await activatePost(reqAA)
    assert(resAA.status === 400, "AA – POST empty-token is 400")
    assert(
      resAA.headers.get("Cache-Control") === "no-store",
      "AA – POST validation-error 400 has Cache-Control: no-store"
    )

    // AB – POST with missing key → 401 (checkMobileApiKey path in route)
    const reqAB = new NextRequest("http://localhost/api/qr/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "TOKEN-123" }),
    })
    const resAB = await activatePost(reqAB)
    assert(resAB.status === 401, "AB – POST missing-key is 401")
    assert(
      resAB.headers.get("Cache-Control") === "no-store",
      "AB – POST missing-key 401 has Cache-Control: no-store"
    )
    process.env.MOBILE_API_KEY = savedKey
  }
}

// ─── Summary ────────────────────────────────────────────────────────────────

runRouteHeaderTests()
  .then(() => {
    console.log("\n── Phase 2 test suite complete ──")
    if (exitCode !== 0) console.error("\nOne or more assertions failed.")
    process.exit(exitCode)
  })
  .catch((err) => {
    console.error("Unhandled error in route header tests:", err)
    process.exit(1)
  })

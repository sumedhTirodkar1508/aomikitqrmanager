// server-only: this module reads MOBILE_API_KEY and must never be imported
// from a Client Component or the browser bundle.
import crypto from "crypto"
import { NextResponse, type NextRequest } from "next/server"

// Every response from the mobile API must be non-cacheable, including auth
// failures, so intermediaries cannot serve stale error responses.
const NO_STORE = { "Cache-Control": "no-store" } as const

/**
 * Validate the `x-api-key` header against the configured MOBILE_API_KEY.
 *
 * Uses `crypto.timingSafeEqual` to prevent timing-based key enumeration.
 * Different-length keys are rejected before the equal-length comparison.
 *
 * Returns an error NextResponse when invalid, or null when authorized.
 * Never logs either key.
 */
export function checkMobileApiKey(req: NextRequest): NextResponse | null {
  const expected = process.env.MOBILE_API_KEY
  if (!expected) {
    return NextResponse.json(
      { error: "Mobile API is not configured" },
      { status: 503, headers: NO_STORE }
    )
  }

  const provided = req.headers.get("x-api-key")
  if (!provided) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE })
  }

  // timingSafeEqual requires equal-length Buffers. Reject mismatched lengths
  // before the comparison (leaking length is acceptable given key format docs).
  const expectedBuf = Buffer.from(expected, "utf8")
  const providedBuf = Buffer.from(provided, "utf8")
  if (expectedBuf.length !== providedBuf.length) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE })
  }

  if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE })
  }

  return null
}

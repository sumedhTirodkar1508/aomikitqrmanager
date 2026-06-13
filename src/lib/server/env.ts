// server-only: reads process.env secrets — never import from Client Components.

let validated = false

/**
 * Validate required environment variables at first call rather than module
 * load so `next build` works in CI environments where secrets are absent.
 *
 * Call this once at server startup or from the first request handler that
 * needs env vars validated.
 */
export function validateEnv(): void {
  if (validated) return
  validated = true

  const required: string[] = [
    "DATABASE_URL",
    "AUTH_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MOBILE_API_KEY",
  ]

  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    )
  }
}

/** Retrieve a required env var, throwing clearly if absent. */
export function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`)
  }
  return value
}
